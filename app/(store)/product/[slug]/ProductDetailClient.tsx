'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { cachedQuery } from '@/lib/query-cache';
import ProductCard, { mapProductToCard, PRODUCT_PLACEHOLDER_IMAGE } from '@/components/ProductCard';
import ProductReviews from '@/components/ProductReviews';
import { StructuredData, generateProductSchema, generateBreadcrumbSchema } from '@/components/SEOHead';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useWishlist } from '@/context/WishlistContext';
import { listingPrices, wasPrice, useCurrency } from '@/lib/currency';

// Map common color names to hex values for the swatch preview
function colorNameToHex(name: string): string {
  const map: Record<string, string> = {
    red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308',
    orange: '#f97316', purple: '#a855f7', pink: '#ec4899', black: '#111827',
    white: '#ffffff', gray: '#6b7280', grey: '#6b7280', brown: '#92400e',
    navy: '#1e3a5f', gold: '#d4a017', silver: '#c0c0c0', beige: '#f5f5dc',
    maroon: '#800000', teal: '#14b8a6', coral: '#ff7f50', ivory: '#fffff0',
    cream: '#fffdd0', burgundy: '#800020', lavender: '#e6e6fa', cyan: '#06b6d4',
    magenta: '#d946ef', olive: '#84cc16', peach: '#ffcba4', mint: '#98f5e1',
    rose: '#f43f5e', wine: '#722f37', charcoal: '#374151', sky: '#0ea5e9',
  };
  return map[name.toLowerCase().trim()] || '#d1d5db';
}

