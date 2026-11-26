// Approved reviews for one product, with the reviewer's first name.
//
// The browser can read `reviews` directly, but not the reviewer's name
// (profiles are private), so this route joins it and returns only a first name.

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';
import { isPlainPostgres } from '@/lib/db/mode';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
    const productId = (req.nextUrl.searchParams.get('product_id') || '').trim();
    if (!UUID.test(productId)) {
        return NextResponse.json({ error: 'A product id is required.' }, { status: 400 });
    }
    if (!isPlainPostgres()) {
        return NextResponse.json({ error: 'Reviews are not available from this route.' }, { status: 503 });
    }

    try {
        // First name comes from what the customer typed at sign-up or in their
        // profile. A profile name that is just the start of their email address
        // (the sign-up default) is not a name and is never shown.
        const { rows } = await getPool().query(
            `SELECT r.id, r.rating, r.title, r.content, r.created_at,
                    COALESCE(r.verified_purchase, false) AS verified_purchase,
                    COALESCE(r.helpful_votes, 0) AS helpful_votes,
                    NULLIF(split_part(btrim(COALESCE(
                      NULLIF(btrim(u.raw_user_meta_data->>'first_name'), ''),
                      CASE WHEN p.full_name IS DISTINCT FROM split_part(COALESCE(p.email, ''), '@', 1)
                           THEN p.full_name END,
                      ''
                    )), ' ', 1), '') AS first_name
             FROM reviews r
             LEFT JOIN auth.users u ON u.id = r.user_id
             LEFT JOIN profiles p ON p.id = r.user_id
             WHERE r.product_id = $1 AND lower(COALESCE(r.status, '')) = 'approved'
             ORDER BY r.created_at DESC
             LIMIT 200`,
            [productId]
        );

        const reviews = rows.map((row: any) => ({
            id: row.id,
            rating: row.rating,
            title: row.title,
            content: row.content,
            created_at: row.created_at,
            verified_purchase: row.verified_purchase === true,
            helpful_votes: row.helpful_votes,
            first_name:
                typeof row.first_name === 'string' && !row.first_name.includes('@')
                    ? row.first_name.slice(0, 40)
                    : null,
        }));
        return NextResponse.json({ reviews });
    } catch (err: any) {
        console.error('[storefront/reviews] failed:', err?.message || err);
        return NextResponse.json({ error: 'Reviews could not be loaded.' }, { status: 500 });
    }
}
