'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCart } from '@/context/CartContext';

export type CartQuote = {
  currency: 'GHS' | 'USD';
  lines: Array<{
    productId: string;
    variantId: string | null;
    name: string;
    variantLabel: string | null;
    image: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    stock: number;
    problem: string | null;
  }>;
  subtotal: number;
  shipping: { amount: number; label: string };
  discount: number;
  total: number;
  coupon: { ok: boolean; code: string; message: string; type: string | null; discount: number } | null;
  problems: string[];
};

/**
 * The server's price for the current cart: lines, delivery, discount code and
 * total. Re-asks whenever the cart, the code or the delivery choice changes.
 */
export function useCartQuote(opts: {
  deliveryMethod?: string;
  countryCode?: string;
  email?: string;
  phone?: string;
} = {}) {
  const { cartLines, currency, couponCode, isReady } = useCart();
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const latest = useRef(0);

  const linesKey = JSON.stringify(cartLines);
  const { deliveryMethod, countryCode, email, phone } = opts;

  useEffect(() => {
    if (!isReady) return;
    if (cartLines.length === 0) {
      setQuote(null);
      setLoading(false);
      setError(null);
      return;
    }
    const run = ++latest.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/storefront/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: cartLines,
            currency,
            deliveryMethod,
            countryCode,
            couponCode: couponCode || undefined,
            email: email || undefined,
            phone: phone || undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (run !== latest.current) return;
        if (!res.ok || !json?.success) {
          setError(json?.message || 'We could not price your cart. Please try again.');
        } else {
          setQuote(json.quote);
          setError(null);
        }
      } catch {
        if (run === latest.current) setError('We could not reach the shop. Check your connection and try again.');
      } finally {
        if (run === latest.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, linesKey, currency, couponCode, deliveryMethod, countryCode, email, phone, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  return { quote, loading, error, refresh };
}
