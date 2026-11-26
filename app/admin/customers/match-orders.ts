import { normalizeCurrency, sumByCurrency } from '@/lib/format-money';

/**
 * Links orders to customers by contact details.
 * Orders are guest orders (orders.user_id is empty), so an order belongs to a customer
 * when its email or phone equals the customer's email, secondary email, phone or secondary phone.
 */

export interface CustomerContact {
  email?: string | null;
  secondary_email?: string | null;
  phone?: string | null;
  secondary_phone?: string | null;
}

export interface OrderContact {
  email?: string | null;
  phone?: string | null;
  total?: unknown;
  currency?: string | null;
  payment_status?: string | null;
  created_at?: string | null;
}

/**
 * VIP: has spent more than this on paid orders in either currency.
 * The two currencies are checked separately and never added together.
 */
export const VIP_THRESHOLD = { GHS: 1000, USD: 100 };

export function isVip(spent: { GHS: number; USD: number }): boolean {
  return spent.GHS > VIP_THRESHOLD.GHS || spent.USD > VIP_THRESHOLD.USD;
}

/** POS creates placeholder addresses such as 233245640551@pos.local for walk-in customers. */
export function isRealEmail(email: unknown): boolean {
  const value = String(email || '').trim().toLowerCase();
  return value.includes('@') && !value.endsWith('@pos.local');
}

function emailKey(email: unknown): string {
  return String(email || '').trim().toLowerCase();
}

/** Digits only; long numbers are compared on their last 9 digits so 024…, 23324… and +23324… agree. */
function phoneKey(phone: unknown): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.length > 9 ? digits.slice(-9) : digits;
}

export function ordersForCustomer<T extends OrderContact>(customer: CustomerContact, orders: T[]): T[] {
  const emails = new Set([emailKey(customer.email), emailKey(customer.secondary_email)].filter(Boolean));
  const phones = new Set([phoneKey(customer.phone), phoneKey(customer.secondary_phone)].filter(Boolean));
  return orders.filter((order) => {
    const orderEmail = emailKey(order.email);
    const orderPhone = phoneKey(order.phone);
    return (orderEmail !== '' && emails.has(orderEmail)) || (orderPhone !== '' && phones.has(orderPhone));
  });
}

/** Paid orders only: how many, how much per currency, and when the latest one was placed. */
export function paidSummary<T extends OrderContact>(orders: T[]) {
  const paid = orders.filter((order) => order.payment_status === 'paid');
  const lastPaidAt = paid.reduce<string | null>((latest, order) => {
    if (!order.created_at) return latest;
    return !latest || new Date(order.created_at) > new Date(latest) ? order.created_at : latest;
  }, null);
  const paidCountByCurrency = { GHS: 0, USD: 0 };
  for (const order of paid) paidCountByCurrency[normalizeCurrency(order.currency)] += 1;
  return {
    paidCount: paid.length,
    paidCountByCurrency,
    spent: sumByCurrency(
      paid,
      (order) => order.total,
      (order) => order.currency
    ),
    lastPaidAt,
  };
}
