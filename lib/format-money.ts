/** Safe money formatting. Postgres and JSON often return numeric values as strings. */
export function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function money(value: unknown, digits = 2): string {
  return asNumber(value).toFixed(digits);
}

export function moneyLabel(value: unknown, prefix = 'GH₵'): string {
  return `${prefix}${money(value)}`;
}

/** 'GHS' unless the value clearly says USD. Orders store 'GHS' or 'USD'. */
export function normalizeCurrency(currency: unknown): 'GHS' | 'USD' {
  return String(currency || '').toUpperCase() === 'USD' ? 'USD' : 'GHS';
}

/**
 * Money in the currency it was actually charged in, e.g. "GH₵1,250.00" or "$67.00".
 * Use this for anything that belongs to an order: an order's amounts are stored
 * in the order's own currency and must never be converted or relabelled.
 */
export function formatMoney(amount: unknown, currency: unknown = 'GHS'): string {
  const symbol = normalizeCurrency(currency) === 'USD' ? '$' : 'GH₵';
  return `${symbol}${asNumber(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Totals across orders in both currencies, e.g. "GH₵3,400.00 + $67.00".
 * Cedis and dollars are never added together.
 */
export function formatMoneyByCurrency(totals: { GHS?: number; USD?: number }): string {
  const parts: string[] = [];
  if (asNumber(totals.GHS) !== 0) parts.push(formatMoney(totals.GHS, 'GHS'));
  if (asNumber(totals.USD) !== 0) parts.push(formatMoney(totals.USD, 'USD'));
  return parts.length ? parts.join(' + ') : formatMoney(0, 'GHS');
}

/** Adds order amounts up per currency. */
export function sumByCurrency<T>(
  rows: T[],
  amount: (row: T) => unknown,
  currency: (row: T) => unknown
): { GHS: number; USD: number } {
  const out = { GHS: 0, USD: 0 };
  for (const row of rows) out[normalizeCurrency(currency(row))] += asNumber(amount(row));
  return out;
}
