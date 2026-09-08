import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifyAuth } from '@/lib/auth';
import { getPool } from '@/lib/db/pool';
import {
  DEFAULT_MAINTENANCE,
  MAINTENANCE_SETTINGS_KEY,
  normalizeMaintenance,
  type MaintenanceConfig,
} from '@/lib/maintenance';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { requireAdmin: true });
  if (!auth.authenticated) {
    return NextResponse.json({ success: false, message: auth.error || 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const res = await pool.query(
      `SELECT value, updated_at FROM site_settings WHERE key = $1 LIMIT 1`,
      [MAINTENANCE_SETTINGS_KEY]
    );
    const config = normalizeMaintenance(res.rows[0]?.value);
    return NextResponse.json({
      success: true,
      ...config,
      updatedAt: res.rows[0]?.updated_at || null,
      defaults: DEFAULT_MAINTENANCE,
    });
  } catch (err: any) {
    console.error('[admin/maintenance GET]', err?.message || err);
    return NextResponse.json({ success: false, message: err?.message || 'Failed' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await verifyAuth(req, { requireAdmin: true });
  if (!auth.authenticated) {
    return NextResponse.json({ success: false, message: auth.error || 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const config = normalizeMaintenance({
      enabled: body?.enabled,
      message: body?.message,
      estimatedMinutes: body?.estimatedMinutes ?? body?.estimated_minutes,
    }) as MaintenanceConfig;

    const pool = getPool();
    await pool.query(
      `INSERT INTO site_settings (key, value, category, updated_at)
       VALUES ($1, $2::jsonb, 'system', now())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             category = 'system',
             updated_at = now()`,
      [MAINTENANCE_SETTINGS_KEY, JSON.stringify(config)]
    );

    // Bust full-route cache so storefront picks up the toggle immediately.
    revalidatePath('/', 'layout');
    revalidatePath('/maintenance');

    return NextResponse.json({ success: true, ...config });
  } catch (err: any) {
    console.error('[admin/maintenance PUT]', err?.message || err);
    return NextResponse.json({ success: false, message: err?.message || 'Failed to save' }, { status: 500 });
  }
}
