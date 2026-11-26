import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  applyPostgrestParams,
} from "@/lib/db/supabase-compat";
import { isPlainPostgres } from "@/lib/db/mode";
import {
  applyForcedFilters,
  applyForcedValues,
  authorizeRestAccess,
  resolveRestActor,
} from "@/lib/db/rest-acl";
import { guardTable } from "@/lib/db/rest-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PG_IDENT = /^[a-z_][a-z0-9_]*$/i;

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, prefer, x-client-info, accept-profile, content-profile",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  };
}

function preferSingle(req: NextRequest): boolean {
  const accept = req.headers.get("accept") || "";
  return accept.includes("application/vnd.pgrst.object+json");
}

function preferReturn(req: NextRequest): boolean {
  const prefer = req.headers.get("prefer") || "";
  return prefer.includes("return=representation") || prefer.includes("resolution=");
}

function preferCount(req: NextRequest): boolean {
  const prefer = req.headers.get("prefer") || "";
  return prefer.includes("count=exact");
}

function jsonError(message: string, status = 400) {
  return NextResponse.json(
    { message, code: "PGRST", details: null, hint: null },
    { status, headers: corsHeaders() }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

async function getUnguarded(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");

  const actor = await resolveRestActor(req);
  const decision = authorizeRestAccess({
    actor,
    table,
    method: "GET",
    params: req.nextUrl.searchParams,
  });
  if (!decision.allow) {
    return jsonError(decision.message, decision.status);
  }

  const params = applyForcedFilters(req.nextUrl.searchParams, decision.forcedFilters);
  const client = createClient();
  const qb = client.from(table);
  const select = params.get("select") || req.nextUrl.searchParams.get("select") || "*";
  if (preferCount(req)) {
    qb.select(select, {
      count: "exact",
      head: req.headers.get("prefer")?.includes("head=true"),
    });
  } else {
    qb.select(select);
  }
  const filtered = new URLSearchParams(params);
  filtered.delete("select");
  applyPostgrestParams(qb as any, filtered, {
    preferSingle: preferSingle(req),
  });

  const result = await qb;
  if (result.error) {
    return jsonError(result.error.message || "Query failed", 400);
  }

  const headers = new Headers(corsHeaders());
  headers.set("Content-Type", "application/json");
  if (result.count != null) {
    headers.set(
      "Content-Range",
      `0-${Math.max((Array.isArray(result.data) ? result.data.length : 1) - 1, 0)}/${result.count}`
    );
  }

  if (preferSingle(req)) {
    return NextResponse.json(result.data, { status: 200, headers });
  }
  return NextResponse.json(result.data ?? [], { status: 200, headers });
}

async function postUnguarded(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");

  const body = await req.json().catch(() => null);
  if (body == null) return jsonError("Invalid JSON body");

  const actor = await resolveRestActor(req);
  const decision = authorizeRestAccess({
    actor,
    table,
    method: "POST",
    params: req.nextUrl.searchParams,
    body,
  });
  if (!decision.allow) {
    return jsonError(decision.message, decision.status);
  }

  const client = createClient();
  const rows = applyForcedValues(body, decision.forcedValues);
  // supabase-js .upsert() sends `Prefer: resolution=merge-duplicates` (+ ?on_conflict=cols).
  const prefer = req.headers.get("prefer") || "";
  const isUpsert = actor.kind !== "anon" && actor.kind !== "user" && prefer.includes("resolution=merge-duplicates");
  const onConflict = req.nextUrl.searchParams.get("on_conflict") || undefined;
  let qb = isUpsert
    ? client.from(table).upsert(rows, onConflict ? { onConflict } : undefined)
    : client.from(table).insert(rows);
  if (preferReturn(req) || preferSingle(req)) {
    qb = qb.select("*") as typeof qb;
  }
  if (preferSingle(req)) qb = qb.single() as typeof qb;

  const result = await qb;
  if (result.error) return jsonError(result.error.message || "Insert failed", 400);

  return NextResponse.json(result.data, {
    status: 201,
    headers: corsHeaders(),
  });
}

async function patchUnguarded(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");

  const body = await req.json().catch(() => null);
  if (body == null || typeof body !== "object") return jsonError("Invalid JSON body");

  const actor = await resolveRestActor(req);
  const decision = authorizeRestAccess({
    actor,
    table,
    method: "PATCH",
    params: req.nextUrl.searchParams,
    body,
  });
  if (!decision.allow) {
    return jsonError(decision.message, decision.status);
  }

  const params = applyForcedFilters(req.nextUrl.searchParams, decision.forcedFilters);
  const client = createClient();
  let qb = client.from(table).update(applyForcedValues(body, decision.forcedValues));
  applyPostgrestParams(qb as any, params);
  if (preferReturn(req) || preferSingle(req)) {
    qb = qb.select("*") as typeof qb;
  }
  if (preferSingle(req)) qb = qb.single() as typeof qb;

  const result = await qb;
  if (result.error) return jsonError(result.error.message || "Update failed", 400);

  return NextResponse.json(result.data, { status: 200, headers: corsHeaders() });
}

async function deleteUnguarded(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");

  const actor = await resolveRestActor(req);
  const decision = authorizeRestAccess({
    actor,
    table,
    method: "DELETE",
    params: req.nextUrl.searchParams,
  });
  if (!decision.allow) {
    return jsonError(decision.message, decision.status);
  }

  const client = createClient();
  const params = applyForcedFilters(req.nextUrl.searchParams, decision.forcedFilters);
  // A delete with no filter at all would empty the table: never allow that by accident.
  const hasFilter = Array.from(params.keys()).some((k) => !["select", "order", "limit", "offset"].includes(k));
  if (!hasFilter) return jsonError("A delete needs at least one filter", 400);
  let qb = client.from(table).delete();
  applyPostgrestParams(qb as any, params);
  if (preferReturn(req)) {
    qb = qb.select("*") as typeof qb;
  }

  const result = await qb;
  if (result.error) return jsonError(result.error.message || "Delete failed", 400);

  return NextResponse.json(result.data ?? null, { status: 200, headers: corsHeaders() });
}

// Two layers, and both must allow a request: the shared guard (rest-guard.ts)
// first, then this shop's own rules (rest-acl.ts) inside each handler.
export const GET = guardTable("GET", getUnguarded);
export const POST = guardTable("POST", postUnguarded);
export const PATCH = guardTable("PATCH", patchUnguarded);
export const DELETE = guardTable("DELETE", deleteUnguarded);
