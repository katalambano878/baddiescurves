import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_MAINTENANCE,
  getMaintenanceConfig,
} from '@/lib/maintenance';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Public status endpoint — used by middleware (edge fetch) and the maintenance page. */
export async function GET(_req: NextRequest) {
  try {
    const config = await getMaintenanceConfig();
    return NextResponse.json(
      { success: true, ...config },
      {
        headers: {
          // Never CDN-cache "off" while flipping maintenance on/off.
          'Cache-Control': 'no-store, must-revalidate',
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
