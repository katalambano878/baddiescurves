'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePageTitle } from '@/hooks/usePageTitle';
import ProductCard, { mapProductToCard } from '@/components/ProductCard';
import ProductCardSkeleton from '@/components/skeletons/ProductCardSkeleton';
import PageHero from '@/components/PageHero';

type SaleCard = ReturnType<typeof mapProductToCard>;

export default function SalePage() {
  usePageTitle('Sale');

  const [cards, setCards] = useState<SaleCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [category, setCategory] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/storefront/sale', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Sale request failed (${res.status})`);
      const json = await res.json();
      // Keep only products that really show a lower price right now.
      setCards((json.products || []).map((p: any) => mapProductToCard(p)).filter((c: SaleCard) => c.badge === 'Sale'));
    } catch (err) {
      console.error('[sale]', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(
    () => Array.from(new Set(cards.map((c) => c.category).filter(Boolean) as string[])).sort(),
    [cards]
  );
  const visible = category === 'all' ? cards : cards.filter((c) => c.category === category);

  return (
    <main className="min-h-screen bg-white">
      <PageHero
        title="Sale"
        subtitle="Lower prices on selected pieces, for a limited time."
        backgroundImage="/page-hero-shop.jpeg"
      />

      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-8">
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : failed ? (
            <div className="text-center py-20">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">The sale did not load</h2>
              <p className="text-gray-600 mb-8">Check your connection and try again.</p>
              <button
                onClick={load}
                className="inline-flex items-center bg-gray-900 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Try again
              </button>
            </div>
          ) : cards.length === 0 ? (
            <div className="text-center py-20">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">No sale on right now</h2>
              <p className="text-gray-600 mb-8">New offers show up here first. Meanwhile, the full collection is open.</p>
              <Link
                href="/shop"
                className="inline-flex items-center bg-gray-900 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Shop all products
              </Link>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <p className="text-sm text-gray-600">
                  {visible.length} {visible.length === 1 ? 'product' : 'products'} on sale
                </p>
                {categories.length > 1 && (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
                    {['all', ...categories].map((c) => (
                      <button
                        key={c}
                        onClick={() => setCategory(c)}
                        aria-pressed={category === c}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                          category === c
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {c === 'all' ? 'All' : c}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-8">
                {visible.map((card) => (
                  <ProductCard key={card.id} {...card} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
