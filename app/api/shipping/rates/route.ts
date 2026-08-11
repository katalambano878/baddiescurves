import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';
import { DEFAULT_SHIPPING_RATES, mergeShippingRates } from '@/lib/shipping';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SETTINGS_KEY = 'shipping_rates';

export async function GET() {
  try {
    const pool = getPool();
    const res = await pool.query(
      `SELECT value FROM site_settings WHERE key = $1 LIMIT 1`,
      [SETTINGS_KEY]
    );
    const rates = mergeShippingRates(res.rows[0]?.value);
    return NextResponse.json({ success: true, rates });
  } catch (err: any) {
    console.error('[shipping/rates GET]', err?.message || err);
    // Never break checkout — fall back to defaults
    return NextResponse.json({
      success: true,
      rates: DEFAULT_SHIPPING_RATES,
      fallback: true,
    });
  }
}
