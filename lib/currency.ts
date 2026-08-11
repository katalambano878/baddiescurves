'use client';

import { useEffect, useMemo, useState } from 'react';
import { money } from '@/lib/format-money';

const USD_TO_GBP = 0.79;
const USD_TO_EUR = 0.92;
const USD_TO_GHS = 15.5;

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
export function useIsGhana(): boolean {
  const [country, setCountry] = useState(() => getCountryCookie());

  useEffect(() => {
    let cancelled = false;

    async function refreshGeo() {
      try {
        const res = await fetch('/api/geo', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const code = String(data?.country || '').toUpperCase();
        if (!cancelled && /^[A-Z]{2}$/.test(code)) {
          setCountryCookie(code);
          setCountry(code);
        }
      } catch {
        if (!cancelled) setCountry(getCountryCookie());
      }
    }

    refreshGeo();
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
  currencyLabel: string;
}

export function useCurrency(): CurrencyHelpers {
  const isGhana = useIsGhana();

  return useMemo(() => {
    const resolve = (usdAmount: number, ghsAmount?: number | null): string => {
      if (isGhana) {
        return formatGHS(ghsAmount != null ? ghsAmount : usdAmount * USD_TO_GHS);
      }
      return formatUSD(usdAmount);
    };

    return {
      isGhana,
      formatPrice: resolve,
      formatComparePrice: resolve,
      formatEquivalents: (usdPrice: number) => {
        if (isGhana) return null;
        return formatUsdEquivalents(usdPrice);
      },
      currencyLabel: isGhana ? 'GH₵' : '$',
    };
  }, [isGhana]);
}
