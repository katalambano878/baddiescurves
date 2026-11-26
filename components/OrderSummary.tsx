'use client';

import type { ReactNode } from 'react';
import { formatMoney } from '@/lib/format-money';

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  variant?: string;
}

interface OrderSummaryProps {
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  /** Shown instead of an amount while delivery is not chosen yet. */
  shippingLabel?: string;
  discount?: number;
  discountLabel?: string;
  total: number;
  /** The currency every amount here is in. */
  currency: 'GHS' | 'USD';
  /** Extra content under the totals, e.g. the discount code box. */
  children?: ReactNode;
}

export default function OrderSummary({
  items,
  subtotal,
  shipping,
  shippingLabel,
  discount = 0,
  discountLabel,
  total,
  currency,
  children,
}: OrderSummaryProps) {
  const fmt = (amount: number) => formatMoney(amount, currency);
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 sticky top-4">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Order Summary</h2>

      <div className="space-y-4 mb-6">
        {items.map((item) => (
          <div key={`${item.id}-${item.variant || 'novar'}`} className="flex space-x-4">
            <div className="relative w-20 h-20 bg-gray-100 rounded-lg flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image} alt="" className="w-full h-full object-cover rounded-lg" />
              <div className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center bg-blue-700 text-white text-xs font-bold rounded-full">
                {item.quantity}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 text-sm line-clamp-2">{item.name}</h3>
              {item.variant && <p className="text-xs text-gray-600 mt-0.5">{item.variant}</p>}
              <p className="text-blue-700 font-bold mt-1 tabular-nums">{fmt(item.price)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200 pt-4 space-y-3">
        <div className="flex justify-between text-gray-700">
          <span>Subtotal</span>
          <span className="font-semibold tabular-nums">{fmt(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-emerald-800">
            <span>{discountLabel || 'Discount'}</span>
            <span className="font-semibold tabular-nums">-{fmt(discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-700">
          <span>Delivery</span>
          <span className="font-semibold tabular-nums">
            {shippingLabel || (shipping === 0 ? 'Free' : fmt(shipping))}
          </span>
        </div>
      </div>

      <div className="border-t border-gray-200 mt-4 pt-4">
        <div className="flex justify-between items-center">
          <span className="text-lg font-bold text-gray-900">Total</span>
          <span className="text-2xl font-bold text-blue-700 tabular-nums">{fmt(total)}</span>
        </div>
      </div>

      {children && <div className="mt-6">{children}</div>}

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center space-x-2 text-blue-800">
          <i className="ri-shield-check-line text-xl" aria-hidden="true"></i>
          <p className="text-sm font-semibold">Secure Checkout</p>
        </div>
      </div>
    </div>
  );
}
