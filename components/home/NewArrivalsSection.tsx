'use client';
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ProductCard, { type ColorVariant, getColorHex } from '@/components/ProductCard';
import ProductCardSkeleton from '@/components/skeletons/ProductCardSkeleton';
import AnimatedSection, { AnimatedGrid } from '@/components/AnimatedSection';
import { minVariantPrices } from '@/lib/currency';

const DISPLAY_LIMIT = 4;

function mapProductCard(product: any) {
  const variants = product.product_variants || [];
  const hasVariants = variants.length > 0;
  const { minUsd, minGhs } = minVariantPrices(variants, product.price, product.price_ghs);
  const totalVariantStock = hasVariants
    ? variants.reduce((sum: number, v: any) => sum + (v.quantity || 0), 0)
    : 0;
  const effectiveStock = hasVariants ? totalVariantStock : product.quantity;

  const colorVariants: ColorVariant[] = [];
  const seenColors = new Set<string>();
  for (const v of variants) {
    const colorName = v.option2;
    if (colorName && !seenColors.has(colorName.toLowerCase().trim())) {
      const hex = getColorHex(colorName);
      if (hex) {
        seenColors.add(colorName.toLowerCase().trim());
        colorVariants.push({ name: colorName.trim(), hex });
      }
    }
  }

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    price: product.price,
    price_ghs: product.price_ghs,
    originalPrice: product.compare_at_price,
    image: product.product_images?.[0]?.url || 'https://via.placeholder.com/400x500',
    rating: product.rating_avg || 0,
    reviewCount: product.review_count || 0,
    badge: 'New',
    inStock: effectiveStock > 0,
    maxStock: effectiveStock || 50,
    moq: product.moq || 1,
    hasVariants,
    minVariantPrice: hasVariants ? minUsd : undefined,
    minVariantPrice_ghs: hasVariants ? minGhs : product.price_ghs,
    colorVariants,
  };
}

/** Newest active products from admin catalog (ordered by created_at). */
export default function NewArrivalsSection() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*, product_variants(*), product_images(*)')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(DISPLAY_LIMIT);

        if (cancelled) return;
        if (error) {
          console.warn('[NewArrivals]', error.message);
          setProducts([]);
        } else {
          setProducts(data || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-10">
          <div>
            <span className="inline-block py-1 px-4 rounded-full bg-stone-50 text-gray-500 font-semibold text-xs tracking-widest uppercase mb-4 border border-gray-200">
              Just Dropped
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-gray-900 tracking-tight">
              New{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-blue-600 via-gray-800 to-indigo-600">
                Arrivals
              </span>
            </h2>
            <p className="mt-3 text-gray-600 max-w-xl">
              Fresh waist trainers, shapewear and athleisure — synced with the latest products in admin.
            </p>
          </div>
          <Link
            href="/shop?sort=newest"
            className="inline-flex items-center gap-2 self-start sm:self-auto bg-gray-900 text-white px-7 py-3 rounded-full text-sm font-semibold hover:bg-blue-800 transition-colors"
          >
            View All <i className="ri-arrow-right-line" />
          </Link>
        </AnimatedSection>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {[...Array(DISPLAY_LIMIT)].map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-center text-gray-500 py-16">
            New products will show here as soon as they&apos;re added in admin.{' '}
            <Link href="/shop" className="font-semibold text-gray-800 underline-offset-2 hover:underline">
              Browse the shop
            </Link>
          </p>
        ) : (
          <AnimatedGrid className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {products.map((product) => {
              const card = mapProductCard(product);
              return <ProductCard key={card.id} {...card} />;
            })}
          </AnimatedGrid>
        )}
      </div>
    </section>
  );
}
