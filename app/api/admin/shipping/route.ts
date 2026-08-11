import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getPool } from '@/lib/db/pool';
import { DEFAULT_SHIPPING_RATES, mergeShippingRates, type ShippingRatesConfig } from '@/lib/shipping';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SETTINGS_KEY = 'shipping_rates';

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { requireAdmin: true });
  if (!auth.authenticated) {
    return NextResponse.json({ success: false, message: auth.error || 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const res = await pool.query(
      `SELECT value, updated_at FROM site_settings WHERE key = $1 LIMIT 1`,
      [SETTINGS_KEY]
    );
    const rates = mergeShippingRates(res.rows[0]?.value);
    return NextResponse.json({
      success: true,
      rates,
      updatedAt: res.rows[0]?.updated_at || null,
      defaults: DEFAULT_SHIPPING_RATES,
    });
  } catch (err: any) {
    console.error('[admin/shipping GET]', err?.message || err);
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
    const rates = mergeShippingRates(body?.rates ?? body) as ShippingRatesConfig;

    const pool = getPool();
    await pool.query(
      `INSERT INTO site_settings (key, value, category, updated_at)
       VALUES ($1, $2::jsonb, 'shipping', now())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             category = 'shipping',
             updated_at = now()`,
      [SETTINGS_KEY, JSON.stringify(rates)]
    );

    return NextResponse.json({ success: true, rates });
  } catch (err: any) {
    console.error('[admin/shipping PUT]', err?.message || err);
    return NextResponse.json({ success: false, message: err?.message || 'Failed to save' }, { status: 500 });
  }
}
