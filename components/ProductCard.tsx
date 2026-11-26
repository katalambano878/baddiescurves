'use client';

import { useState } from 'react';
import Link from 'next/link';
import LazyImage from './LazyImage';
import { useCart } from '@/context/CartContext';
import { listingPrices, useCurrency } from '@/lib/currency';

// Map common color names to hex values for swatches
const COLOR_MAP: Record<string, string> = {
  black: '#000000', white: '#FFFFFF', red: '#EF4444', blue: '#3B82F6',
  navy: '#1E3A5F', green: '#22C55E', yellow: '#EAB308', orange: '#F97316',
  pink: '#EC4899', purple: '#A855F7', brown: '#92400E', beige: '#D4C5A9',
  grey: '#6B7280', gray: '#6B7280', cream: '#FFFDD0', teal: '#14B8A6',
  maroon: '#800000', coral: '#FF7F50', burgundy: '#800020', olive: '#808000',
  tan: '#D2B48C', khaki: '#C3B091', charcoal: '#36454F', ivory: '#FFFFF0',
  gold: '#FFD700', silver: '#C0C0C0', rose: '#FF007F', lavender: '#E6E6FA',
  mint: '#98FB98', peach: '#FFDAB9', wine: '#722F37', denim: '#1560BD',
  nude: '#E3BC9A', camel: '#C19A6B', sage: '#BCB88A', rust: '#B7410E',
  mustard: '#FFDB58', plum: '#8E4585', lilac: '#C8A2C8', stone: '#928E85',
  sand: '#C2B280', taupe: '#483C32', mauve: '#E0B0FF', sky: '#87CEEB',
  forest: '#228B22', cobalt: '#0047AB', emerald: '#50C878', scarlet: '#FF2400',
  aqua: '#00FFFF', turquoise: '#40E0D0', indigo: '#4B0082', crimson: '#DC143C',
  magenta: '#FF00FF', cyan: '#00FFFF', chocolate: '#7B3F00', coffee: '#6F4E37',
};

