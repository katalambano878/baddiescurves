'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { GHANA_REGIONS } from '@/lib/shipping';

interface Address {
  id: string;
  label: string | null;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
}

type AddressForm = {
  label: string;
  full_name: string;
  phone: string;
  inGhana: boolean;
  country: string; // only used when the address is outside Ghana
  state: string; // Ghana region, or state / province elsewhere
  city: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  is_default: boolean;
};

const emptyForm = (): AddressForm => ({
  label: '',
  full_name: '',
  phone: '',
  inGhana: true,
  country: '',
  state: '',
  city: '',
  address_line1: '',
  address_line2: '',
  postal_code: '',
  is_default: false,
});

const inputClass = (hasError?: string) =>
  `w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-700 focus:border-transparent ${
    hasError ? 'border-red-500' : 'border-gray-300'
  }`;

async function addressRequest(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown, query = '') {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false as const, status: 401, error: 'Your session has ended. Sign in again to manage your addresses.', fields: null };
  }
  try {
    const res = await fetch(`/api/storefront/addresses${query}`, {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false as const,
        status: res.status,
        error: (json?.error as string) || 'Something went wrong. Please try again.',
        fields: (json?.fields as Record<string, string> | null) || null,
      };
    }
    return { ok: true as const, data: json };
  } catch {
    return { ok: false as const, status: 0, error: 'Connection problem. Check your internet and try again.', fields: null };
  }
}

