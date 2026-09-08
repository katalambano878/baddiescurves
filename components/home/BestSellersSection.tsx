'use client';
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ProductCard, { type ColorVariant, getColorHex } from '@/components/ProductCard';
import ProductCardSkeleton from '@/components/skeletons/ProductCardSkeleton';
import AnimatedSection, { AnimatedGrid } from '@/components/AnimatedSection';
import { minVariantPrices } from '@/lib/currency';

type CategoryTab = {
  id: string;
  name: string;
  slug: string;
};

type ProductRow = any;

function mapProductCard(product: ProductRow) {
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
    rating: product.rating_avg || 5,
    reviewCount: product.review_count || 0,
    badge: product.compare_at_price > product.price ? 'Sale' : product.featured ? 'Featured' : undefined,
    inStock: effectiveStock > 0,
    maxStock: effectiveStock > 0 ? effectiveStock : 0,
    moq: product.moq || 1,
    hasVariants,
    minVariantPrice: hasVariants ? minUsd : undefined,
    minVariantPrice_ghs: hasVariants ? minGhs : product.price_ghs,
    colorVariants,
  };
}

interface BestSellersSectionProps {
  products: ProductRow[];
  categories: CategoryTab[];
  loading?: boolean;
}

const DISPLAY_LIMIT = 4;

export default function BestSellersSection({
  products,
  categories,
  loading: initialLoading = false,
}: BestSellersSectionProps) {
  const [activeTab, setActiveTab] = useState('all');
  const [tabProducts, setTabProducts] = useState<ProductRow[]>(products);
  const [loading, setLoading] = useState(false);

  const tabs = useMemo(
    () => [{ id: 'all', name: 'All', slug: 'all' }, ...categories],
    [categories]
  );

  useEffect(() => {
    setTabProducts(products);
  }, [products]);

  useEffect(() => {
    let cancelled = false;

    async function loadTab() {
      if (activeTab === 'all') {
        setTabProducts(products);
        return;
      }

      const category = categories.find((c) => c.id === activeTab || c.slug === activeTab);
      if (!category) return;

      const fromFeatured = products.filter((p) => p.category_id === category.id);
      if (fromFeatured.length >= DISPLAY_LIMIT) {
        setTabProducts(fromFeatured);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*, product_variants(*), product_images(*)')
          .eq('status', 'active')
          .eq('category_id', category.id)
          .order('created_at', { ascending: false })
          .limit(DISPLAY_LIMIT);

        if (cancelled) return;
        if (error) {
          console.warn('[BestSellers] category fetch failed', error.message);
          setTabProducts(fromFeatured);
        } else {
          setTabProducts(data?.length ? data : fromFeatured);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTab();
    return () => {
      cancelled = true;
    };
  }, [activeTab, categories, products]);

  const visible = tabProducts.slice(0, DISPLAY_LIMIT);
  const showLoading = initialLoading || loading;

  return (
    <section className="py-16 md:py-24 bg-stone-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-10">
          <div>
            <span className="inline-block py-1 px-4 rounded-full bg-white text-gray-500 font-semibold text-xs tracking-widest uppercase mb-4 border border-gray-200">
              Our Products
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-gray-900 tracking-tight">
              Our{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-blue-600 via-gray-800 to-indigo-600">
                Best Seller
              </span>{' '}
              Products
            </h2>
          </div>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 self-start sm:self-auto bg-gray-900 text-white px-7 py-3 rounded-full text-sm font-semibold hover:bg-blue-800 transition-colors"
          >
            View All <i className="ri-arrow-right-line" />
          </Link>
        </AnimatedSection>

        <div className="flex flex-wrap gap-2 mb-10 overflow-x-auto pb-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-300 ${
                  isActive
                    ? 'bg-gray-900 text-white shadow-md'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:text-gray-900'
                }`}
              >
                {tab.name}
              </button>
            );
          })}
        </div>

        {showLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {[...Array(DISPLAY_LIMIT)].map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="text-center text-gray-500 py-16">
            No products in this collection yet.{' '}
            <Link href="/shop" className="font-semibold text-gray-800 underline-offset-2 hover:underline">
              Browse the shop
            </Link>
          </p>
        ) : (
          <AnimatedGrid className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {visible.map((product) => {
              const card = mapProductCard(product);
              return <ProductCard key={card.id} {...card} />;
            })}
          </AnimatedGrid>
        )}
      </div>
    </section>
  );
}
