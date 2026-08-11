import { NextRequest, NextResponse } from "next/server";
import { isPlainPostgres } from "@/lib/db/mode";
import { getPool } from "@/lib/db/pool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REQUIRED_TABLES = [
  "orders",
  "order_items",
  "products",
  "categories",
  "profiles",
  "customers",
  "payment_events",
  "notification_events",
  "contact_submissions",
  "store_modules",
];

const REQUIRED_FUNCTIONS = [
  "mark_order_paid",
  "upsert_customer_from_order",
  "update_customer_stats",
  "claim_payment_event",
  "complete_payment_event",
];

/**
 * Safe DB health check. Does not expose credentials, host, or row data.
 * Detailed diagnostics require CRON_SECRET or HEALTH_CHECK_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret =
    req.headers.get("x-health-secret") ||
    req.nextUrl.searchParams.get("secret") ||
    "";
  const expected = process.env.CRON_SECRET || process.env.HEALTH_CHECK_SECRET || "";
  const detailed = !!expected && secret === expected;

  if (!isPlainPostgres()) {
    return NextResponse.json(
      { status: "unhealthy", reason: "plain_postgres_disabled" },
      { status: 503 }
    );
  }

  try {
    const pool = getPool();
    const start = Date.now();
    await pool.query("SELECT 1 AS ok");
    const pingMs = Date.now() - start;

    const tablesRes = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const tables = new Set(tablesRes.rows.map((r) => r.table_name));
    const missingTables = REQUIRED_TABLES.filter((t) => !tables.has(t));

    const fnRes = await pool.query<{ proname: string }>(
      `SELECT proname FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND proname = ANY($1::text[])`,
      [REQUIRED_FUNCTIONS]
    );
    const fns = new Set(fnRes.rows.map((r) => r.proname));
    const missingFunctions = REQUIRED_FUNCTIONS.filter((f) => !fns.has(f));

    let migrationVersion: string | null = null;
    try {
      const mig = await pool.query<{ version: string }>(
        `SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`
      );
      migrationVersion = mig.rows[0]?.version ?? null;
    } catch {
      migrationVersion = null;
    }

    const degraded = missingTables.length > 0 || missingFunctions.length > 0;
    const status = degraded ? "degraded" : "healthy";

    const body: Record<string, unknown> = {
      status,
      plainPostgres: true,
      pingMs,
    };

    if (detailed) {
      body.missingTables = missingTables;
      body.missingFunctions = missingFunctions;
      body.latestMigration = migrationVersion;
      body.pool = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      };
    } else {
      body.checks = degraded ? "failed" : "passed";
    }

    return NextResponse.json(body, { status: degraded ? 503 : 200 });
  } catch {
    return NextResponse.json(
      { status: "unhealthy", reason: "query_failed" },
      { status: 503 }
    );
  }
}
