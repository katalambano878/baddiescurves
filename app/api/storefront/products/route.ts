import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
// Server-side Supabase client (no auth needed for public data)
// Simple in-memory cache
let cache: { data: any; timestamp: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes — products don't change frequently

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const featured = searchParams.get('featured') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');
    const category = searchParams.get('category');

    // Build a cache key from params
    const cacheKey = `${featured}-${limit}-${category || 'all'}`;

    // Check cache (only for featured/home requests — general shop is more dynamic)
    if (featured && cache && cache.data?.[cacheKey] && Date.now() - cache.timestamp < CACHE_TTL) {
        return NextResponse.json(cache.data[cacheKey], {
            headers: {
                'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
                'X-Cache': 'HIT'
            }
        });
    }

    try {
        let query = supabase
            .from('products')
            .select(`
                id, name, slug, price, compare_at_price, quantity, description, metadata,
                categories(id, name, slug),
                product_images(url, position),
                product_variants(id, name, price, quantity)
            `)
            .order('created_at', { ascending: false });

        // Always filter active products
        query = query.eq('status', 'active');

        if (featured) {
            query = query.eq('featured', true).limit(limit);
        } else if (category) {
            const { data: catRow } = await supabase
                .from('categories')
                .select('id')
                .eq('slug', category)
                .maybeSingle();
            if (catRow?.id) {
                query = query.eq('category_id', catRow.id).limit(limit);
            } else {
                // Case-insensitive / trimmed fallback
                const { data: cats } = await supabase
                    .from('categories')
                    .select('id, slug')
                    .eq('status', 'active');
                const match = (cats || []).find(
                    (c: any) => String(c.slug || '').trim().toLowerCase() === category.trim().toLowerCase()
                );
                if (match?.id) {
                    query = query.eq('category_id', match.id).limit(limit);
                } else {
                    return NextResponse.json([]);
                }
            }
        } else {
            query = query.limit(limit);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[Storefront API] Products error:', error);
            return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
        }

        // Cache the result
        if (!cache) cache = { data: {}, timestamp: Date.now() };
        cache.data[cacheKey] = data;
        cache.timestamp = Date.now();

        return NextResponse.json(data, {
            headers: {
                'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
                'X-Cache': 'MISS'
            }
        });
    } catch (err: any) {
        console.error('[Storefront API] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