export function getColorHex(colorName: string): string | null {
  const lower = colorName.toLowerCase().trim();
  if (COLOR_MAP[lower]) return COLOR_MAP[lower];
  // Try partial match (e.g. "Light Blue" -> "blue")
  for (const [key, val] of Object.entries(COLOR_MAP)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

export interface ColorVariant {
  name: string;
  hex: string;
}

/** Shown when a product has no photo yet. */
export const PRODUCT_PLACEHOLDER_IMAGE = '/placeholder-product.svg';

/**
 * Turns a product row (with its product_variants and product_images) into
 * ProductCard props. One place for prices, sale state, stock and swatches, so
 * every listing shows the same thing.
 */
export function mapProductToCard(product: any, opts: { badge?: string } = {}) {
  const variants: any[] = product.product_variants || [];
  const hasVariants = variants.length > 0;
  const prices = listingPrices(product, variants);
  const effectiveStock = hasVariants
    ? variants.reduce((sum: number, v: any) => sum + (v.quantity || 0), 0)
    : product.quantity || 0;

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

  const images: any[] = [...(product.product_images || [])].sort(
    (a, b) => (a?.position ?? 0) - (b?.position ?? 0)
  );

  return {
    id: product.id as string,
    slug: product.slug as string,
    name: product.name as string,
    price: Number(product.price) || 0,
    price_ghs: product.price_ghs != null ? Number(product.price_ghs) : null,
    originalPrice: prices.wasUsd ?? undefined,
    originalPrice_ghs: prices.wasGhs,
    image: images[0]?.url || PRODUCT_PLACEHOLDER_IMAGE,
    rating: product.rating_avg || 0,
    reviewCount: product.review_count || 0,
    badge: prices.onSale ? 'Sale' : opts.badge,
    inStock: effectiveStock > 0,
    maxStock: effectiveStock > 0 ? effectiveStock : 0,
    moq: product.moq || 1,
    category: product.categories?.name as string | undefined,
    hasVariants,
    minVariantPrice: hasVariants ? prices.minUsd : undefined,
    minVariantPrice_ghs: hasVariants ? prices.minGhs : product.price_ghs != null ? Number(product.price_ghs) : null,
    colorVariants,
  };
}

interface ProductCardProps {
  id: string;
  slug: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  rating?: number;
  reviewCount?: number;
  badge?: string;
  inStock?: boolean;
  maxStock?: number;
  moq?: number;
  hasVariants?: boolean;
  minVariantPrice?: number;
  colorVariants?: ColorVariant[];
  price_ghs?: number | null;
  originalPrice_ghs?: number | null;
  minVariantPrice_ghs?: number | null;
}

export default function ProductCard({
  id,
  slug,
  name,
  price,
  originalPrice,
  image,
  rating = 5,
  reviewCount = 0,
  badge,
  inStock = true,
  maxStock,
  moq = 1,
  hasVariants = false,
  minVariantPrice,
  colorVariants = [],
  price_ghs,
  originalPrice_ghs,
  minVariantPrice_ghs
}: ProductCardProps) {
  const { addToCart } = useCart();
  const { formatPrice, formatComparePrice, formatEquivalents, resolveAmount, isGhana } = useCurrency();
  const cartMaxStock = Math.max(0, maxStock ?? 0);
  const cartPrice = resolveAmount(price, price_ghs);
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const displayPrice = hasVariants && minVariantPrice != null ? minVariantPrice : price;
  const displayPriceGhs = hasVariants ? minVariantPrice_ghs : price_ghs;
  // Work the discount out in the currency this visitor sees.
  const inCedis = isGhana && displayPriceGhs != null;
  const shownPrice = inCedis ? Number(displayPriceGhs) : displayPrice;
  const shownWas = inCedis ? originalPrice_ghs : originalPrice;
  const discount =
    shownWas != null && shownPrice > 0 && shownWas > shownPrice
      ? Math.round((1 - shownPrice / shownWas) * 100)
      : 0;
  // No price in this visitor's market (for example no dollar price set yet).
  const unavailable = !(shownPrice > 0);
  const canBuy = inStock && !unavailable;
  const MAX_SWATCHES = 5;

  return (
    <div className="group flex flex-col h-full bg-white rounded-[1.5rem] border border-black/[0.04] p-2.5 sm:p-3 hover:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.06)] hover:border-black/[0.08] transition-all duration-700 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]">
      <Link href={`/product/${slug}`} className="relative block aspect-[4/5] overflow-hidden rounded-[1rem] bg-[#FAFAFA] mb-5">
        <LazyImage
          src={image}
          alt={name}
          className="w-full h-full object-cover object-top transition-transform duration-1000 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] group-hover:scale-[1.04]"
        />

        {/* Badges */}
        <div className="absolute top-4 left-4 flex flex-col gap-2 z-20">
          {badge && (
            <span className="bg-white/80 backdrop-blur-xl text-gray-900 border border-white/40 text-[9px] uppercase tracking-[0.2em] font-bold px-3 py-1.5 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
              {badge}
            </span>
          )}
          {discount > 0 && (
            <span className="bg-red-500/90 backdrop-blur-md text-white border border-red-500/20 text-[9px] uppercase tracking-[0.2em] font-bold px-3 py-1.5 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
              -{discount}%
            </span>
          )}
        </div>

        {/* Out of stock overlay */}
        {!inStock && (
          <div className="absolute inset-0 bg-white/40 backdrop-blur-sm flex items-center justify-center z-10">
            <span className="bg-black/90 text-white px-5 py-2.5 rounded-full text-sm font-medium tracking-wide shadow-xl">
              Out of Stock
            </span>
          </div>
        )}

        {/* Hover Actions */}
        {canBuy && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hidden lg:flex z-20 bg-black/[0.02] backdrop-blur-[2px]">
            {hasVariants ? (
              <span className="bg-white/95 backdrop-blur-2xl text-gray-900 border border-white/40 hover:bg-gray-900 hover:text-white hover:border-gray-900 px-6 py-3.5 rounded-full text-[10px] uppercase tracking-[0.2em] font-semibold shadow-[0_8px_32px_rgba(0,0,0,0.12)] transition-all duration-500 flex items-center justify-center space-x-2 translate-y-4 group-hover:translate-y-0">
                <span>Configure</span>
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  addToCart({ id, name, price: cartPrice, image, quantity: moq, slug, maxStock: cartMaxStock, moq });
                }}
                className="bg-white/95 backdrop-blur-2xl text-gray-900 border border-white/40 hover:bg-gray-900 hover:text-white hover:border-gray-900 px-6 py-3.5 rounded-full text-[10px] uppercase tracking-[0.2em] font-semibold shadow-[0_8px_32px_rgba(0,0,0,0.12)] transition-all duration-500 flex items-center justify-center space-x-2 translate-y-4 group-hover:translate-y-0"
              >
                <span>{moq > 1 ? `Add ${moq} to Cart` : 'Quick Add'}</span>
              </button>
            )}
          </div>
        )}
      </Link>

      <div className="flex flex-col flex-grow px-2 items-center text-center pb-2">
        <Link href={`/product/${slug}`}>
          <h3 className="font-serif text-[15.5px] leading-[1.4] text-gray-900 mb-2 group-hover:text-black/60 transition-colors line-clamp-2">
            {name}
          </h3>
        </Link>

        {colorVariants.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 mb-3 mt-1">
            {colorVariants.slice(0, MAX_SWATCHES).map((color) => (
              <button
                key={color.name}
                title={color.name}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveColor(activeColor === color.name ? null : color.name);
                }}
                className={`w-3.5 h-3.5 rounded-full border transition-all duration-300 flex-shrink-0 relative ${activeColor === color.name
                    ? 'ring-1 ring-offset-2 ring-gray-900 scale-110'
                    : 'hover:scale-110 ring-1 ring-transparent hover:ring-gray-300 hover:ring-offset-1'
                  } ${color.hex === '#FFFFFF' ? 'border-gray-200' : 'border-transparent'}`}
                style={{ backgroundColor: color.hex }}
              />
            ))}
            {colorVariants.length > MAX_SWATCHES && (
              <span className="text-[10px] text-gray-400 font-medium ml-1">+{colorVariants.length - MAX_SWATCHES}</span>
            )}
          </div>
        )}

        <div className="flex flex-col items-center justify-center mt-auto pt-2">
          {unavailable ? (
            <span className="text-gray-600 font-medium text-[12.5px] tracking-wide">Not available in your region yet</span>
          ) : hasVariants && minVariantPrice != null ? (
            <span className={`font-medium text-[13.5px] tracking-wide ${discount > 0 ? 'text-red-600' : 'text-gray-900'}`}>From {formatPrice(minVariantPrice, minVariantPrice_ghs)}</span>
          ) : (
            <span className={`font-medium text-[13.5px] tracking-wide ${discount > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatPrice(price, price_ghs)}</span>
          )}
          {discount > 0 && (
            <span className="text-[12px] text-gray-500 line-through decoration-gray-400/70">{formatComparePrice(originalPrice ?? 0, originalPrice_ghs)}</span>
          )}
          {!unavailable && formatEquivalents(displayPrice) && (
            <span className="text-[11px] text-gray-500 mt-1">
              {formatEquivalents(displayPrice)}
            </span>
          )}
        </div>

        {/* Mobile Action Button */}
        <div className="mt-4 w-full lg:hidden">
          {hasVariants ? (
            <Link
              href={`/product/${slug}`}
              className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 py-2.5 rounded-xl text-[10px] uppercase tracking-[0.2em] font-semibold hover:bg-gray-100 active:bg-gray-200 transition-colors flex items-center justify-center"
            >
              <span>Configure</span>
            </Link>
          ) : (
            <button
              onClick={(e) => {
                e.preventDefault();
                addToCart({ id, name, price: cartPrice, image, quantity: moq, slug, maxStock: cartMaxStock, moq });
              }}
              disabled={!canBuy}
              className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 py-2.5 rounded-xl text-[10px] uppercase tracking-[0.2em] font-semibold hover:bg-gray-100 active:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <span>{moq > 1 ? `Add ${moq}` : 'Add to Cart'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
