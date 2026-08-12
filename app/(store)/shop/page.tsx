'use client';
/* eslint-disable react-hooks/exhaustive-deps */

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';
import ProductCard, { type ColorVariant } from '@/components/ProductCard';
import ProductCardSkeleton from '@/components/skeletons/ProductCardSkeleton';
import { getColorHex } from '@/components/ProductCard';
import { supabase } from '@/lib/supabase';
import PageHero from '@/components/PageHero';
import { minVariantPrices, useCurrency } from '@/lib/currency';

const PAGE_SIZE = 12;

function formatShopProduct(p: any) {
  const variants = p.product_variants || [];
  const hasVariants = variants.length > 0;
  const { minUsd, minGhs } = minVariantPrices(variants, p.price, p.price_ghs);
  const totalVariantStock = hasVariants
    ? variants.reduce((sum: number, v: any) => sum + (v.quantity || 0), 0)
    : 0;
  const effectiveStock = hasVariants ? totalVariantStock : p.quantity;
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
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    price_ghs: p.price_ghs,
    originalPrice: p.compare_at_price,
    image: p.product_images?.[0]?.url || 'https://via.placeholder.com/800x800?text=No+Image',
    rating: p.rating_avg || 0,
    reviewCount: 0,
    badge: p.compare_at_price > p.price ? 'Sale' : undefined,
    inStock: effectiveStock > 0,
    maxStock: effectiveStock || 50,
    moq: p.moq || 1,
    category: p.categories?.name,
    hasVariants,
    minVariantPrice: hasVariants ? minUsd : undefined,
    minVariantPrice_ghs: hasVariants ? minGhs : p.price_ghs,
    colorVariants,
  };
}

