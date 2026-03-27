'use client';

import { useEffect, useMemo, useState } from 'react';

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
  return `GH₵${Number(amount || 0).toFixed(2)}`;
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
  return match ? match[1] : 'US';
}

export function useIsGhana(): boolean {
  const [country, setCountry] = useState(() => getCountryCookie());

  useEffect(() => {
    setCountry(getCountryCookie());
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
