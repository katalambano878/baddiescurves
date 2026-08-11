/**
 * Flat-rate shipping by market + country/zone.
 * Rates live in site_settings key `shipping_rates` (admin editable).
 */

export const GHANA_REGIONS = [
  'Greater Accra',
  'Ashanti',
  'Western',
  'Central',
  'Eastern',
  'Northern',
  'Volta',
  'Upper East',
  'Upper West',
  'Brong-Ahafo',
  'Ahafo',
  'Bono',
  'Bono East',
  'North East',
  'Savannah',
  'Oti',
  'Western North',
] as const;

/** International country / region buckets shown at checkout (reference UI). */
export const INTERNATIONAL_COUNTRIES = [
  { code: 'NG', label: 'Nigeria' },
  { code: 'AF_OTHER', label: 'Africa (Other)' },
  { code: 'AO', label: 'Angola' },
  { code: 'ASIA', label: 'Asia' },
  { code: 'AU', label: 'Australia' },
  { code: 'CA', label: 'Canada' },
  { code: 'EU', label: 'Europe' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States' },
  { code: 'ROW', label: 'Rest of the World' },
] as const;

export type IntlCountryCode = (typeof INTERNATIONAL_COUNTRIES)[number]['code'];

export type ShippingRatesConfig = {
  ghana: {
    pickup: number;
    doorstep: number;
    accra: number;
    outside_accra: number;
  };
  international: Record<string, number>;
  notes?: string;
};

export const DEFAULT_SHIPPING_RATES: ShippingRatesConfig = {
  ghana: {
    pickup: 0,
    doorstep: 0,
    accra: 40,
    outside_accra: 30,
  },
  international: {
    NG: 18,
    AF_OTHER: 22,
    AO: 22,
    ASIA: 20,
    AU: 22,
    CA: 16,
    EU: 18,
    GB: 16,
    US: 12,
    ROW: 24,
  },
  notes:
    'Ghana amounts are in GH₵. International amounts are in USD. Edit anytime — checkout picks them up immediately.',
};

export function mergeShippingRates(raw: unknown): ShippingRatesConfig {
  const base = structuredClone(DEFAULT_SHIPPING_RATES);
  if (!raw || typeof raw !== 'object') return base;
  const v = raw as Partial<ShippingRatesConfig>;

  if (v.ghana && typeof v.ghana === 'object') {
    for (const key of Object.keys(base.ghana) as (keyof ShippingRatesConfig['ghana'])[]) {
      const n = Number((v.ghana as any)[key]);
      if (Number.isFinite(n) && n >= 0) base.ghana[key] = n;
    }
  }

  if (v.international && typeof v.international === 'object') {
    for (const [code, amount] of Object.entries(v.international)) {
      const n = Number(amount);
      if (Number.isFinite(n) && n >= 0) base.international[code] = n;
    }
  }

  if (typeof v.notes === 'string') base.notes = v.notes;
  return base;
}

export function countryLabel(code: string): string {
  if (code === 'GH') return 'Ghana';
  return INTERNATIONAL_COUNTRIES.find((c) => c.code === code)?.label || code;
}

export function quoteShipping(opts: {
  isGhana: boolean;
  deliveryMethod: string;
  countryCode?: string;
  rates: ShippingRatesConfig;
}): { amount: number; currency: 'GHS' | 'USD'; label: string } {
  const { isGhana, deliveryMethod, countryCode, rates } = opts;

  if (isGhana) {
    if (deliveryMethod === 'pickup') {
      return { amount: rates.ghana.pickup, currency: 'GHS', label: 'Store Pickup' };
    }
    if (deliveryMethod === 'accra') {
      return { amount: rates.ghana.accra, currency: 'GHS', label: 'Accra Delivery' };
    }
    if (deliveryMethod === 'outside_accra' || deliveryMethod === 'outside-accra') {
      return { amount: rates.ghana.outside_accra, currency: 'GHS', label: 'Outside Accra' };
    }
    // doorstep / default local
    return {
      amount: rates.ghana.doorstep,
      currency: 'GHS',
      label: rates.ghana.doorstep > 0 ? 'Doorstep Delivery' : 'Doorstep (quote after order)',
    };
  }

  const code = countryCode || 'ROW';
  const amount = rates.international[code] ?? rates.international.ROW ?? 0;
  return {
    amount,
    currency: 'USD',
    label: `Shipping to ${countryLabel(code)}`,
  };
}
