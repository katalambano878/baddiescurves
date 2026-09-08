'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type MaintenanceState = {
  enabled: boolean;
  message: string;
  estimatedMinutes: number | null;
  updatedAt?: string | null;
};

export default function AdminMaintenancePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [form, setForm] = useState<MaintenanceState>({
    enabled: false,
    message:
      "We're currently performing scheduled maintenance to improve your shopping experience. We'll be back online shortly.",
    estimatedMinutes: 30,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const res = await fetch('/api/admin/maintenance', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.message || 'Failed to load maintenance settings');
        }
        if (cancelled) return;
        setForm({
          enabled: Boolean(json.enabled),
          message: json.message || '',
          estimatedMinutes: json.estimatedMinutes ?? null,
          updatedAt: json.updatedAt || null,
        });
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSavedAt(null);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch('/api/admin/maintenance', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          enabled: form.enabled,
          message: form.message,
          estimatedMinutes: form.estimatedMinutes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to save');
      }
      setForm((prev) => ({
        ...prev,
        enabled: Boolean(json.enabled),
        message: json.message || prev.message,
        estimatedMinutes: json.estimatedMinutes ?? null,
      }));
      setSavedAt(new Date().toLocaleString());
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-gray-500">
        <i className="ri-loader-4-line animate-spin text-xl text-blue-700" />
        Loading maintenance settings...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Maintenance Mode</h1>
          <p className="text-gray-600 mt-2">
            When enabled, shoppers are redirected to a maintenance page. Admin stays accessible.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        {savedAt && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 text-sm">
            Saved successfully at {savedAt}. Storefront may take up to ~15 seconds to refresh.
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Storefront status</h2>
              <p className="text-sm text-gray-500 mt-1">
                {form.enabled
                  ? 'Store is currently in maintenance mode for visitors.'
                  : 'Store is live for visitors.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
              className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors ${
                form.enabled ? 'bg-amber-500' : 'bg-gray-200'
              }`}
              aria-pressed={form.enabled}
              aria-label="Toggle maintenance mode"
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                  form.enabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              form.enabled
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              <i className={form.enabled ? 'ri-tools-line' : 'ri-checkbox-circle-line'} />
              {form.enabled ? 'Maintenance ON' : 'Store LIVE'}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Message shown to visitors
            </label>
            <textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              rows={4}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Estimated minutes (optional)
            </label>
            <input
              type="number"
              min={0}
              value={form.estimatedMinutes ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  estimatedMinutes: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
              placeholder="e.g. 30"
              className="w-full max-w-xs rounded-xl border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-gray-900 hover:bg-blue-800 disabled:opacity-60 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-colors"
            >
              {saving ? (
                <>
                  <i className="ri-loader-4-line animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <i className="ri-save-line" /> Save settings
                </>
              )}
            </button>
            <a
              href="/maintenance"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 px-6 py-3 rounded-xl text-sm font-semibold hover:bg-gray-50"
            >
              Preview page <i className="ri-external-link-line" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
