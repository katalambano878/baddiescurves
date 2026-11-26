'use client';

import { useEffect, useState } from 'react';
import { useCart } from '@/context/CartContext';
import type { CartQuote } from '@/hooks/useCartQuote';

/**
 * Discount code entry for the cart and checkout. The code is checked by the
 * server as part of pricing the cart; this only shows what the server said.
 */
export default function CouponBox({
  coupon,
  checking,
}: {
  coupon: CartQuote['coupon'];
  checking: boolean;
}) {
  const { couponCode, setCouponCode, formatCartMoney } = useCart();
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (couponCode) setOpen(true);
  }, [couponCode]);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const code = draft.trim();
    if (!code) return;
    setCouponCode(code);
    setDraft('');
  };

  if (couponCode && coupon?.ok && coupon.code === couponCode) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-900 truncate">
            <i className="ri-coupon-2-line mr-1.5" aria-hidden="true"></i>
            {coupon.message}
          </p>
          <p className="text-xs text-emerald-800">You save {formatCartMoney(coupon.discount)}</p>
        </div>
        <button
          type="button"
          onClick={() => setCouponCode('')}
          className="text-sm font-medium text-emerald-900 underline underline-offset-2 hover:no-underline flex-shrink-0"
        >
          Remove
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-gray-900 underline underline-offset-2 hover:no-underline"
      >
        Have a discount code?
      </button>
    );
  }

  const rejected = couponCode && coupon && !coupon.ok && coupon.code === couponCode;

  return (
    <form onSubmit={apply} noValidate>
      <label htmlFor="coupon-code" className="block text-sm font-medium text-gray-900 mb-2">
        Discount code
      </label>
      <div className="flex gap-2">
        <input
          id="coupon-code"
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          placeholder={couponCode || 'Enter code'}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          aria-invalid={rejected ? true : undefined}
          aria-describedby={rejected ? 'coupon-code-error' : undefined}
          className={`flex-1 min-w-0 px-4 py-3 border-2 rounded-lg text-base uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            rejected ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        <button
          type="submit"
          disabled={checking || !draft.trim()}
          className="px-5 py-3 rounded-lg bg-gray-900 text-white font-semibold hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {checking && couponCode ? 'Checking…' : 'Apply'}
        </button>
      </div>
      {rejected && (
        <p id="coupon-code-error" role="alert" className="mt-2 text-sm text-red-700">
          {coupon!.message}{' '}
          <button
            type="button"
            onClick={() => setCouponCode('')}
            className="underline underline-offset-2 hover:no-underline"
          >
            Clear
          </button>
        </p>
      )}
    </form>
  );
}
