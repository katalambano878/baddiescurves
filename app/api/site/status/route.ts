import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';
import {
  DEFAULT_MAINTENANCE,
  MAINTENANCE_SETTINGS_KEY,
  normalizeMaintenance,
} from '@/lib/maintenance';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Public status endpoint — used by middleware (edge fetch) and the maintenance page. */
export async function GET(_req: NextRequest) {
  try {
    const pool = getPool();
    const res = await pool.query(
      `SELECT value FROM site_settings WHERE key = $1 LIMIT 1`,
      [MAINTENANCE_SETTINGS_KEY]
    );
    const config = normalizeMaintenance(res.rows[0]?.value);
    return NextResponse.json(
      { success: true, ...config },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
        },
      }
    );
  } catch (err: any) {
    console.error('[site/status GET]', err?.message || err);
    return NextResponse.json(
      { success: true, ...DEFAULT_MAINTENANCE, enabled: false },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
