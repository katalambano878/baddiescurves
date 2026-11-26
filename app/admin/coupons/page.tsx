'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatMoney, formatMoneyByCurrency, sumByCurrency } from '@/lib/format-money';

/**
 * Discount codes. Customers type a code in the cart or at checkout; the server
 * checks it and applies it (see lib/server/coupons.ts for the rules).
 *
 * Money fields exist in two currencies because the shop sells in two:
 *   value / minimum_purchase / maximum_discount                         → GH₵
 *   metadata.value_usd / minimum_purchase_usd / maximum_discount_usd    → $
 */

type CouponType = 'percentage' | 'fixed_amount' | 'free_shipping';
type Markets = 'all' | 'GHS' | 'USD';

type Coupon = {
  id: string;
  code: string;
  description: string | null;
  type: CouponType;
  value: number;
  minimum_purchase: number | null;
  maximum_discount: number | null;
  usage_limit: number | null;
  usage_count: number | null;
  per_user_limit: number | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean | null;
  metadata: Record<string, any> | null;
  created_at: string;
};

type FormState = {
  code: string;
  description: string;
  type: CouponType;
  markets: Markets;
  percent: string;
  amountGhs: string;
  amountUsd: string;
  minGhs: string;
  minUsd: string;
  maxGhs: string;
  maxUsd: string;
  usageLimit: string;
  perCustomer: string;
  starts: string;
  ends: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  code: '',
  description: '',
  type: 'percentage',
  markets: 'all',
  percent: '',
  amountGhs: '',
  amountUsd: '',
  minGhs: '',
  minUsd: '',
  maxGhs: '',
  maxUsd: '',
  usageLimit: '',
  perCustomer: '',
  starts: '',
  ends: '',
  active: true,
};

const marketsOf = (c: Coupon): Markets => {
  const m = String(c.metadata?.markets || 'all').toUpperCase();
  return m === 'GHS' ? 'GHS' : m === 'USD' ? 'USD' : 'all';
};

const text = (v: unknown) => (v == null || v === '' ? '' : String(v));

/** ISO timestamp → value for <input type="datetime-local"> in the admin's own time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toForm(c: Coupon): FormState {
  return {
    code: c.code,
    description: c.description || '',
    type: c.type,
    markets: marketsOf(c),
    percent: c.type === 'percentage' ? text(c.value) : '',
    amountGhs: c.type === 'fixed_amount' && Number(c.value) > 0 ? text(c.value) : '',
    amountUsd: c.type === 'fixed_amount' ? text(c.metadata?.value_usd) : '',
    minGhs: Number(c.minimum_purchase) > 0 ? text(c.minimum_purchase) : '',
    minUsd: text(c.metadata?.minimum_purchase_usd),
    maxGhs: text(c.maximum_discount),
    maxUsd: text(c.metadata?.maximum_discount_usd),
    usageLimit: text(c.usage_limit),
    perCustomer: text(c.per_user_limit),
    starts: toLocalInput(c.start_date),
    ends: toLocalInput(c.end_date),
    active: c.is_active !== false,
  };
}

type Status = 'Active' | 'Scheduled' | 'Expired' | 'Used up' | 'Switched off';

function statusOf(c: Coupon): Status {
  const now = Date.now();
  if (c.is_active === false) return 'Switched off';
  if (c.end_date && new Date(c.end_date).getTime() < now) return 'Expired';
  if (c.usage_limit != null && Number(c.usage_count || 0) >= Number(c.usage_limit)) return 'Used up';
  if (c.start_date && new Date(c.start_date).getTime() > now) return 'Scheduled';
  return 'Active';
}

const STATUS_STYLE: Record<Status, string> = {
  Active: 'bg-green-100 text-green-800',
  Scheduled: 'bg-blue-100 text-blue-800',
  Expired: 'bg-gray-100 text-gray-700',
  'Used up': 'bg-gray-100 text-gray-700',
  'Switched off': 'bg-amber-100 text-amber-800',
};

function discountSummary(c: Coupon): string {
  if (c.type === 'percentage') return `${Number(c.value)}% off`;
  if (c.type === 'free_shipping') return 'Free delivery';
  const parts: string[] = [];
  if (Number(c.value) > 0) parts.push(formatMoney(c.value, 'GHS'));
  if (Number(c.metadata?.value_usd) > 0) parts.push(formatMoney(c.metadata?.value_usd, 'USD'));
  return `${parts.join(' / ') || 'Nothing'} off`;
}

function conditions(c: Coupon): string[] {
  const out: string[] = [];
  const mins: string[] = [];
  if (Number(c.minimum_purchase) > 0) mins.push(formatMoney(c.minimum_purchase, 'GHS'));
  if (Number(c.metadata?.minimum_purchase_usd) > 0) mins.push(formatMoney(c.metadata?.minimum_purchase_usd, 'USD'));
  if (mins.length) out.push(`Orders from ${mins.join(' / ')}`);
  if (c.type === 'percentage') {
    const caps: string[] = [];
    if (Number(c.maximum_discount) > 0) caps.push(formatMoney(c.maximum_discount, 'GHS'));
    if (Number(c.metadata?.maximum_discount_usd) > 0) caps.push(formatMoney(c.metadata?.maximum_discount_usd, 'USD'));
    if (caps.length) out.push(`At most ${caps.join(' / ')} off`);
  }
  if (c.per_user_limit != null) out.push(`${c.per_user_limit} per customer`);
  return out;
}

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

/** A positive number from a form field, or null when empty. `NaN` when it is not a valid amount. */
function amount(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : NaN;
}

function wholeNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [discountGiven, setDiscountGiven] = useState<{ GHS: number; USD: number }>({ GHS: 0, USD: 0 });

  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const formRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [list, used] = await Promise.all([
      supabase.from('coupons').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('discount_total, currency').eq('payment_status', 'paid').gt('discount_total', 0).limit(5000),
    ]);
    if (list.error) {
      setLoadError(list.error.message || 'The discount codes did not load.');
    } else {
      setCoupons((list.data || []) as Coupon[]);
    }
    if (!used.error) {
      setDiscountGiven(sumByCurrency(used.data || [], (o: any) => o.discount_total, (o: any) => o.currency));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const openNew = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setEditingId('new');
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const openEdit = (c: Coupon) => {
    setForm(toForm(c));
    setErrors({});
    setEditingId(c.id);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const random = Array.from(crypto.getRandomValues(new Uint32Array(6)), (n) => chars[n % chars.length]).join('');
    set('code', `BC${random}`);
  };

  const showGhs = form.markets !== 'USD';
  const showUsd = form.markets !== 'GHS';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};

    const code = form.code.trim().toUpperCase().replace(/\s+/g, '');
    if (!code) errs.code = 'Enter a code, for example BLACKFRIDAY.';
    else if (!/^[A-Z0-9_-]{3,30}$/.test(code)) errs.code = 'Use 3 to 30 letters and numbers, with no spaces.';
    else if (coupons.some((c) => c.code.toUpperCase() === code && c.id !== editingId)) {
      errs.code = 'That code already exists. Edit it or choose another.';
    }

    let value = 0;
    let valueUsd: number | null = null;
    if (form.type === 'percentage') {
      const pct = Number(form.percent);
      if (!form.percent.trim() || !Number.isFinite(pct) || pct <= 0 || pct > 100) errs.percent = 'Enter a percentage from 1 to 100.';
      else value = pct;
    } else if (form.type === 'fixed_amount') {
      const ghs = showGhs ? amount(form.amountGhs) : null;
      const usd = showUsd ? amount(form.amountUsd) : null;
      if (Number.isNaN(ghs)) errs.amountGhs = 'Enter an amount above 0.';
      if (Number.isNaN(usd)) errs.amountUsd = 'Enter an amount above 0.';
      if (!errs.amountGhs && !errs.amountUsd) {
        if (form.markets === 'GHS' && ghs == null) errs.amountGhs = 'Enter the amount in cedis.';
        if (form.markets === 'USD' && usd == null) errs.amountUsd = 'Enter the amount in dollars.';
        if (form.markets === 'all' && ghs == null && usd == null) errs.amountGhs = 'Enter the amount in cedis, dollars, or both.';
      }
      value = (ghs as number) || 0;
      valueUsd = (usd as number) || null;
    }

    const minGhs = showGhs ? amount(form.minGhs) : null;
    const minUsd = showUsd ? amount(form.minUsd) : null;
    if (Number.isNaN(minGhs)) errs.minGhs = 'Enter an amount above 0, or leave it empty.';
    if (Number.isNaN(minUsd)) errs.minUsd = 'Enter an amount above 0, or leave it empty.';

    const maxGhs = form.type === 'percentage' && showGhs ? amount(form.maxGhs) : null;
    const maxUsd = form.type === 'percentage' && showUsd ? amount(form.maxUsd) : null;
    if (Number.isNaN(maxGhs)) errs.maxGhs = 'Enter an amount above 0, or leave it empty.';
    if (Number.isNaN(maxUsd)) errs.maxUsd = 'Enter an amount above 0, or leave it empty.';

    const usageLimit = wholeNumber(form.usageLimit);
    const perCustomer = wholeNumber(form.perCustomer);
    if (Number.isNaN(usageLimit)) errs.usageLimit = 'Enter a whole number above 0, or leave it empty.';
    if (Number.isNaN(perCustomer)) errs.perCustomer = 'Enter a whole number above 0, or leave it empty.';

    const starts = form.starts ? new Date(form.starts) : null;
    const ends = form.ends ? new Date(form.ends) : null;
    if (starts && Number.isNaN(starts.getTime())) errs.starts = 'Choose a valid date and time.';
    if (ends && Number.isNaN(ends.getTime())) errs.ends = 'Choose a valid date and time.';
    if (starts && ends && !errs.starts && !errs.ends && ends <= starts) errs.ends = 'The end must be after the start.';

    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      requestAnimationFrame(() => {
        (formRef.current?.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus();
      });
      return;
    }

    const existing = coupons.find((c) => c.id === editingId);
    const metadata: Record<string, any> = { ...(existing?.metadata || {}), markets: form.markets };
    const setOrDrop = (key: string, v: number | null) => {
      if (v != null) metadata[key] = v;
      else delete metadata[key];
    };
    setOrDrop('value_usd', form.type === 'fixed_amount' ? valueUsd : null);
    setOrDrop('minimum_purchase_usd', minUsd);
    setOrDrop('maximum_discount_usd', maxUsd);

    const row = {
      code,
      description: form.description.trim() || null,
      type: form.type,
      value,
      minimum_purchase: minGhs ?? 0,
      maximum_discount: maxGhs,
      usage_limit: usageLimit,
      per_user_limit: perCustomer,
      start_date: starts ? starts.toISOString() : null,
      end_date: ends ? ends.toISOString() : null,
      is_active: form.active,
      metadata,
    };

    setSaving(true);
    const result =
      editingId === 'new'
        ? await supabase.from('coupons').insert([row]).select().single()
        : await supabase.from('coupons').update(row).eq('id', editingId as string).select().single();
    setSaving(false);

    if (result.error) {
      const duplicate = /duplicate|unique/i.test(result.error.message || '');
      if (duplicate) setErrors({ code: 'That code already exists. Edit it or choose another.' });
      setNotice({
        text: duplicate ? 'That code already exists.' : `The code was not saved: ${result.error.message}`,
        ok: false,
      });
      return;
    }

    setNotice({
      text: editingId === 'new' ? `${code} is ready. Customers can use it at checkout now.` : `${code} was updated.`,
      ok: true,
    });
    setEditingId(null);
    await load();
  };

  const toggleActive = async (c: Coupon) => {
    setBusyId(c.id);
    const next = c.is_active === false;
    const { error } = await supabase.from('coupons').update({ is_active: next }).eq('id', c.id);
    setBusyId(null);
    if (error) {
      setNotice({ text: `Could not change ${c.code}: ${error.message}`, ok: false });
      return;
    }
    setCoupons((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_active: next } : x)));
    setNotice({ text: next ? `${c.code} is switched on.` : `${c.code} is switched off. Customers can no longer use it.`, ok: true });
  };

  const remove = async (c: Coupon) => {
    const used = Number(c.usage_count || 0);
    const question = used
      ? `Delete ${c.code}? It has been used ${used} time${used === 1 ? '' : 's'}. Past orders keep their discount, but the code stops working and cannot be brought back.`
      : `Delete ${c.code}? This cannot be undone.`;
    if (!confirm(question)) return;
    setBusyId(c.id);
    const { error } = await supabase.from('coupons').delete().eq('id', c.id);
    setBusyId(null);
    if (error) {
      setNotice({ text: `Could not delete ${c.code}: ${error.message}`, ok: false });
      return;
    }
    setCoupons((prev) => prev.filter((x) => x.id !== c.id));
    if (editingId === c.id) setEditingId(null);
    setNotice({ text: `${c.code} was deleted.`, ok: true });
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setNotice({ text: `${code} copied.`, ok: true });
    } catch {
      setNotice({ text: `Could not copy. The code is ${code}.`, ok: false });
    }
  };

  const shown = useMemo(
    () => (statusFilter === 'all' ? coupons : coupons.filter((c) => statusOf(c) === statusFilter)),
    [coupons, statusFilter]
  );
  const activeCount = coupons.filter((c) => statusOf(c) === 'Active').length;
  const totalUses = coupons.reduce((sum, c) => sum + Number(c.usage_count || 0), 0);

  const field = (key: keyof FormState) =>
    `w-full px-3 py-2.5 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
      errors[key] ? 'border-red-500' : 'border-gray-300'
    }`;
  const fieldError = (key: keyof FormState) =>
    errors[key] ? (
      <p id={`${key}-error`} className="mt-1 text-sm text-red-700">
        {errors[key]}
      </p>
    ) : null;
  const invalid = (key: keyof FormState) =>
    errors[key] ? { 'aria-invalid': true as const, 'aria-describedby': `${key}-error` } : {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Coupons</h1>
          <p className="text-gray-600 mt-1">
            Discount codes customers type in the cart or at checkout.
          </p>
        </div>
        {editingId === null && (
          <button
            onClick={openNew}
            className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-semibold inline-flex items-center gap-2 self-start sm:self-auto"
          >
            <i className="ri-add-line" aria-hidden="true"></i>
            New code
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Active codes</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{activeCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Paid orders that used a code</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{totalUses}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Discount given on paid orders</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatMoneyByCurrency(discountGiven)}</p>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={`rounded-lg px-4 py-3 text-sm border ${
            notice.ok ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {notice.text}
        </div>
      )}

      {editingId !== null && (
        <form ref={formRef} onSubmit={save} noValidate className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 scroll-mt-24">
          <h2 className="text-xl font-bold text-gray-900 mb-5">
            {editingId === 'new' ? 'New discount code' : `Edit ${form.code}`}
          </h2>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="coupon-code" className="block text-sm font-semibold text-gray-900 mb-1.5">Code</label>
              <div className="flex gap-2">
                <input
                  id="coupon-code"
                  value={form.code}
                  onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s+/g, ''))}
                  placeholder="BLACKFRIDAY"
                  maxLength={30}
                  autoComplete="off"
                  spellCheck={false}
                  {...invalid('code')}
                  className={`${field('code')} uppercase tracking-wide placeholder:tracking-normal`}
                />
                <button
                  type="button"
                  onClick={generateCode}
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 whitespace-nowrap"
                >
                  Make one
                </button>
              </div>
              {fieldError('code') || <p className="mt-1 text-sm text-gray-600">This is what customers type. Capital or small letters both work.</p>}
            </div>

            <div>
              <label htmlFor="coupon-note" className="block text-sm font-semibold text-gray-900 mb-1.5">
                Note for you <span className="font-normal text-gray-600">(customers do not see this)</span>
              </label>
              <input
                id="coupon-note"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Black Friday 2026"
                maxLength={200}
                className={field('description')}
              />
            </div>

            <fieldset>
              <legend className="block text-sm font-semibold text-gray-900 mb-1.5">What it gives</legend>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['percentage', 'Percent off'],
                  ['fixed_amount', 'Amount off'],
                  ['free_shipping', 'Free delivery'],
                ] as [CouponType, string][]).map(([value, label]) => (
                  <label
                    key={value}
                    className={`px-3 py-2.5 border rounded-lg text-sm font-medium text-center cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${
                      form.type === value ? 'border-blue-700 bg-blue-50 text-blue-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="coupon-type"
                      value={value}
                      checked={form.type === value}
                      onChange={() => set('type', value)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="coupon-markets" className="block text-sm font-semibold text-gray-900 mb-1.5">Who can use it</label>
              <select
                id="coupon-markets"
                value={form.markets}
                onChange={(e) => set('markets', e.target.value as Markets)}
                className={field('markets')}
              >
                <option value="all">Everyone</option>
                <option value="GHS">Customers in Ghana (pay in GH₵)</option>
                <option value="USD">Customers outside Ghana (pay in $)</option>
              </select>
            </div>

            {form.type === 'percentage' && (
              <div>
                <label htmlFor="coupon-percent" className="block text-sm font-semibold text-gray-900 mb-1.5">Percent off</label>
                <div className="relative">
                  <input
                    id="coupon-percent"
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={100}
                    value={form.percent}
                    onChange={(e) => set('percent', e.target.value)}
                    placeholder="20"
                    {...invalid('percent')}
                    className={`${field('percent')} pr-9`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true">%</span>
                </div>
                {fieldError('percent') || <p className="mt-1 text-sm text-gray-600">Taken off the items, not off delivery.</p>}
              </div>
            )}

            {form.type === 'fixed_amount' && (
              <div className="grid grid-cols-2 gap-3">
                {showGhs && (
                  <div>
                    <label htmlFor="coupon-amount-ghs" className="block text-sm font-semibold text-gray-900 mb-1.5">Amount off in GH₵</label>
                    <input
                      id="coupon-amount-ghs"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={form.amountGhs}
                      onChange={(e) => set('amountGhs', e.target.value)}
                      placeholder="50"
                      {...invalid('amountGhs')}
                      className={field('amountGhs')}
                    />
                    {fieldError('amountGhs')}
                  </div>
                )}
                {showUsd && (
                  <div>
                    <label htmlFor="coupon-amount-usd" className="block text-sm font-semibold text-gray-900 mb-1.5">Amount off in $</label>
                    <input
                      id="coupon-amount-usd"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={form.amountUsd}
                      onChange={(e) => set('amountUsd', e.target.value)}
                      placeholder="5"
                      {...invalid('amountUsd')}
                      className={field('amountUsd')}
                    />
                    {fieldError('amountUsd')}
                  </div>
                )}
                {form.markets === 'all' && (
                  <p className="col-span-2 text-sm text-gray-600">
                    Fill both so the code works everywhere. If you leave one empty, the code will not work for orders in that currency.
                  </p>
                )}
              </div>
            )}

            {form.type === 'free_shipping' && (
              <p className="text-sm text-gray-600 self-end pb-2.5">
                The delivery charge is taken off the order. Items are charged in full.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              {showGhs && (
                <div>
                  <label htmlFor="coupon-min-ghs" className="block text-sm font-semibold text-gray-900 mb-1.5">Smallest order, GH₵</label>
                  <input
                    id="coupon-min-ghs"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={form.minGhs}
                    onChange={(e) => set('minGhs', e.target.value)}
                    placeholder="No minimum"
                    {...invalid('minGhs')}
                    className={field('minGhs')}
                  />
                  {fieldError('minGhs')}
                </div>
              )}
              {showUsd && (
                <div>
                  <label htmlFor="coupon-min-usd" className="block text-sm font-semibold text-gray-900 mb-1.5">Smallest order, $</label>
                  <input
                    id="coupon-min-usd"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={form.minUsd}
                    onChange={(e) => set('minUsd', e.target.value)}
                    placeholder="No minimum"
                    {...invalid('minUsd')}
                    className={field('minUsd')}
                  />
                  {fieldError('minUsd')}
                </div>
              )}
            </div>

            {form.type === 'percentage' && (
              <div className="grid grid-cols-2 gap-3">
                {showGhs && (
                  <div>
                    <label htmlFor="coupon-max-ghs" className="block text-sm font-semibold text-gray-900 mb-1.5">Most it can take off, GH₵</label>
                    <input
                      id="coupon-max-ghs"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={form.maxGhs}
                      onChange={(e) => set('maxGhs', e.target.value)}
                      placeholder="No limit"
                      {...invalid('maxGhs')}
                      className={field('maxGhs')}
                    />
                    {fieldError('maxGhs')}
                  </div>
                )}
                {showUsd && (
                  <div>
                    <label htmlFor="coupon-max-usd" className="block text-sm font-semibold text-gray-900 mb-1.5">Most it can take off, $</label>
                    <input
                      id="coupon-max-usd"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={form.maxUsd}
                      onChange={(e) => set('maxUsd', e.target.value)}
                      placeholder="No limit"
                      {...invalid('maxUsd')}
                      className={field('maxUsd')}
                    />
                    {fieldError('maxUsd')}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="coupon-limit" className="block text-sm font-semibold text-gray-900 mb-1.5">Total uses allowed</label>
                <input
                  id="coupon-limit"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={form.usageLimit}
                  onChange={(e) => set('usageLimit', e.target.value)}
                  placeholder="No limit"
                  {...invalid('usageLimit')}
                  className={field('usageLimit')}
                />
                {fieldError('usageLimit')}
              </div>
              <div>
                <label htmlFor="coupon-per-customer" className="block text-sm font-semibold text-gray-900 mb-1.5">Uses per customer</label>
                <input
                  id="coupon-per-customer"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={form.perCustomer}
                  onChange={(e) => set('perCustomer', e.target.value)}
                  placeholder="No limit"
                  {...invalid('perCustomer')}
                  className={field('perCustomer')}
                />
                {fieldError('perCustomer')}
              </div>
              <p className="col-span-2 text-sm text-gray-600 -mt-1">
                A use is counted when the order is paid. A customer is recognised by email or phone number.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="coupon-starts" className="block text-sm font-semibold text-gray-900 mb-1.5">Starts</label>
                <input
                  id="coupon-starts"
                  type="datetime-local"
                  value={form.starts}
                  onChange={(e) => set('starts', e.target.value)}
                  {...invalid('starts')}
                  className={field('starts')}
                />
                {fieldError('starts') || <p className="mt-1 text-sm text-gray-600">Empty means right away.</p>}
              </div>
              <div>
                <label htmlFor="coupon-ends" className="block text-sm font-semibold text-gray-900 mb-1.5">Ends</label>
                <input
                  id="coupon-ends"
                  type="datetime-local"
                  value={form.ends}
                  onChange={(e) => set('ends', e.target.value)}
                  {...invalid('ends')}
                  className={field('ends')}
                />
                {fieldError('ends') || <p className="mt-1 text-sm text-gray-600">Empty means it never ends.</p>}
              </div>
            </div>
          </div>

          <label className="mt-5 flex items-center gap-3 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set('active', e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-blue-700 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-900">Switched on: customers can use this code</span>
          </label>

          <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button
              type="button"
              onClick={() => setEditingId(null)}
              disabled={saving}
              className="px-5 py-2.5 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {saving && <i className="ri-loader-4-line animate-spin" aria-hidden="true"></i>}
              {editingId === 'new' ? 'Create code' : 'Save changes'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900">All codes</h2>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            aria-label="Show codes by status"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All</option>
            <option value="Active">Active</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Switched off">Switched off</option>
            <option value="Expired">Expired</option>
            <option value="Used up">Used up</option>
          </select>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-600">
            <i className="ri-loader-4-line text-3xl animate-spin block mb-2" aria-hidden="true"></i>
            Loading codes…
          </div>
        ) : loadError ? (
          <div className="p-12 text-center">
            <p className="font-medium text-gray-900">The discount codes did not load.</p>
            <p className="text-sm text-gray-600 mt-1">{loadError}</p>
            <button onClick={load} className="mt-4 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">
              Try again
            </button>
          </div>
        ) : coupons.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-medium text-gray-900">No discount codes yet</p>
            <p className="text-sm text-gray-600 mt-1 max-w-md mx-auto">
              Make a code such as BLACKFRIDAY, choose what it takes off, and share it. Customers enter it in the cart or at checkout.
            </p>
            {editingId === null && (
              <button onClick={openNew} className="mt-4 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">
                Make the first code
              </button>
            )}
          </div>
        ) : shown.length === 0 ? (
          <div className="p-12 text-center text-gray-600">No codes with that status.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left border-b border-gray-200">
                  <th className="p-3 font-semibold">Code</th>
                  <th className="p-3 font-semibold">Discount</th>
                  <th className="p-3 font-semibold">Who</th>
                  <th className="p-3 font-semibold">Used</th>
                  <th className="p-3 font-semibold">Dates</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const status = statusOf(c);
                  const who = marketsOf(c);
                  const extra = conditions(c);
                  return (
                    <tr key={c.id} className="border-b border-gray-100 last:border-0 align-top">
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-gray-900">{c.code}</span>
                          <button
                            onClick={() => copyCode(c.code)}
                            aria-label={`Copy ${c.code}`}
                            className="w-8 h-8 inline-flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded"
                          >
                            <i className="ri-file-copy-line" aria-hidden="true"></i>
                          </button>
                        </div>
                        {c.description && <p className="text-xs text-gray-600 max-w-[220px]">{c.description}</p>}
                      </td>
                      <td className="p-3">
                        <p className="font-medium text-gray-900">{discountSummary(c)}</p>
                        {extra.map((line) => (
                          <p key={line} className="text-xs text-gray-600">{line}</p>
                        ))}
                      </td>
                      <td className="p-3 text-gray-700 whitespace-nowrap">
                        {who === 'all' ? 'Everyone' : who === 'GHS' ? 'Ghana' : 'Outside Ghana'}
                      </td>
                      <td className="p-3 text-gray-700 tabular-nums whitespace-nowrap">
                        {Number(c.usage_count || 0)}
                        {c.usage_limit != null ? ` of ${c.usage_limit}` : ''}
                      </td>
                      <td className="p-3 text-gray-700 text-xs">
                        <p>{c.start_date ? `From ${fmtDate(c.start_date)}` : 'No start date'}</p>
                        <p>{c.end_date ? `Until ${fmtDate(c.end_date)}` : 'No end date'}</p>
                      </td>
                      <td className="p-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${STATUS_STYLE[status]}`}>
                          {status}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                          <button
                            onClick={() => toggleActive(c)}
                            disabled={busyId === c.id}
                            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                          >
                            {c.is_active === false ? 'Switch on' : 'Switch off'}
                          </button>
                          <button
                            onClick={() => openEdit(c)}
                            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => remove(c)}
                            disabled={busyId === c.id}
                            className="px-2.5 py-1.5 text-red-700 hover:bg-red-50 rounded-lg text-xs font-medium disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
