/**
 * The shop's two markets. Ghana pays in cedis (Moolre), everyone else in US
 * dollars (PayPal). Safe to import from both server and browser code.
 */
export type Market = 'GHS' | 'USD';

/** Only used when a product has no cedi price of its own. */
export const USD_TO_GHS = 15.5;

export function marketOf(value: unknown): Market {
  return String(value || '').toUpperCase() === 'GHS' ? 'GHS' : 'USD';
}

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** What one unit costs in a market, from the dollar price and the optional cedi price. */
export function unitPriceFor(market: Market, usd: unknown, ghs: unknown): number {
  const usdNum = Number(usd) || 0;
  if (market === 'USD') return round2(usdNum);
  const ghsNum = ghs == null || ghs === '' ? NaN : Number(ghs);
  return Number.isFinite(ghsNum) ? round2(ghsNum) : round2(usdNum * USD_TO_GHS);
}