function ShopContent() {
  usePageTitle('Shop All Products');
  const { currencyLabel } = useCurrency();
  const searchParams = useSearchParams();

  // State
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([{ id: 'all', name: 'All Products', count: 0 }]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalProducts, setTotalProducts] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [priceRange, setPriceRange] = useState([0, 5000]);
  const [selectedRating, setSelectedRating] = useState(0);
  const [sortBy, setSortBy] = useState('popular');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef(false);

  // Initialize from URL params
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const category = searchParams.get('category');
    const sort = searchParams.get('sort');
    const search = searchParams.get('search');

    if (category) setSelectedCategory(category);
    if (sort) setSortBy(sort);
    setPage(1);
    // Search is handled in the fetch function via searchParams directly
  }, [searchParams]);

  // Fetch Categories from cached API
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch('/api/storefront/categories');
        if (res.ok) {
          const data = await res.json();
          if (data) setCategories(data);
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    }
    fetchCategories();
  }, []);

  // Fetch Products (page 1 replaces; later pages append — infinite scroll)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;

    async function fetchProducts() {
      fetchingRef.current = true;
      const isFirstPage = page === 1;
      if (isFirstPage) setLoading(true);
      else setLoadingMore(true);

      try {
        const search = searchParams.get('search');

        let query = supabase
          .from('products')
          .select(
            `
                *,
                categories!inner(name, slug),
                product_images!product_id(url, position),
                product_variants(id, name, price, price_ghs, quantity, option1, option2, image_url)
              `,
            { count: 'exact' }
          )
          .eq('status', 'active')
          .order('position', { foreignTable: 'product_images', ascending: true });

        if (search) {
          query = query.ilike('name', `%${search}%`);
        }

        if (selectedCategory !== 'all') {
          const categoryObj = categories.find((c) => c.slug === selectedCategory);

          if (categoryObj) {
            const targetSlugs = [selectedCategory];
            const childSlugs = categories
              .filter((c) => c.parent_id === categoryObj.id)
              .map((c) => c.slug);
            targetSlugs.push(...childSlugs);
            query = query.in('categories.slug', targetSlugs);
          } else {
            query = query.eq('categories.slug', selectedCategory);
          }
        }

        if (priceRange[1] < 5000) {
          query = query.gte('price', priceRange[0]).lte('price', priceRange[1]);
        }

        if (selectedRating > 0) {
          query = query.gte('rating_avg', selectedRating);
        }

        switch (sortBy) {
          case 'price-low':
            query = query.order('price', { ascending: true });
            break;
          case 'price-high':
            query = query.order('price', { ascending: false });
            break;
          case 'rating':
            query = query.order('rating_avg', { ascending: false });
            break;
          case 'new':
            query = query.order('created_at', { ascending: false });
            break;
          case 'popular':
          default:
            query = query.order('created_at', { ascending: false });
            break;
        }

        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        query = query.range(from, to);

        const { data, count, error } = await query;
        if (error) throw error;
        if (cancelled) return;

        const formatted = (data || []).map(formatShopProduct);
        const total = count || 0;
        setTotalProducts(total);

        if (isFirstPage) {
          setProducts(formatted);
        } else {
          setProducts((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...formatted.filter((p) => !seen.has(p.id))];
          });
        }

        setHasMore(from + formatted.length < total);
      } catch (err) {
        console.error('Error fetching products:', err);
        if (!cancelled && page === 1) setProducts([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingMore(false);
        }
        fetchingRef.current = false;
      }
    }

    fetchProducts();
    return () => {
      cancelled = true;
    };
  }, [selectedCategory, priceRange, selectedRating, sortBy, page, searchParams, categories]);

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          hasMore &&
          !loading &&
          !loadingMore &&
          !fetchingRef.current
        ) {
          fetchingRef.current = true;
          setPage((p) => p + 1);
        }
      },
      { rootMargin: '320px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, products.length]);

  return (
    <main className="min-h-screen bg-white">
      <PageHero
        title="Shop All Products"
        subtitle="Waist trainers, shapewear, post-op fajas, athleisure and gym apparel — shop every curve"
        backgroundImage="/page-hero-shop.jpeg"
      />

      {/* Mobile Filter Toggle */}
      <div className="lg:hidden bg-white border-b border-gray-200 py-4 px-4 sticky top-[72px] z-20">
        <div className="flex justify-between items-center">
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="flex items-center space-x-2 text-gray-900 font-medium"
          >
            <i className="ri-filter-3-line text-xl"></i>
            <span>Filters & Sort</span>
          </button>
          <span className="text-sm text-gray-500">{totalProducts} Products</span>
        </div>
      </div>

      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col lg:flex-row gap-8">
            <aside className={`${isFilterOpen ? 'fixed inset-0 z-50 bg-white overflow-y-auto' : 'hidden'} lg:block lg:w-64 lg:flex-shrink-0`}>
              <div className="lg:sticky lg:top-24">
                <div className="bg-white lg:bg-transparent p-6 lg:p-0">
                  <div className="flex items-center justify-between mb-6 lg:hidden">
                    <h2 className="text-xl font-bold text-gray-900">Filters</h2>
                    <button
                      onClick={() => setIsFilterOpen(false)}
                      className="w-10 h-10 flex items-center justify-center text-gray-700"
                    >
                      <i className="ri-close-line text-2xl"></i>
                    </button>
                  </div>

                  <div className="space-y-8">
                    {/* Categories */}
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-4">Categories</h3>
                      <div className="space-y-1">
                        <button
                          onClick={() => {
                            setSelectedCategory('all');
                            setPage(1);
                            setIsFilterOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${selectedCategory === 'all'
                            ? 'bg-blue-100 text-blue-700 font-medium'
                            : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                          All Products
                        </button>

                        {/* Parent Categories */}
                        {categories.filter(c => !c.parent_id && c.id !== 'all').map(parent => {
                          const subcategories = categories.filter(c => c.parent_id === parent.id);
                          const isSelected = selectedCategory === parent.slug;
                          const isChildSelected = subcategories.some(sub => sub.slug === selectedCategory);
                          const isOpen = isSelected || isChildSelected; // Auto-expand if selected

                          return (
                            <div key={parent.id} className="space-y-1">
                              <button
                                onClick={() => {
                                  setSelectedCategory(parent.slug);
                                  setPage(1);
                                  // Don't close filter immediately if exploring hierarchy
                                }}
                                className={`w-full text-left px-4 py-2 rounded-lg transition-colors flex justify-between items-center ${isSelected
                                  ? 'bg-blue-50 text-blue-700 font-medium'
                                  : 'text-gray-700 hover:bg-gray-100'
                                  }`}
                              >
                                <span>{parent.name}</span>
                              </button>

                              {/* Subcategories */}
                              {subcategories.length > 0 && (
                                <div className="ml-4 border-l-2 border-gray-100 pl-2 space-y-1">
                                  {subcategories.map(child => (
                                    <button
                                      key={child.id}
                                      onClick={() => {
                                        setSelectedCategory(child.slug);
                                        setPage(1);
                                        setIsFilterOpen(false);
                                      }}
                                      className={`w-full text-left px-4 py-1.5 rounded-lg text-sm transition-colors ${selectedCategory === child.slug
                                        ? 'text-blue-700 font-medium bg-blue-50'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                        }`}
                                    >
                                      {child.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Price Range */}
                    <div className="border-t border-gray-200 pt-8">
                      <h3 className="font-semibold text-gray-900 mb-4">Max Price: {currencyLabel}{priceRange[1]}</h3>
                      <div className="space-y-4">
                        <input
                          type="range"
                          min="0"
                          max="5000"
                          step="50"
                          value={priceRange[1]}
                          onChange={(e) => {
                            setPriceRange([0, parseInt(e.target.value)]);
                            setPage(1);
                          }}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-700"
                        />
                        <div className="flex items-center justify-between text-sm text-gray-600">
                          <span>{currencyLabel}0</span>
                          <span>{currencyLabel}5000+</span>
                        </div>
                      </div>
                    </div>

                    {/* Rating */}
                    <div className="border-t border-gray-200 pt-8">
                      <h3 className="font-semibold text-gray-900 mb-4">Rating</h3>
                      <div className="space-y-2">
                        {[4, 3, 2, 1].map(rating => (
                          <button
                            key={rating}
                            onClick={() => {
                              setSelectedRating(rating === selectedRating ? 0 : rating);
                              setPage(1);
                            }}
                            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${selectedRating === rating
                              ? 'bg-blue-100 text-blue-700'
                              : 'text-gray-700 hover:bg-gray-100'
                              }`}
                          >
                            <div className="flex items-center space-x-2">
                              {[1, 2, 3, 4, 5].map(star => (
                                <i
                                  key={star}
                                  className={`${star <= rating ? 'ri-star-fill text-amber-400' : 'ri-star-line text-gray-300'} text-sm`}
                                ></i>
                              ))}
                              <span className="text-sm">& Up</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        // Re-fetch handled by effect dependencies
                        setIsFilterOpen(false);
                      }}
                      className="w-full bg-gray-900 hover:bg-blue-700 text-white py-3 rounded-lg font-medium transition-colors whitespace-nowrap"
                    >
                      Show Results
                    </button>
                  </div>
                </div>
              </div>
            </aside>

            <div className="flex-1">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
                <p className="text-gray-600">
                  Showing <span className="font-semibold text-gray-900">{products.length}</span>
                  {totalProducts > 0 && (
                    <>
                      {' '}
                      of <span className="font-semibold text-gray-900">{totalProducts}</span>
                    </>
                  )}{' '}
                  products
                </p>

                <div className="flex items-center space-x-3">
                  <label className="text-sm text-gray-600 whitespace-nowrap">Sort by:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value);
                      setPage(1);
                    }}
                    className="px-4 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white cursor-pointer"
                  >
                    <option value="popular">Most Popular</option>
                    <option value="new">Newest</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="rating">Highest Rated</option>
                  </select>
                </div>
              </div>

              {loading && products.length === 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-x-4 gap-y-8 md:gap-8">
                  {[...Array(6)].map((_, i) => (
                    <ProductCardSkeleton key={i} />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-8" data-product-shop>
                    {products.map((product) => (
                      <ProductCard key={product.id} {...product} />
                    ))}
                  </div>

                  {products.length === 0 && !loading && (
                    <div className="text-center py-20">
                      <div className="w-20 h-20 flex items-center justify-center mx-auto mb-6 bg-gray-100 rounded-full">
                        <i className="ri-inbox-line text-4xl text-gray-400"></i>
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">No Products Found</h3>
                      <p className="text-gray-600 mb-8">
                        Try adjusting your filters to find what you&apos;re looking for
                      </p>
                      <button
                        onClick={() => {
                          setSelectedCategory('all');
                          setPriceRange([0, 5000]);
                          setSelectedRating(0);
                        }}
                        className="inline-flex items-center bg-gray-900 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap"
                      >
                        Clear All Filters
                      </button>
                    </div>
                  )}

                  {/* Infinite scroll sentinel */}
                  <div ref={sentinelRef} className="h-10 w-full" aria-hidden />

                  {loadingMore && (
                    <div className="flex justify-center py-8">
                      <div className="w-10 h-10 border-4 border-blue-700 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}

                  {!hasMore && products.length > 0 && (
                    <p className="text-center text-sm text-gray-500 py-8">
                      You&apos;ve reached the end — {totalProducts} products
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-4 border-blue-700 border-t-transparent rounded-full animate-spin"></div></div>}>
      <ShopContent />
    </Suspense>
  );
}