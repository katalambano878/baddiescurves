import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-compat";
import { isPlainPostgres } from "@/lib/db/mode";
import { resolveRestActor } from "@/lib/db/rest-acl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PG_IDENT = /^[a-z_][a-z0-9_]*$/i;

/** RPCs callable without admin (guest checkout). */
const PUBLIC_RPCS = new Set(["upsert_customer_from_order"]);

/** RPCs callable by admin/staff JWT (POS, etc.). */
const ADMIN_RPCS = new Set([
  "mark_order_paid",
  "update_customer_stats",
  "reduce_stock_on_order",
  "get_all_customer_emails",
  "get_all_customer_phones",
  "upsert_customer_from_order",
]);

/** RPCs reserved for service-role / in-process admin only. */
const SERVICE_ONLY_RPCS = new Set([
  "claim_payment_event",
  "complete_payment_event",
]);

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    },
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ fn: string }> }
) {
  if (!isPlainPostgres()) {
    return NextResponse.json({ message: "DATABASE_URL not set" }, { status: 503 });
  }
  const { fn } = await ctx.params;
  if (!PG_IDENT.test(fn)) {
    return NextResponse.json({ message: "Invalid function name" }, { status: 400 });
  }

  const actor = await resolveRestActor(req);

  if (SERVICE_ONLY_RPCS.has(fn) && actor.kind !== "service") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if (actor.kind === "anon" && !PUBLIC_RPCS.has(fn)) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  if (actor.kind === "user" && !PUBLIC_RPCS.has(fn)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if (
    (actor.kind === "admin" || actor.kind === "service") &&
    !ADMIN_RPCS.has(fn) &&
    !SERVICE_ONLY_RPCS.has(fn) &&
    !PUBLIC_RPCS.has(fn)
  ) {
    // Allow unknown admin RPCs only for service; block arbitrary SQL surface for admin JWT
    if (actor.kind !== "service") {
      return NextResponse.json({ message: "RPC not allowed" }, { status: 403 });
    }
  }

  const args = (await req.json().catch(() => ({}))) as Record<string, any>;
  const client = createClient();
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    return NextResponse.json(
      { message: error.message, code: "PGRST202" },
      { status: 400 }
    );
  }
  return NextResponse.json(data);
}
