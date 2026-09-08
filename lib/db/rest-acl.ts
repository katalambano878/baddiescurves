/**
 * Application-layer authorization for /rest/v1 (replaces Supabase RLS).
 *
 * Modes:
 * - service / admin|staff: full access
 * - anon: public catalog reads + guest checkout inserts + order lookup by order_number
 * - authenticated customer: own-row access on private tables
 */

import { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/db/auth";

export type RestActor =
  | { kind: "service" }
  | { kind: "admin"; userId: string; role: string }
  | { kind: "user"; userId: string; role: string }
  | { kind: "anon" };

const PUBLIC_READ = new Set([
  "products",
  "categories",
  "product_images",
  "product_variants",
  "banners",
  "cms_content",
  "store_modules",
  "pages",
  "site_settings",
  "reviews",
  "review_images",
]);

const PUBLIC_INSERT = new Set([
  "orders",
  "order_items",
  "contact_submissions",
  "reviews",
]);

const ADMIN_ONLY_TABLES = new Set([
  "customers",
  "coupons",
  "audit_logs",
  "store_settings",
  "payment_events",
  "notification_events",
  "support_tickets",
  "support_messages",
  "return_requests",
  "return_items",
  "blog_posts",
  "navigation_menus",
  "navigation_items",
  "schema_migrations",
]);

const PAYMENT_LOCKED_FIELDS = new Set([
  "payment_status",
  "payment_provider",
  "payment_transaction_id",
  "status",
  "total",
  "subtotal",
  "tax_total",
  "shipping_total",
  "discount_total",
]);

function headerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

function isServiceKey(token: string | null, apiKey: string | null): boolean {
  const service =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    "";
  if (!service) return false;
  return (!!token && token === service) || (!!apiKey && apiKey === service);
}

export async function resolveRestActor(req: NextRequest): Promise<RestActor> {
  const token = headerToken(req);
  const apiKey = req.headers.get("apikey");

  if (isServiceKey(token, apiKey)) {
    return { kind: "service" };
  }

  if (!token) return { kind: "anon" };

  const verified = await verifyAccessToken(token);
  if (!verified) return { kind: "anon" };

  const role = String(
    verified.payload?.app_metadata?.role ||
      verified.payload?.role ||
      "customer"
  ).toLowerCase();

  if (role === "admin" || role === "staff") {
    return { kind: "admin", userId: verified.userId, role };
  }

  return { kind: "user", userId: verified.userId, role: role || "customer" };
}

function hasFilter(params: URLSearchParams, column: string): boolean {
  for (const key of params.keys()) {
    if (key === column || key.startsWith(`${column}.`)) return true;
  }
  // PostgREST style: user_id=eq.uuid
  return params.has(column);
}

function filterEquals(params: URLSearchParams, column: string, value: string): boolean {
  const raw = params.get(column);
  if (!raw) return false;
  return raw === `eq.${value}` || raw === value;
}

export type AclDecision =
  | { allow: true; forcedFilters?: Record<string, string> }
  | { allow: false; status: number; message: string };

export function authorizeRestAccess(opts: {
  actor: RestActor;
  table: string;
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  params: URLSearchParams;
  body?: unknown;
}): AclDecision {
  const { actor, table, method, params, body } = opts;

  if (actor.kind === "service" || actor.kind === "admin") {
    return { allow: true };
  }

  if (ADMIN_ONLY_TABLES.has(table)) {
    return { allow: false, status: 403, message: "Admin access required" };
  }

  if (method === "DELETE") {
    return { allow: false, status: 403, message: "Delete not allowed" };
  }

  if (method === "GET") {
    if (PUBLIC_READ.has(table)) return { allow: true };

    if (table === "orders") {
      if (hasFilter(params, "order_number")) return { allow: true };
      if (actor.kind === "user") {
        if (filterEquals(params, "user_id", actor.userId)) return { allow: true };
        return {
          allow: true,
          forcedFilters: { user_id: `eq.${actor.userId}` },
        };
      }
      return {
        allow: false,
        status: 401,
        message: "Authentication required to list orders",
      };
    }

    if (table === "order_items") {
      // Only via embed from orders in practice; block bare listing for anon
      if (actor.kind === "user") return { allow: true };
      if (hasFilter(params, "order_id")) return { allow: true };
      return { allow: false, status: 401, message: "Authentication required" };
    }

    if (table === "profiles") {
      if (actor.kind !== "user") {
        return { allow: false, status: 401, message: "Authentication required" };
      }
      if (filterEquals(params, "id", actor.userId)) return { allow: true };
      return { allow: true, forcedFilters: { id: `eq.${actor.userId}` } };
    }

    if (table === "cart_items" || table === "wishlist_items" || table === "addresses") {
      if (actor.kind !== "user") {
        return { allow: false, status: 401, message: "Authentication required" };
      }
      return { allow: true, forcedFilters: { user_id: `eq.${actor.userId}` } };
    }

    return { allow: false, status: 403, message: "Table not publicly readable" };
  }

  if (method === "POST") {
    if (table === "store_modules") {
      return { allow: false, status: 403, message: "Admin access required" };
    }

    if (!PUBLIC_INSERT.has(table) && actor.kind !== "user") {
      return { allow: false, status: 401, message: "Authentication required" };
    }

    if (table === "profiles" || table === "cart_items" || table === "wishlist_items" || table === "addresses") {
      if (actor.kind !== "user") {
        return { allow: false, status: 401, message: "Authentication required" };
      }
    }

    if (table === "orders" && body && typeof body === "object") {
      const row = Array.isArray(body) ? body[0] : body;
      if (row && typeof row === "object") {
        const paymentStatus = (row as any).payment_status;
        if (paymentStatus && paymentStatus !== "pending") {
          return {
            allow: false,
            status: 403,
            message: "Cannot set payment_status on create",
          };
        }
      }
    }

    return { allow: true };
  }

  if (method === "PATCH" || method === "PUT") {
    if (table === "store_modules") {
      return { allow: false, status: 403, message: "Admin access required" };
    }

    if (actor.kind !== "user") {
      return { allow: false, status: 401, message: "Authentication required" };
    }

    if (body && typeof body === "object" && !Array.isArray(body)) {
      for (const key of Object.keys(body as object)) {
        if (PAYMENT_LOCKED_FIELDS.has(key) && table === "orders") {
          return {
            allow: false,
            status: 403,
            message: `Field '${key}' cannot be updated by clients`,
          };
        }
      }
    }

    if (table === "profiles") {
      if (filterEquals(params, "id", actor.userId)) return { allow: true };
      return { allow: true, forcedFilters: { id: `eq.${actor.userId}` } };
    }

    if (table === "orders") {
      // Users may update non-payment fields on their own orders only
      if (filterEquals(params, "user_id", actor.userId)) return { allow: true };
      return { allow: true, forcedFilters: { user_id: `eq.${actor.userId}` } };
    }

    if (table === "cart_items" || table === "wishlist_items" || table === "addresses") {
      return { allow: true, forcedFilters: { user_id: `eq.${actor.userId}` } };
    }

    if (PUBLIC_READ.has(table)) {
      return { allow: false, status: 403, message: "Write access denied" };
    }

    return { allow: false, status: 403, message: "Update not allowed" };
  }

  return { allow: false, status: 405, message: "Method not allowed" };
}

export function applyForcedFilters(
  params: URLSearchParams,
  forced?: Record<string, string>
): URLSearchParams {
  if (!forced) return params;
  const next = new URLSearchParams(params);
  for (const [k, v] of Object.entries(forced)) {
    next.set(k, v);
  }
  return next;
}