export default function AddressBook() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [listError, setListError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadAddresses = useCallback(async () => {
    setLoadError('');
    const result = await addressRequest('GET');
    if (result.ok) {
      setAddresses(result.data?.addresses || []);
    } else {
      setLoadError(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const openNewForm = () => {
    setForm({ ...emptyForm(), is_default: addresses.length === 0 });
    setEditingId(null);
    setFieldErrors({});
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (address: Address) => {
    const inGhana = address.country.trim().toLowerCase() === 'ghana';
    setForm({
      label: address.label || '',
      full_name: address.full_name,
      phone: address.phone,
      inGhana,
      country: inGhana ? '' : address.country,
      state: address.state || '',
      city: address.city,
      address_line1: address.address_line1,
      address_line2: address.address_line2 || '',
      postal_code: address.postal_code || '',
      is_default: address.is_default,
    });
    setEditingId(address.id);
    setFieldErrors({});
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFieldErrors({});
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const errors: Record<string, string> = {};
    if (!form.full_name.trim()) errors.full_name = 'Enter the name of the person receiving the order.';
    if (form.phone.replace(/\D/g, '').length < 7) errors.phone = 'Enter a phone number we can reach you on.';
    if (!form.inGhana && !form.country.trim()) errors.country = 'Enter the country.';
    if (form.inGhana && !form.state) errors.state = 'Choose a region.';
    if (!form.city.trim()) errors.city = 'Enter the city or town.';
    if (!form.address_line1.trim()) errors.address_line1 = 'Enter the area and street or house number.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload = {
      ...(editingId ? { id: editingId } : {}),
      label: form.label,
      full_name: form.full_name,
      phone: form.phone,
      country: form.inGhana ? 'Ghana' : form.country,
      state: form.state,
      city: form.city,
      address_line1: form.address_line1,
      address_line2: form.address_line2,
      postal_code: form.inGhana ? '' : form.postal_code,
      ...(form.is_default ? { is_default: true } : {}),
    };

    setSaving(true);
    const result = await addressRequest(editingId ? 'PATCH' : 'POST', payload);
    setSaving(false);

    if (!result.ok) {
      if (result.fields) setFieldErrors(result.fields);
      setFormError(result.error);
      return;
    }
    closeForm();
    await loadAddresses();
  };

  const setDefault = async (id: string) => {
    setListError('');
    setBusyId(id);
    const result = await addressRequest('PATCH', { id, is_default: true });
    if (result.ok) {
      setAddresses(prev => prev.map(addr => ({ ...addr, is_default: addr.id === id })));
    } else {
      setListError(result.error);
    }
    setBusyId(null);
  };

  const deleteAddress = async (id: string) => {
    setListError('');
    setBusyId(id);
    const result = await addressRequest('DELETE', undefined, `?id=${encodeURIComponent(id)}`);
    setConfirmDeleteId(null);
    if (result.ok) {
      if (editingId === id) closeForm();
      await loadAddresses();
    } else {
      setListError(result.error);
    }
    setBusyId(null);
  };

  const setField = <K extends keyof AddressForm>(key: K, value: AddressForm[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Address Book</h2>
        {!showForm && (
          <button
            onClick={openNewForm}
            className="px-4 py-2 bg-blue-700 text-white rounded-lg font-semibold hover:bg-blue-800 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line mr-2"></i>
            Add New Address
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white border-2 border-blue-700 rounded-lg p-6 mb-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            {editingId ? 'Edit Address' : 'New Address'}
          </h3>

          {formError && (
            <p className="mb-4 p-3 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm" role="alert">
              {formError}
            </p>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4" noValidate>
            <div>
              <label htmlFor="addr-name" className="block text-sm font-semibold text-gray-900 mb-2">Full Name</label>
              <input
                id="addr-name"
                type="text"
                autoComplete="name"
                value={form.full_name}
                onChange={e => setField('full_name', e.target.value)}
                className={inputClass(fieldErrors.full_name)}
              />
              {fieldErrors.full_name && <p className="text-sm text-red-600 mt-1">{fieldErrors.full_name}</p>}
            </div>
            <div>
              <label htmlFor="addr-phone" className="block text-sm font-semibold text-gray-900 mb-2">Phone Number</label>
              <input
                id="addr-phone"
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={e => setField('phone', e.target.value)}
                className={inputClass(fieldErrors.phone)}
                placeholder="+233 XX XXX XXXX"
              />
              {fieldErrors.phone && <p className="text-sm text-red-600 mt-1">{fieldErrors.phone}</p>}
            </div>

            <div>
              <label htmlFor="addr-where" className="block text-sm font-semibold text-gray-900 mb-2">Country</label>
              <select
                id="addr-where"
                value={form.inGhana ? 'GH' : 'OTHER'}
                onChange={e => {
                  const inGhana = e.target.value === 'GH';
                  setForm(prev => ({ ...prev, inGhana, state: '', postal_code: inGhana ? '' : prev.postal_code }));
                }}
                className={inputClass()}
              >
                <option value="GH">Ghana</option>
                <option value="OTHER">Another country</option>
              </select>
            </div>

            {form.inGhana ? (
              <div>
                <label htmlFor="addr-region" className="block text-sm font-semibold text-gray-900 mb-2">Region</label>
                <select
                  id="addr-region"
                  value={form.state}
                  onChange={e => setField('state', e.target.value)}
                  className={inputClass(fieldErrors.state)}
                >
                  <option value="">Choose a region</option>
                  {GHANA_REGIONS.map(region => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
                {fieldErrors.state && <p className="text-sm text-red-600 mt-1">{fieldErrors.state}</p>}
              </div>
            ) : (
              <div>
                <label htmlFor="addr-country" className="block text-sm font-semibold text-gray-900 mb-2">Country Name</label>
                <input
                  id="addr-country"
                  type="text"
                  autoComplete="country-name"
                  value={form.country}
                  onChange={e => setField('country', e.target.value)}
                  className={inputClass(fieldErrors.country)}
                />
                {fieldErrors.country && <p className="text-sm text-red-600 mt-1">{fieldErrors.country}</p>}
              </div>
            )}

            <div>
              <label htmlFor="addr-city" className="block text-sm font-semibold text-gray-900 mb-2">City / Town</label>
              <input
                id="addr-city"
                type="text"
                autoComplete="address-level2"
                value={form.city}
                onChange={e => setField('city', e.target.value)}
                className={inputClass(fieldErrors.city)}
              />
              {fieldErrors.city && <p className="text-sm text-red-600 mt-1">{fieldErrors.city}</p>}
            </div>

            {!form.inGhana && (
              <div>
                <label htmlFor="addr-state" className="block text-sm font-semibold text-gray-900 mb-2">
                  State / Province <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <input
                  id="addr-state"
                  type="text"
                  autoComplete="address-level1"
                  value={form.state}
                  onChange={e => setField('state', e.target.value)}
                  className={inputClass(fieldErrors.state)}
                />
                {fieldErrors.state && <p className="text-sm text-red-600 mt-1">{fieldErrors.state}</p>}
              </div>
            )}

            <div className="md:col-span-2">
              <label htmlFor="addr-line1" className="block text-sm font-semibold text-gray-900 mb-2">
                {form.inGhana ? 'Area and Street / House Number' : 'Street Address'}
              </label>
              <input
                id="addr-line1"
                type="text"
                autoComplete="address-line1"
                value={form.address_line1}
                onChange={e => setField('address_line1', e.target.value)}
                className={inputClass(fieldErrors.address_line1)}
              />
              {fieldErrors.address_line1 && <p className="text-sm text-red-600 mt-1">{fieldErrors.address_line1}</p>}
            </div>

            <div className={form.inGhana ? 'md:col-span-2' : ''}>
              <label htmlFor="addr-line2" className="block text-sm font-semibold text-gray-900 mb-2">
                {form.inGhana ? 'Landmark or Digital Address' : 'Apartment, Suite, etc.'}{' '}
                <span className="font-normal text-gray-500">(optional)</span>
              </label>
              <input
                id="addr-line2"
                type="text"
                autoComplete="address-line2"
                value={form.address_line2}
                onChange={e => setField('address_line2', e.target.value)}
                className={inputClass()}
              />
            </div>

            {!form.inGhana && (
              <div>
                <label htmlFor="addr-postal" className="block text-sm font-semibold text-gray-900 mb-2">
                  ZIP / Postal Code <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <input
                  id="addr-postal"
                  type="text"
                  autoComplete="postal-code"
                  value={form.postal_code}
                  onChange={e => setField('postal_code', e.target.value)}
                  className={inputClass()}
                />
              </div>
            )}

            <div className="md:col-span-2">
              <label htmlFor="addr-label" className="block text-sm font-semibold text-gray-900 mb-2">
                Label <span className="font-normal text-gray-500">(optional)</span>
              </label>
              <input
                id="addr-label"
                type="text"
                value={form.label}
                onChange={e => setField('label', e.target.value)}
                className={inputClass()}
                placeholder="Home, Work"
              />
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={e => setField('is_default', e.target.checked)}
                  className="w-4 h-4 text-blue-700 border-gray-300 rounded focus:ring-blue-700"
                />
                <span className="ml-2 text-sm text-gray-700">Set as default address</span>
              </label>
            </div>
            <div className="md:col-span-2 flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 bg-blue-700 text-white rounded-lg font-semibold hover:bg-blue-800 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Address'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="flex-1 py-3 border-2 border-gray-300 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {listError && (
        <p className="mb-4 p-3 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm" role="alert">
          {listError}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy="true">
          {[0, 1].map(i => (
            <div key={i} className="bg-white border-2 border-gray-200 rounded-lg p-6 animate-pulse">
              <div className="h-5 w-1/2 bg-gray-200 rounded mb-3"></div>
              <div className="h-4 w-1/3 bg-gray-100 rounded mb-6"></div>
              <div className="h-4 w-3/4 bg-gray-100 rounded mb-2"></div>
              <div className="h-4 w-2/3 bg-gray-100 rounded"></div>
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="border-2 border-gray-200 rounded-lg p-6 text-center">
          <p className="text-gray-700 mb-4" role="alert">{loadError}</p>
          <button
            onClick={() => {
              setLoading(true);
              loadAddresses();
            }}
            className="px-4 py-2 border border-gray-300 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : addresses.length === 0 && !showForm ? (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
          <i className="ri-map-pin-2-line text-3xl text-gray-400"></i>
          <p className="text-gray-700 font-semibold mt-3">No saved addresses yet</p>
          <p className="text-gray-500 text-sm mt-1">Add the address you want your orders delivered to.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((address) => (
            <div
              key={address.id}
              className={`bg-white border-2 rounded-lg p-6 relative ${address.is_default ? 'border-blue-700' : 'border-gray-200'
                }`}
            >
              {address.is_default && (
                <div className="absolute top-4 right-4">
                  <span className="px-3 py-1 bg-blue-700 text-white text-xs font-semibold rounded-full whitespace-nowrap">
                    Default
                  </span>
                </div>
              )}

              <div className="mb-4 pr-20">
                {address.label && (
                  <p className="text-sm font-semibold text-gray-500 mb-1 break-words">{address.label}</p>
                )}
                <h3 className="text-lg font-bold text-gray-900 break-words">{address.full_name}</h3>
                <p className="text-gray-600">{address.phone}</p>
              </div>

              <div className="text-gray-700 space-y-1 mb-6 break-words">
                <p>{address.address_line1}</p>
                {address.address_line2 && <p>{address.address_line2}</p>}
                <p>{[address.city, address.state, address.postal_code].filter(Boolean).join(', ')}</p>
                <p>{address.country}</p>
              </div>

              {confirmDeleteId === address.id ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <p className="flex-1 text-sm font-semibold text-gray-900">Delete this address?</p>
                  <button
                    onClick={() => deleteAddress(address.id)}
                    disabled={busyId === address.id}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    {busyId === address.id ? 'Deleting...' : 'Delete'}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    disabled={busyId === address.id}
                    className="px-4 py-2 border border-gray-300 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                  <button
                    onClick={() => openEditForm(address)}
                    className="flex-1 py-2 border border-gray-300 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    Edit
                  </button>
                  {!address.is_default && (
                    <button
                      onClick={() => setDefault(address.id)}
                      disabled={busyId === address.id}
                      className="flex-1 py-2 border border-blue-700 text-blue-700 rounded-lg font-semibold hover:bg-blue-50 transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => setConfirmDeleteId(address.id)}
                    aria-label="Delete address"
                    className="px-4 py-2 border border-red-600 text-red-600 rounded-lg font-semibold hover:bg-red-50 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-delete-bin-line"></i>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
