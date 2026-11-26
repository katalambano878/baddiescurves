'use client';

import { useEffect, useMemo, useState } from 'react';
import { money } from '@/lib/format-money';
import { USD_TO_GHS } from '@/lib/market';

const USD_TO_GBP = 0.79;
const USD_TO_EUR = 0.92;

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const gbpFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

const eurFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

const ghsFormatter = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  currencyDisplay: 'symbol',
});

export function formatUSD(amount: number): string {
  return usdFormatter.format(Number(amount || 0));
}

export function formatGHS(amount: number): string {
  return `GH₵${money(amount || 0)}`;
}

export function formatGBPFromUSD(amount: number): string {
  return gbpFormatter.format(Number(amount || 0) * USD_TO_GBP);
}

export function formatEURFromUSD(amount: number): string {
  return eurFormatter.format(Number(amount || 0) * USD_TO_EUR);
}

export function formatUsdEquivalents(amount: number): string {
  return `${formatGBPFromUSD(amount)} / ${formatEURFromUSD(amount)}`;
}

function getCountryCookie(): string {
  if (typeof document === 'undefined') return 'US';
  const match = document.cookie.match(/(?:^|;\s*)country=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : 'US';
}

function setCountryCookie(code: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `country=${encodeURIComponent(code)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

/**
 * Ghana detection for pricing + payments.
 * Refreshes via /api/geo (IP lookup) because Coolify often has no CF-IPCountry
 * and an early default country=US cookie would hide Moolre forever.
 */
let geoLookup: Promise<string | null> | null = null;

/**
 * One country lookup per page load, shared by every component that asks.
 * A lookup that failed on the server comes back as a guess (source "default");
 * that guess never replaces a country we already know, so a shopper's
 * currency cannot flip because one lookup timed out.
 */
function lookupCountry(): Promise<string | null> {
  if (!geoLookup) {
    geoLookup = (async () => {
      const hadCookie = typeof document !== 'undefined' && /(?:^|;\s*)country=/.test(document.cookie);
      const known = getCountryCookie();
      // The shopper picked their market themselves: that choice stands.
      if (hadCookie && /(?:^|;\s*)country_choice=1/.test(document.cookie)) return known;
      try {
        const res = await fetch('/api/geo', { cache: 'no-store' });
        if (!res.ok) return hadCookie ? known : null;
        const data = await res.json();
        const code = String(data?.country || '').toUpperCase();
        if (!/^[A-Z]{2}$/.test(code)) return hadCookie ? known : null;
        if (data?.source === 'default' && hadCookie) return known;
        setCountryCookie(code);
        return code;
      } catch {
        return hadCookie ? known : null;
      }
    })();
  }
  return geoLookup;
}

/**
 * Lets a shopper pick their market when the automatic guess is wrong (a VPN,
 * a failed lookup, travelling). Ghana pays in cedis by Mobile Money; everyone
 * else pays in dollars by PayPal. The page reloads so every price follows.
 */
export function chooseMarket(market: 'GH' | 'INTL') {
  if (typeof document === 'undefined') return;
  setCountryCookie(market === 'GH' ? 'GH' : 'US');
  document.cookie = `country_choice=1; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  window.location.reload();
}

export function useIsGhana(): boolean {
  const [country, setCountry] = useState(() => getCountryCookie());

  useEffect(() => {
    let cancelled = false;
    lookupCountry().then((code) => {
      if (!cancelled && code) setCountry(code);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return country === 'GH';
}

interface CurrencyHelpers {
  isGhana: boolean;
  formatPrice: (usdPrice: number, ghsPrice?: number | null) => string;
  formatComparePrice: (usdCompare: number, ghsCompare?: number | null) => string;
  formatEquivalents: (usdPrice: number) => string | null;
  /** Numeric amount for the visitor's market (cart / checkout). */
  resolveAmount: (usdPrice: number, ghsPrice?: number | null) => number;
  currencyLabel: string;
}

/** Lowest USD / GHS prices across variants, falling back to product-level prices. */
export function minVariantPrices(
  variants: Array<{ price?: number | null; price_ghs?: number | null }>,
  productPrice: number,
  productPriceGhs?: number | null
): { minUsd: number; minGhs: number | null } {
  if (!variants?.length) {
    return {
      minUsd: Number(productPrice) || 0,
      minGhs: productPriceGhs != null ? Number(productPriceGhs) : null,
    };
  }

  const usdValues = variants.map((v) => Number(v.price ?? productPrice) || 0);
  const ghsValues = variants
    .map((v) => (v.price_ghs != null ? Number(v.price_ghs) : productPriceGhs != null ? Number(productPriceGhs) : null))
    .filter((n): n is number => n != null && Number.isFinite(n));

  return {
    minUsd: Math.min(...usdValues),
    minGhs: ghsValues.length ? Math.min(...ghsValues) : productPriceGhs != null ? Number(productPriceGhs) : null,
  };
}

type Priced = {
  price?: number | string | null;
  price_ghs?: number | string | null;
  compare_at_price?: number | string | null;
  compare_at_price_ghs?: number | string | null;
};

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** The "was" price, only when it is really above the price being charged. */
export function wasPrice(price: unknown, compare: unknown): number | null {
  const p = numOrNull(price);
  const c = numOrNull(compare);
  return p != null && c != null && c > p ? c : null;
}

export interface ListingPrices {
  /** Lowest price charged, per currency. */
  minUsd: number;
  minGhs: number | null;
  /** Regular price of that cheapest option while it is on sale, else null. */
  wasUsd: number | null;
  wasGhs: number | null;
  onSale: boolean;
}

/**
 * Prices for a product card or listing: the cheapest option in each currency
 * and its regular price when it is discounted. Variant products are read from
 * their variants, because that is what checkout charges.
 */
export function listingPrices(product: Priced, variants: Priced[] = []): ListingPrices {
  type Option = { price: number; was: number | null };
  const cheapest = (options: Option[]): Option | null =>
    options.length ? options.reduce((a, b) => (b.price < a.price ? b : a)) : null;

  let usd: Option | null;
  let ghs: Option | null;

  if (!variants.length) {
    const pUsd = numOrNull(product.price) ?? 0;
    const pGhs = numOrNull(product.price_ghs);
    usd = { price: pUsd, was: wasPrice(pUsd, product.compare_at_price) };
    ghs = pGhs != null ? { price: pGhs, was: wasPrice(pGhs, product.compare_at_price_ghs) } : null;
  } else {
    usd = cheapest(
      variants.map((v) =>
        numOrNull(v.price) != null
          ? { price: numOrNull(v.price) as number, was: wasPrice(v.price, v.compare_at_price) }
          : { price: numOrNull(product.price) ?? 0, was: wasPrice(product.price, product.compare_at_price) }
      )
    );
    ghs = cheapest(
      variants
        .map((v) =>
          numOrNull(v.price_ghs) != null
            ? { price: numOrNull(v.price_ghs) as number, was: wasPrice(v.price_ghs, v.compare_at_price_ghs) }
            : numOrNull(product.price_ghs) != null
              ? {
                  price: numOrNull(product.price_ghs) as number,
                  was: wasPrice(product.price_ghs, product.compare_at_price_ghs),
                }
              : null
        )
        .filter((o): o is Option => o != null)
    );
  }

  return {
    minUsd: usd?.price ?? 0,
    minGhs: ghs?.price ?? null,
    wasUsd: usd?.was ?? null,
    wasGhs: ghs?.was ?? null,
    onSale: (usd?.was ?? null) != null || (ghs?.was ?? null) != null,
  };
}

export function useCurrency(): CurrencyHelpers {
  const isGhana = useIsGhana();

  return useMemo(() => {
    const resolveAmount = (usdAmount: number, ghsAmount?: number | null): number => {
      if (isGhana) {
        if (ghsAmount != null && Number.isFinite(Number(ghsAmount))) return Number(ghsAmount);
        // Last resort only — prefer explicit Ghana prices on products/variants
        return Number(usdAmount || 0) * USD_TO_GHS;
      }
      return Number(usdAmount || 0);
    };

    const resolve = (usdAmount: number, ghsAmount?: number | null): string => {
      if (isGhana) return formatGHS(resolveAmount(usdAmount, ghsAmount));
      return formatUSD(usdAmount);
    };

    return {
      isGhana,
      formatPrice: resolve,
      formatComparePrice: resolve,
      resolveAmount,
      formatEquivalents: (usdPrice: number) => {
        if (isGhana) return null;
        return formatUsdEquivalents(usdPrice);
      },
      currencyLabel: isGhana ? 'GH₵' : '$',
    };
  }, [isGhana]);
}
