'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_SHIPPING_RATES,
  INTERNATIONAL_COUNTRIES,
  type ShippingRatesConfig,
} from '@/lib/shipping';

export default function AdminShippingPage() {
  const [rates, setRates] = useState<ShippingRatesConfig>(DEFAULT_SHIPPING_RATES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRates();
  }, []);

  async function loadRates() {
    try {
      setLoading(true);
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/shipping', {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load');
      setRates(json.rates);
    } catch (err: any) {
      setError(err?.message || 'Failed to load shipping rates');
      setRates(DEFAULT_SHIPPING_RATES);
    } finally {
      setLoading(false);
    }
  }

  async function saveRates() {
    try {
      setSaving(true);
      setMessage(null);
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/shipping', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ rates }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to save');
      setRates(json.rates);
      setMessage('Shipping rates saved. Checkout will use these immediately.');
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function setGhana(field: keyof ShippingRatesConfig['ghana'], value: string) {
    const n = Number(value);
    setRates((prev) => ({
      ...prev,
      ghana: { ...prev.ghana, [field]: Number.isFinite(n) && n >= 0 ? n : 0 },
    }));
  }

  function setIntl(code: string, value: string) {
    const n = Number(value);
    setRates((prev) => ({
      ...prev,
      international: {
        ...prev.international,
        [code]: Number.isFinite(n) && n >= 0 ? n : 0,
      },
    }));
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-500">
        <i className="ri-loader-4-line animate-spin text-2xl text-blue-700 inline-block mb-2" />
        <p>Loading shipping settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Shipping Rates</h1>
          <p className="text-gray-600 mt-1">
            Set flat delivery prices for Ghana and international countries. Keep it simple — change anytime.
          </p>
        </div>
        <button
          type="button"
          onClick={saveRates}
          disabled={saving}
          className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-semibold disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Rates'}
        </button>
      </div>

      {message && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-lg text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
        <p className="font-semibold mb-1">How it works</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Ghana visitors see Ghana address fields and pay with Mobile Money (GH₵).</li>
          <li>Everyone else picks a country/region and pays with PayPal (USD).</li>
          <li>Product prices stay separate: set USD + Ghana price on each product.</li>
        </ul>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Ghana (GH₵)</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {(
            [
              ['pickup', 'Store Pickup'],
              ['doorstep', 'Doorstep Delivery'],
              ['accra', 'Accra Delivery'],
              ['outside_accra', 'Outside Accra'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="block text-sm font-semibold text-gray-900 mb-1">{label}</span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">GH₵</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={rates.ghana[key]}
                  onChange={(e) => setGhana(key, e.target.value)}
                  className="w-full pl-12 pr-3 py-2.5 border-2 border-gray-300 rounded-lg"
                />
              </div>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          Tip: leave Doorstep at 0 if you prefer to confirm cost by phone after the order.
        </p>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-900">International (USD)</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {INTERNATIONAL_COUNTRIES.map((c) => (
            <label key={c.code} className="block">
              <span className="block text-sm font-semibold text-gray-900 mb-1">{c.label}</span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={rates.international[c.code] ?? 0}
                  onChange={(e) => setIntl(c.code, e.target.value)}
                  className="w-full pl-8 pr-3 py-2.5 border-2 border-gray-300 rounded-lg"
                />
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <h2 className="text-lg font-bold text-gray-900">Internal note (optional)</h2>
        <textarea
          value={rates.notes || ''}
          onChange={(e) => setRates((prev) => ({ ...prev, notes: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm"
          placeholder="Reminders for your team…"
        />
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={saveRates}
          disabled={saving}
          className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-semibold disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Rates'}
        </button>
      </div>
    </div>
  );
}
