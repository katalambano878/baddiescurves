/**
 * Application-layer authorization for /rest/v1 (replaces Supabase RLS).
 *
 * Modes:
 * - service / admin|staff: full access
 * - anon: public catalog reads, contact/review inserts, one order by exact order_number
 * - authenticated customer: own-row access on private tables
 */

import { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/db/auth";
import { FK_MAP } from "@/lib/db/fk-map";

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

/**
 * Tables a visitor may insert into from the browser.
 * Orders and order items are NOT here: checkout goes through
 * /api/storefront/orders, which prices the order on the server.
 */
const ANON_INSERT = new Set(["contact_submissions", "reviews"]);

/** Rows a signed-in customer owns through a user_id column. */
const USER_OWNED = new Set(["cart_items", "wishlist_items", "addresses"]);

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

/** Profile fields a customer may never set on their own row. */
const PROFILE_LOCKED_FIELDS = new Set(["id", "role", "email", "created_at"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** True only for an exact `column=eq.<value>` filter with a non-empty value. */
function hasExactFilter(params: URLSearchParams, column: string): boolean {
  const all = params.getAll(column);
  return all.length === 1 && all[0].startsWith("eq.") && all[0].length > 3;
}

function filterEquals(params: URLSearchParams, column: string, value: string): boolean {
  const all = params.getAll(column);
  return all.length === 1 && all[0] === `eq.${value}`;
}

/**
 * Names of every table embedded in a PostgREST select string, e.g.
 * `*, order_items(*, products(name))` → ["order_items", "products"].
 */
export function embeddedTables(select: string | null): string[] {
  if (!select) return [];
  const out: string[] = [];
  const re = /([a-z_][a-z0-9_]*)\s*(?:![a-z0-9_]+\s*)*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(select))) out.push(m[1].toLowerCase());
  return out;
}

/**
 * A select may pull other tables in through embeds, which would otherwise
 * skip the table rules below. Non-admins may only embed public catalogue
 * tables, plus an order's own items.
 */
function embedsAllowed(table: string, select: string | null): boolean {
  for (const token of embeddedTables(select)) {
    if (PUBLIC_READ.has(token)) continue;
    if (token === "order_items" && table === "orders") continue;
    // `alias:fk_column(...)` form: the token is a foreign-key column. Allow it
    // only when every table that column can point at is public.
    const targets = Object.values(FK_MAP)
      .flat()
      .filter((edge) => edge.column === token)
      .map((edge) => edge.foreignTable);
    if (targets.length > 0 && targets.every((t) => PUBLIC_READ.has(t))) continue;
    return false;
  }
  return true;
}

function bodyRows(body: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(body)) {
    return body.every((r) => r && typeof r === "object" && !Array.isArray(r))
      ? (body as Record<string, unknown>[])
      : null;
  }
  if (body && typeof body === "object") return [body as Record<string, unknown>];
  return null;
}

export type AclDecision =
  | {
      allow: true;
      /** Filters added to the query whatever the client sent. */
      forcedFilters?: Record<string, string>;
      /** Column values set on every written row whatever the client sent. */
      forcedValues?: Record<string, unknown>;
    }
  | { allow: false; status: number; message: string };

const deny = (status: number, message: string): AclDecision => ({ allow: false, status, message });

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
    return deny(403, "Admin access required");
  }

  const userId = actor.kind === "user" ? actor.userId : null;

  if (method === "GET") {
    if (!embedsAllowed(table, params.get("select"))) {
      return deny(403, "That related data is not available");
    }

    if (PUBLIC_READ.has(table)) return { allow: true };

    if (table === "orders") {
      // One order, looked up by its exact order number or id (guest order pages).
      if (hasExactFilter(params, "order_number")) return { allow: true };
      const byId = params.getAll("id");
      if (byId.length === 1 && byId[0].startsWith("eq.") && UUID_RE.test(byId[0].slice(3))) {
        return { allow: true };
      }
      if (userId) return { allow: true, forcedFilters: { user_id: `eq.${userId}` } };
      return deny(401, "Authentication required to list orders");
    }

    if (table === "order_items") {
      const orderId = params.getAll("order_id");
      if (orderId.length === 1 && orderId[0].startsWith("eq.") && UUID_RE.test(orderId[0].slice(3))) {
        return { allow: true };
      }
      return deny(401, "Authentication required");
    }

    if (table === "profiles") {
      if (!userId) return deny(401, "Authentication required");
      return { allow: true, forcedFilters: { id: `eq.${userId}` } };
    }

    if (USER_OWNED.has(table)) {
      if (!userId) return deny(401, "Authentication required");
      return { allow: true, forcedFilters: { user_id: `eq.${userId}` } };
    }

    return deny(403, "Table not publicly readable");
  }

  if (method === "POST") {
    const rows = bodyRows(body);
    if (!rows || rows.length === 0) return deny(400, "Invalid request body");
    if (rows.length > 100) return deny(400, "Too many rows");

    if (table === "contact_submissions") return { allow: true };

    if (table === "reviews") {
      // New reviews always wait for approval.
      return {
        allow: true,
        forcedValues: {
          status: "pending",
          verified_purchase: false,
          helpful_votes: 0,
          user_id: userId,
        },
      };
    }

    if (!userId) {
      return ANON_INSERT.has(table)
        ? { allow: true }
        : deny(401, "Authentication required");
    }

    if (USER_OWNED.has(table)) {
      return { allow: true, forcedValues: { user_id: userId } };
    }

    if (table === "profiles") {
      return { allow: true, forcedValues: { id: userId, role: "customer" } };
    }

    return deny(403, "Write access denied");
  }

  if (method === "PATCH" || method === "PUT") {
    if (!userId) return deny(401, "Authentication required");
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return deny(400, "Invalid request body");
    }
    const keys = Object.keys(body as object);

    if (table === "profiles") {
      const locked = keys.find((k) => PROFILE_LOCKED_FIELDS.has(k));
      if (locked) return deny(403, `Field '${locked}' cannot be updated by clients`);
      return { allow: true, forcedFilters: { id: `eq.${userId}` } };
    }

    if (USER_OWNED.has(table)) {
      return {
        allow: true,
        forcedFilters: { user_id: `eq.${userId}` },
        forcedValues: { user_id: userId },
      };
    }

    return deny(403, "Update not allowed");
  }

  if (method === "DELETE") {
    if (userId && USER_OWNED.has(table)) {
      return { allow: true, forcedFilters: { user_id: `eq.${userId}` } };
    }
    return deny(403, "Delete not allowed");
  }

  return deny(405, "Method not allowed");
}

/** Sets the forced column values on a row or list of rows. */
export function applyForcedValues<T>(body: T, forced?: Record<string, unknown>): T {
  if (!forced) return body;
  if (Array.isArray(body)) {
    return body.map((row) => ({ ...(row as object), ...forced })) as unknown as T;
  }
  return { ...(body as object), ...forced } as T;
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
