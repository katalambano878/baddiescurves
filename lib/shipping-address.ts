import { GHANA_REGIONS, countryLabel } from '@/lib/shipping';

export type ShippingAddress = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  /** Ghana region name, or international state/province */
  region: string;
  state: string;
  country: string;
  countryCode: string;
  deliveryNote: string;
  postalCode: string;
};

export const emptyShippingAddress = (): ShippingAddress => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  region: '',
  state: '',
  country: '',
  countryCode: '',
  deliveryNote: '',
  postalCode: '',
});

export function validateShippingAddress(
  data: ShippingAddress,
  isGhana: boolean
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!data.firstName.trim()) errors.firstName = 'First name is required';
  if (!data.lastName.trim()) errors.lastName = 'Last name is required';
  if (!data.email.trim()) errors.email = 'Email is required';
  else if (!/\S+@\S+\.\S+/.test(data.email)) errors.email = 'Invalid email';
  if (!data.phone.trim()) errors.phone = 'Phone is required';
  if (!data.address.trim()) errors.address = 'Address is required';
  if (!data.city.trim()) errors.city = 'City is required';

  if (isGhana) {
    if (!data.region.trim()) errors.region = 'Region is required';
    else if (!(GHANA_REGIONS as readonly string[]).includes(data.region)) {
      errors.region = 'Select a valid Ghana region';
    }
  } else {
    if (!data.countryCode.trim()) errors.countryCode = 'Country / region is required';
    // state optional but recommended for US/CA/AU
  }

  return errors;
}

/** Normalize address before saving on the order. */
export function normalizeShippingAddress(
  data: ShippingAddress,
  isGhana: boolean
): ShippingAddress {
  if (isGhana) {
    return {
      ...data,
      country: 'Ghana',
      countryCode: 'GH',
      state: data.state || data.region,
      region: data.region,
    };
  }

  return {
    ...data,
    country: countryLabel(data.countryCode) || data.country,
    region: data.state || data.region || countryLabel(data.countryCode),
    state: data.state,
  };
}

export function formatAddressLines(addr: any): string[] {
  if (!addr || typeof addr !== 'object') return [];
  const lines: string[] = [];
  const street = addr.address || addr.address_line1;
  if (street) lines.push(String(street));
  if (addr.address_line2) lines.push(String(addr.address_line2));

  const cityLine = [addr.city, addr.state || addr.region, addr.postalCode || addr.postal_code]
    .filter(Boolean)
    .join(', ');
  if (cityLine) lines.push(cityLine);

  const country = addr.country || (addr.countryCode === 'GH' ? 'Ghana' : '');
  if (country) lines.push(String(country));
  if (addr.deliveryNote) lines.push(`Note: ${addr.deliveryNote}`);
  return lines;
}