export default function ProductDetailClient({ slug }: { slug: string }) {
  const [product, setProduct] = useState<any>(null);
  usePageTitle(product?.name || 'Product');
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState('description');
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist();
  const [relatedProducts, setRelatedProducts] = useState<any[]>([]);

  const { addToCart } = useCart();
  const router = useRouter();
  const { formatPrice, formatComparePrice, formatEquivalents, resolveAmount, isGhana } = useCurrency();

  useEffect(() => {
    async function fetchProduct() {
      try {
        setLoading(true);
        // Fetch main product (cached for 2 minutes)
        const { data: productData, error } = await cachedQuery<{ data: any; error: any }>(
          `product:${slug}`,
          async () => {
            let query = supabase
              .from('products')
              .select(`
                *,
                categories(name, slug),
                product_variants(*),
                product_images(url, position, alt_text)
              `);

            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

            if (isUUID) {
              query = query.or(`id.eq.${slug},slug.eq.${slug}`);
            } else {
              query = query.eq('slug', slug);
            }

            return query.single() as any;
          },
          2 * 60 * 1000 // 2 minutes
        );

        if (error || !productData) {
          console.error('Error fetching product:', error);
          setLoading(false);
          return;
        }

        // Transform product data
        // Map variant colors from option2, and extract color_hex from metadata
        const rawVariants = (productData.product_variants || []).map((v: any) => ({
          ...v,
          color: v.option2 || '',
          colorHex: v.metadata?.color_hex || ''
        }));

        // Build a color-to-hex map from variants (prefer stored hex, fallback to colorNameToHex)
        const colorHexMap: Record<string, string> = {};
        rawVariants.forEach((v: any) => {
          if (v.color) {
            if (!colorHexMap[v.color]) {
              colorHexMap[v.color] = v.colorHex || colorNameToHex(v.color);
            }
          }
        });

        const transformedProduct = {
          ...productData,
          images: productData.product_images?.sort((a: any, b: any) => a.position - b.position).map((img: any) => img.url) || [],
          category: productData.categories?.name || 'Shop',
          rating: productData.rating_avg || 0,
          reviewCount: 0,
          stockCount: productData.quantity,
          moq: productData.moq || 1,
          colors: [...new Set(rawVariants.map((v: any) => v.color).filter(Boolean))],
          colorHexMap,
          variants: rawVariants,
          sizes: rawVariants.map((v: any) => v.name) || [],
          // Features / Care tabs only show when the product has its own text
          // (products.metadata.features: string[], products.metadata.care: string).
          features: Array.isArray(productData.metadata?.features)
            ? productData.metadata.features.filter((f: unknown) => typeof f === 'string' && f.trim())
            : [],
          care: typeof productData.metadata?.care === 'string' ? productData.metadata.care.trim() : '',
          preorderShipping: productData.metadata?.preorder_shipping || null
        };

        // Ensure at least one image/placeholder
        if (transformedProduct.images.length === 0) {
          transformedProduct.images = [PRODUCT_PLACEHOLDER_IMAGE];
        }

        setProduct(transformedProduct);

        // Set initial quantity to MOQ
        if (transformedProduct.moq > 1) {
          setQuantity(transformedProduct.moq);
        }

        // If variants exist, do NOT pre-select — force user to choose
        // Reset variant and color selection
        setSelectedVariant(null);
        setSelectedSize('');
        setSelectedColor('');

        // Fetch related products (cached for 5 minutes)
        if (productData.category_id) {
          const { data: related } = await cachedQuery<{ data: any; error: any }>(
            `related:${productData.category_id}:${productData.id}`,
            (() => supabase
              .from('products')
              .select('*, product_images(url, position), product_variants(id, name, price, price_ghs, compare_at_price, compare_at_price_ghs, quantity, option2)')
              .eq('status', 'active')
              .eq('category_id', productData.category_id)
              .neq('id', productData.id)
              .limit(4)) as any,
            5 * 60 * 1000
          );

          if (related) {
            setRelatedProducts(related.map((p: any) => mapProductToCard(p)));
          }
        }

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (slug) {
      fetchProduct();
    }
  }, [slug]);

  const hasVariants = product?.variants?.length > 0;
  const hasColors = product?.colors?.length > 0;
  const needsVariantSelection = hasVariants && !selectedVariant;
  const needsColorSelection = hasColors && !selectedColor;

  // Determine the active price: variant price if selected, otherwise base price
  const activeUsd = selectedVariant?.price ?? product?.price ?? 0;
  const activeGhs = selectedVariant?.price_ghs ?? product?.price_ghs ?? null;
  const activePrice = resolveAmount(activeUsd, activeGhs);
  const activePriceUsd = Number(activeUsd) || 0;
  const activeStock = selectedVariant ? (selectedVariant.stock ?? selectedVariant.quantity ?? product?.stockCount ?? 0) : (product?.stockCount ?? 0);

  const handleAddToCart = () => {
    if (!product) return;
    if (needsVariantSelection) return; // Safety check

    // Build variant display string: "Color / Name" or just "Name" or just "Color"
    let variantLabel: string | undefined;
    if (selectedVariant) {
      const color = selectedVariant.color || selectedColor || '';
      const name = selectedVariant.name || '';
      if (color && name) {
        variantLabel = `${color} / ${name}`;
      } else {
        variantLabel = color || name || undefined;
      }
    }

    addToCart({
      id: product.id,
      variantId: selectedVariant?.id ?? null,
      name: product.name,
      price: activePrice,
      currency: isGhana ? 'GHS' : 'USD',
      image: product.images[0],
      quantity: quantity,
      variant: variantLabel,
      slug: product.slug,
      maxStock: activeStock,
      moq: product.moq || 1
    });
  };

  const handleBuyNow = () => {
    handleAddToCart();
    // Client navigation keeps the cart that was just updated.
    router.push('/checkout');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white py-12 flex justify-center items-center">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-blue-700 animate-spin mb-4 block"></i>
          <p className="text-gray-500">Loading product...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-white py-20 flex justify-center items-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Product Not Found</h2>
          <Link href="/shop" className="text-blue-700 hover:underline">Return to Shop</Link>
        </div>
      </div>
    );
  }

  const listing = listingPrices(product, product.variants || []);
  const { minUsd, minGhs } = listing;
  // The "was" price of what is on screen: the chosen variant, else the cheapest option.
  const wasUsd = selectedVariant
    ? selectedVariant.price != null
      ? wasPrice(selectedVariant.price, selectedVariant.compare_at_price)
      : wasPrice(product.price, product.compare_at_price)
    : listing.wasUsd;
  const wasGhs = selectedVariant
    ? selectedVariant.price_ghs != null
      ? wasPrice(selectedVariant.price_ghs, selectedVariant.compare_at_price_ghs)
      : wasPrice(product.price_ghs, product.compare_at_price_ghs)
    : listing.wasGhs;
  const shownUsd = hasVariants && !selectedVariant ? minUsd : activePriceUsd;
  const shownGhs = hasVariants && !selectedVariant ? minGhs : activeGhs;
  // Work the discount out in the currency this visitor sees.
  const inCedis = isGhana && shownGhs != null;
  const shownNow = inCedis ? Number(shownGhs) : shownUsd;
  const shownWas = inCedis ? wasGhs : wasUsd;
  const discount =
    shownWas != null && shownNow > 0 && shownWas > shownNow
      ? Math.round((1 - shownNow / shownWas) * 100)
      : 0;
  // No price in this visitor's market (for example no dollar price set yet).
  const unavailableHere = !(shownNow > 0);

  const productSchema = generateProductSchema({
    name: product.name,
    description: product.description,
    image: product.images[0],
    price: hasVariants ? minUsd : product.price,
    currency: isGhana ? 'GHS' : 'USD',
    sku: product.sku,
    rating: product.rating,
    reviewCount: product.reviewCount,
    availability: product.quantity > 0 ? 'in_stock' : 'out_of_stock',
    category: product.category
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://baddiecurves.com');
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: baseUrl },
    { name: 'Shop', url: `${baseUrl}/shop` },
    { name: product.category, url: `${baseUrl}/shop?category=${product.category.toLowerCase().replace(/\s+/g, '-')}` },
    { name: product.name, url: `${baseUrl}/product/${slug}` }
  ]);

  return (
    <>
      <StructuredData data={productSchema} />
      <StructuredData data={breadcrumbSchema} />

      <main className="min-h-screen bg-white">
        <section className="py-8 bg-gray-50 border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <nav className="flex items-center space-x-2 text-sm flex-wrap gap-y-2">
              <Link href="/" className="text-gray-600 hover:text-blue-700 transition-colors">Home</Link>
              <i className="ri-arrow-right-s-line text-gray-400"></i>
              <Link href="/shop" className="text-gray-600 hover:text-blue-700 transition-colors">Shop</Link>
              <i className="ri-arrow-right-s-line text-gray-400"></i>
              <Link href={product.categories?.slug ? `/shop?category=${encodeURIComponent(product.categories.slug)}` : '/shop'} className="text-gray-600 hover:text-blue-700 transition-colors">{product.category}</Link>
              <i className="ri-arrow-right-s-line text-gray-400"></i>
              <span className="text-gray-900 font-medium truncate max-w-[200px]">{product.name}</span>
            </nav>
          </div>
        </section>

        <section className="py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid lg:grid-cols-2 gap-12">
              <div>
                <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 mb-4 shadow-lg border border-gray-100">
                  <Image
                    src={product.images[selectedImage]}
                    alt={product.name}
                    fill
                    className="object-cover object-center"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    priority
                    quality={80}
                  />
                  {discount > 0 && (
                    <span className="absolute top-6 right-6 bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-full">
                      Save {discount}%
                    </span>
                  )}
                </div>

                {product.images.length > 1 && (
                  <div className="grid grid-cols-4 gap-4">
                    {product.images.map((image: string, index: number) => (
                      <button
                        key={index}
                        onClick={() => setSelectedImage(index)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${selectedImage === index ? 'border-blue-700 shadow-md' : 'border-gray-200 hover:border-gray-300'
                          }`}
                      >
                        <Image
                          src={image}
                          alt={`${product.name} view ${index + 1}`}
                          fill
                          className="object-cover object-center"
                          sizes="(max-width: 1024px) 25vw, 12vw"
                          quality={60}
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col xl:pl-8">
                <div className="flex flex-col mb-4">
                  <div className="flex items-start justify-between mb-3">
                    <p className="text-[11px] tracking-[0.2em] text-gray-500 uppercase font-bold">{product.category}</p>
                    <button
                      type="button"
                      onClick={() =>
                        isInWishlist(product.id)
                          ? removeFromWishlist(product.id)
                          : addToWishlist(mapProductToCard(product))
                      }
                      aria-pressed={isInWishlist(product.id)}
                      aria-label={isInWishlist(product.id) ? 'Remove from wishlist' : 'Add to wishlist'}
                      className="group w-11 h-11 flex-shrink-0 flex items-center justify-center bg-white border border-black/[0.04] hover:border-black/[0.08] rounded-full transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md"
                    >
                      <i className={`${isInWishlist(product.id) ? 'ri-heart-fill text-red-500 scale-110' : 'ri-heart-line text-gray-400 group-hover:text-gray-600'} text-lg transition-all`}></i>
                    </button>
                  </div>
                  <h1 className="text-3xl md:text-4xl lg:text-[44px] font-serif font-medium text-gray-900 leading-[1.1] tracking-tight">{product.name}</h1>
                </div>

                {/* No reviews yet: no stars, rather than a "0.0" rating. */}
                {Number(product.review_count) > 0 && Number(product.rating) > 0 ? (
                <div className="flex items-center mb-7" role="img" aria-label={`Rated ${Number(product.rating).toFixed(1)} out of 5`}>
                  <div className="flex items-center space-x-0.5 mr-3">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <i
                        key={star}
                        className={`${star <= Math.round(product.rating) ? 'ri-star-fill text-gray-900' : 'ri-star-line text-gray-200'} text-[17px]`}
                      ></i>
                    ))}
                  </div>
                  <span className="text-gray-500 text-sm font-medium">{Number(product.rating).toFixed(1)}</span>
                </div>
                ) : (
                  <div className="mb-3"></div>
                )}

                <div className="flex items-baseline space-x-3 mb-8">
                  {unavailableHere ? (
                    <span className="text-lg font-medium text-gray-700">Not available in your region yet</span>
                  ) : hasVariants && !selectedVariant ? (
                    <span className="text-2xl lg:text-[30px] font-medium text-gray-900">
                      <span className="text-lg text-gray-400 font-light mr-1.5">From</span>
                      {formatPrice(minUsd, minGhs)}
                    </span>
                  ) : (
                    <span className="text-2xl lg:text-[30px] font-medium text-gray-900">
                      {formatPrice(activeUsd, activeGhs)}
                    </span>
                  )}
                  {discount > 0 && (
                    <span className="text-lg text-gray-500 line-through decoration-gray-400">
                      {formatComparePrice(wasUsd ?? 0, wasGhs)}
                    </span>
                  )}
                </div>
                {!unavailableHere && formatEquivalents(activePriceUsd) && (
                  <p className="text-sm text-gray-500 -mt-5 mb-8">
                    {formatEquivalents(activePriceUsd)}
                  </p>
                )}

                <p className="text-gray-500 leading-[1.8] mb-10 text-[15.5px] font-light max-w-[95%]">{product.description}</p>

                {/* Color Selector */}
                {hasVariants && product.colors.length > 0 && (
                  <div className="mb-8">
                    <label className="block text-sm font-medium text-gray-900 mb-3 tracking-wide">
                      Color: {selectedColor ? (
                        <span className="text-gray-500 font-normal ml-1">{selectedColor}</span>
                      ) : (
                        <span className="text-red-400 font-normal text-xs ml-1">Please select a color</span>
                      )}
                    </label>
                    <div className="flex flex-wrap gap-2.5">
                      {product.colors.map((color: string) => {
                        const isSelected = selectedColor === color;
                        const colorVariants = product.variants.filter((v: any) => v.color === color);
                        const colorStock = colorVariants.reduce((sum: number, v: any) => sum + (v.stock ?? v.quantity ?? 0), 0);
                        const isOutOfStock = colorStock === 0 && product.stockCount === 0;
                        return (
                          <button
                            key={color}
                            onClick={() => {
                              setSelectedColor(color);
                              // If only one variant for this color, auto-select it
                              const matching = product.variants.filter((v: any) => v.color === color);
                              if (matching.length === 1) {
                                setSelectedVariant(matching[0]);
                                setSelectedSize(matching[0].name);
                              } else {
                                // Reset variant selection so user picks a size too
                                setSelectedVariant(null);
                                setSelectedSize('');
                              }
                            }}
                            disabled={isOutOfStock}
                            className={`px-4 py-2 rounded-xl border font-medium transition-all whitespace-nowrap cursor-pointer flex items-center gap-2.5 text-[14px] ${isSelected
                              ? 'border-gray-900 ring-1 ring-gray-900/10 bg-white text-gray-900 shadow-sm'
                              : isOutOfStock
                                ? 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50/50'
                                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50/50'
                              }`}
                          >
                            <span className="w-4 h-4 rounded-full border border-black/10 flex-shrink-0" style={{ backgroundColor: product.colorHexMap?.[color] || colorNameToHex(color) }}></span>
                            <span>{color}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Size / Name Variant Selector */}
                {hasVariants && (() => {
                  // Filter variants: if colors exist and one is selected, show only matching; otherwise show all
                  const hasColors = product.colors.length > 0;
                  const visibleVariants = hasColors && selectedColor
                    ? product.variants.filter((v: any) => v.color === selectedColor)
                    : hasColors
                      ? [] // Don't show name variants until a color is picked
                      : product.variants;

                  // Check if we need to show the name selector (skip if all visible variants have the same name or only 1)
                  const uniqueNames = [...new Set(visibleVariants.map((v: any) => v.name).filter(Boolean))];
                  const showNameSelector = visibleVariants.length > 1 || (!hasColors && visibleVariants.length > 0);

                  if (!showNameSelector && !hasColors) {
                    // Single variant with no colors — show standard picker
                    return (
                      <div className="mb-8">
                        <label className="block text-sm font-medium text-gray-900 mb-3 tracking-wide">
                          Variant: {selectedVariant ? (
                            <span className="text-gray-500 font-normal ml-1">{selectedVariant.name}</span>
                          ) : (
                            <span className="text-red-400 font-normal text-xs ml-1">Please select a variant</span>
                          )}
                        </label>
                        <div className="flex flex-wrap gap-2.5">
                          {product.variants.map((variant: any) => {
                            const isSelected = selectedVariant?.id === variant.id || selectedVariant?.name === variant.name;
                            const variantStock = variant.stock ?? variant.quantity ?? 0;
                            const isOutOfStock = variantStock === 0 && product.stockCount === 0;
                            return (
                              <button
                                key={variant.id || variant.name}
                                onClick={() => {
                                  setSelectedVariant(variant);
                                  setSelectedSize(variant.name);
                                }}
                                disabled={isOutOfStock}
                                className={`px-5 py-2.5 rounded-xl border font-medium transition-all whitespace-nowrap cursor-pointer flex flex-col items-center min-w-[5rem] ${isSelected
                                  ? 'border-gray-900 ring-1 ring-gray-900/10 bg-white text-gray-900 shadow-sm'
                                  : isOutOfStock
                                    ? 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50/50'
                                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50/50'
                                  }`}
                              >
                                <span className="text-[14px]">{variant.name}</span>
                                <span className={`text-[11px] mt-0.5 ${isSelected ? 'text-gray-500' : 'text-gray-400'}`}>
                                  {formatPrice(variant.price || product.price, variant.price_ghs ?? product.price_ghs)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  if (visibleVariants.length > 1) {
                    return (
                      <div className="mb-8">
                        <label className="block text-sm font-medium text-gray-900 mb-3 tracking-wide">
                          Size / Type: {selectedVariant ? (
                            <span className="text-gray-500 font-normal ml-1">{selectedVariant.name}</span>
                          ) : (
                            <span className="text-red-400 font-normal text-xs ml-1">Please select</span>
                          )}
                        </label>
                        <div className="flex flex-wrap gap-2.5">
                          {visibleVariants.map((variant: any) => {
                            const isSelected = selectedVariant?.id === variant.id;
                            const variantStock = variant.stock ?? variant.quantity ?? 0;
                            const isOutOfStock = variantStock === 0 && product.stockCount === 0;
                            return (
                              <button
                                key={variant.id || variant.name}
                                onClick={() => {
                                  setSelectedVariant(variant);
                                  setSelectedSize(variant.name);
                                }}
                                disabled={isOutOfStock}
                                className={`px-5 py-2.5 rounded-xl border font-medium transition-all whitespace-nowrap cursor-pointer flex flex-col items-center min-w-[4.5rem] ${isSelected
                                  ? 'border-gray-900 ring-1 ring-gray-900/10 bg-white text-gray-900 shadow-sm'
                                  : isOutOfStock
                                    ? 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50/50'
                                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50/50'
                                  }`}
                              >
                                <span className="text-[14px]">{variant.name}</span>
                                <span className={`text-[11px] mt-0.5 ${isSelected ? 'text-gray-500' : 'text-gray-400'}`}>
                                  {formatPrice(variant.price || product.price, variant.price_ghs ?? product.price_ghs)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  return null;
                })()}

                <div className="mb-10">
                  <label className="block text-sm font-medium text-gray-900 mb-3 tracking-wide">Quantity</label>
                  <div className="flex items-center space-x-5">
                    <div className="flex items-center bg-gray-50/80 rounded-xl border border-black/[0.04]">
                      <button
                        onClick={() => setQuantity(Math.max(product.moq || 1, quantity - 1))}
                        className="w-12 h-12 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-white transition-all rounded-l-xl cursor-pointer"
                        disabled={activeStock === 0 || quantity <= (product.moq || 1)}
                      >
                        <i className="ri-subtract-line text-lg"></i>
                      </button>
                      <input
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(product.moq || 1, Math.min(activeStock, parseInt(e.target.value) || (product.moq || 1))))}
                        className="w-14 h-12 text-center bg-transparent border-none focus:ring-0 text-[15px] font-medium text-gray-900"
                        min={product.moq || 1}
                        max={activeStock}
                        disabled={activeStock === 0}
                      />
                      <button
                        onClick={() => setQuantity(Math.min(activeStock, quantity + 1))}
                        className="w-12 h-12 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-white transition-all rounded-r-xl cursor-pointer"
                        disabled={activeStock === 0}
                      >
                        <i className="ri-add-line text-lg"></i>
                      </button>
                    </div>
                    <div className="flex flex-col">
                      {product.moq > 1 && (
                        <span className="text-gray-500 font-medium text-xs tracking-wide">
                          <i className="ri-information-line mr-1 text-gray-400"></i>
                          Min. order: {product.moq} units
                        </span>
                      )}
                      {activeStock > 10 && (
                        <span className="text-gray-500 font-medium text-xs flex items-center tracking-wide">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2 shadow-[0_0_8px_rgba(52,211,153,0.5)] animate-pulse"></span>
                          {activeStock} in stock
                        </span>
                      )}
                      {activeStock > 0 && activeStock <= 10 && (
                        <span className="text-amber-600 font-medium text-xs flex items-center tracking-wide">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-2 shadow-[0_0_8px_rgba(251,191,36,0.5)] pulse-fast"></span>
                          Only {activeStock} left
                        </span>
                      )}
                      {activeStock === 0 && (
                        <span className="text-gray-400 font-medium text-xs flex items-center tracking-wide">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300 mr-2"></span>
                          Out of Stock
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3.5 mb-10">
                  <button
                    disabled={unavailableHere || activeStock === 0 || needsVariantSelection || needsColorSelection}
                    className={`flex-1 group relative overflow-hidden bg-gray-900 text-white py-4 px-6 rounded-xl font-medium transition-all duration-500 flex items-center justify-center space-x-2.5 text-[15px] shadow-[0_4px_14px_rgba(0,0,0,0.1)] hover:shadow-[0_8px_25px_rgba(0,0,0,0.15)] hover:-translate-y-0.5 whitespace-nowrap cursor-pointer ${(unavailableHere || activeStock === 0 || needsVariantSelection || needsColorSelection) ? 'opacity-50 cursor-not-allowed hover:-translate-y-0' : ''}`}
                    onClick={handleAddToCart}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                    <i className="ri-shopping-cart-2-line text-lg relative z-10"></i>
                    <span className="relative z-10 tracking-wide">{unavailableHere ? 'Not available here' : activeStock === 0 ? 'Out of Stock' : needsColorSelection ? 'Select a Color' : needsVariantSelection ? 'Select a Variant' : 'Add to Cart'}</span>
                  </button>
                  {!unavailableHere && activeStock > 0 && !needsVariantSelection && !needsColorSelection && (
                    <button
                      onClick={handleBuyNow}
                      className="sm:w-[160px] bg-white border border-black/[0.06] hover:border-black/[0.12] hover:bg-gray-50 text-gray-900 py-4 rounded-xl font-medium transition-all duration-300 whitespace-nowrap cursor-pointer shadow-sm tracking-wide"
                    >
                      Buy Now
                    </button>
                  )}
                </div>

                <div className="border-t border-black/[0.04] pt-8 space-y-4">
                  <div className="flex items-center text-gray-500 text-[14px] font-light">
                    <i className="ri-store-2-line text-lg text-gray-400 mr-3.5"></i>
                    <span>Free store pickup available</span>
                  </div>
                  <div className="flex items-center text-gray-500 text-[14px] font-light">
                    <i className="ri-arrow-left-right-line text-lg text-gray-400 mr-3.5"></i>
                    <span>30-day easy returns and exchanges</span>
                  </div>
                  <div className="flex items-center text-gray-500 text-[14px] font-light">
                    <i className="ri-shield-check-line text-lg text-gray-400 mr-3.5"></i>
                    <span>Secure payment & buyer protection</span>
                  </div>
                  {product.sku && (
                    <div className="flex items-center text-gray-500 text-[14px] font-light">
                      <i className="ri-barcode-line text-lg text-gray-400 mr-3.5"></i>
                      <span>SKU <span className="text-gray-400 ml-1.5">{product.sku}</span></span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="border-b border-gray-300 mb-8">
              <div className="flex space-x-4 sm:space-x-8 overflow-x-auto">
                {['description', ...(product.features.length > 0 ? ['features'] : []), ...(product.care ? ['care'] : []), 'reviews'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`pb-4 font-semibold transition-colors relative whitespace-nowrap cursor-pointer ${activeTab === tab
                      ? 'text-blue-700 border-b-2 border-blue-700'
                      : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {activeTab === 'description' && (
              <div className="prose max-w-none">
                <p className="text-gray-700 text-lg leading-relaxed">{product.description}</p>
              </div>
            )}

            {activeTab === 'features' && product.features.length > 0 && (
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-6">Key Features</h3>
                <ul className="grid md:grid-cols-2 gap-4">
                  {product.features.map((feature: string, index: number) => (
                    <li key={index} className="flex items-start">
                      <i className="ri-checkbox-circle-fill text-blue-700 text-xl mr-3 mt-1"></i>
                      <span className="text-gray-700 text-lg">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {activeTab === 'care' && product.care && (
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-6">Care Instructions</h3>
                <p className="text-gray-700 text-lg leading-relaxed">{product.care}</p>
              </div>
            )}

            {activeTab === 'reviews' && (
              <div id="reviews">
                <ProductReviews productId={product.id} />
              </div>
            )}
          </div>
        </section>

        {relatedProducts.length > 0 && (
          <section className="py-20 bg-white" data-product-shop>
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
              <div className="text-center mb-12">
                <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">You May Also Like</h2>
                <p className="text-lg text-gray-600">Curated recommendations based on this product</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {relatedProducts.map((p) => (
                  <ProductCard key={p.id} {...p} />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
