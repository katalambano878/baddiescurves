import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Products whose sale is live right now (on sale and not switched off).
 *   GET /api/storefront/sale          → { products: [...] } shaped for mapProductToCard
 *   GET /api/storefront/sale?count=1  → { count } for the header's Sale link
 *
 * Only public catalogue columns are returned.
 */

const LIVE_WHERE = `
  p.status = 'active'
  AND p.on_sale = true
  AND NOT COALESCE(p.metadata ? 'paused_sale_price', false)
`;

// A sale that changes should show at once, so nothing may cache this.
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
    const countOnly = new URL(request.url).searchParams.get('count') === '1';

    try {
        const pool = getPool();

        if (countOnly) {
            const res = await pool.query(`SELECT count(*)::int AS count FROM products p WHERE ${LIVE_WHERE}`);
            return NextResponse.json({ count: res.rows[0]?.count ?? 0 }, { headers: NO_STORE });
        }

        const res = await pool.query(`
            SELECT p.id, p.name, p.slug, p.price, p.price_ghs, p.compare_at_price, p.compare_at_price_ghs,
                   p.quantity, p.moq, p.rating_avg, p.review_count, p.featured, p.category_id,
                   CASE WHEN c.id IS NULL THEN NULL
                        ELSE jsonb_build_object('name', c.name, 'slug', c.slug) END AS categories,
                   COALESCE((
                     SELECT jsonb_agg(jsonb_build_object('url', i.url, 'position', i.position) ORDER BY i.position NULLS LAST)
                     FROM product_images i WHERE i.product_id = p.id
                   ), '[]'::jsonb) AS product_images,
                   COALESCE((
                     SELECT jsonb_agg(jsonb_build_object(
                              'id', v.id, 'name', v.name, 'option1', v.option1, 'option2', v.option2,
                              'price', v.price, 'price_ghs', v.price_ghs,
                              'compare_at_price', v.compare_at_price,
                              'compare_at_price_ghs', v.compare_at_price_ghs,
                              'quantity', v.quantity))
                     FROM product_variants v WHERE v.product_id = p.id
                   ), '[]'::jsonb) AS product_variants
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            WHERE ${LIVE_WHERE}
            ORDER BY p.updated_at DESC
            LIMIT 500
        `);

        return NextResponse.json({ products: res.rows }, { headers: NO_STORE });
    } catch (err: any) {
        console.error('[storefront/sale]', err?.message || err);
        return NextResponse.json(
            countOnly ? { count: 0 } : { products: [], error: 'Could not load the sale' },
            { status: countOnly ? 200 : 500, headers: NO_STORE },
        );
    }
}
