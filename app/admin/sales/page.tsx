'use client';

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-fetch';

type Currency = 'GHS' | 'USD';
/** Who sees sale prices: everyone, customers outside Ghana only ($), or customers in Ghana only (GH₵). */
type Markets = 'all' | 'USD' | 'GHS';

const MARKET_CHOICES: { value: Markets; label: string; detail: string }[] = [
    { value: 'all', label: 'Everyone', detail: 'Ghana and everywhere else' },
    { value: 'USD', label: 'Outside Ghana only', detail: 'Dollar prices ($)' },
    { value: 'GHS', label: 'Ghana only', detail: 'Cedi prices (GH₵)' },
];

/** One currency's regular price and, when there is one, its sale price. */
type Money = { regular: number; sale: number | null };

type VariantRow = {
    id: string;
    label: string;
    ghs: Money | null;
    usd: Money;
};

type ProductRow = {
    id: string;
    name: string;
    slug: string;
    status: string;
    category: string;
    image: string | null;
    on_sale: boolean;
    /** The sale is switched off: the shop shows the regular price. */
    paused: boolean;
    /** The currency sale prices are typed in: cedis unless there is no cedi price. */
    currency: Currency;
    ghs: Money | null;
    usd: Money;
    /** Variants do not all share one regular price. */
    priceVaries: boolean;
    pct: number;
    variants: VariantRow[];
};

const PAGE_SIZE = 24;

const fmtMoney = (v: number, c: Currency) =>
    `${c === 'GHS' ? 'GH₵' : '$'}${Number(v || 0).toFixed(2)}`;

const num = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/**
 * Regular and sale price for one currency, the same way the database works it out.
 * A switched-off sale keeps its sale price aside while `price` holds the regular price.
 */
function derive(price: number | null, compare: number | null, pausedSale: number | null): Money | null {
    if (price == null) return null;
    if (pausedSale != null) return { regular: price, sale: pausedSale < price ? pausedSale : null };
    if (compare != null && compare > price) return { regular: compare, sale: price };
    return { regular: price, sale: null };
}

function pctOf(m: Money | null): number {
    if (!m || m.sale == null || m.regular <= 0 || m.sale >= m.regular) return 0;
    return Math.round((1 - m.sale / m.regular) * 100);
}

/** Cheapest regular and cheapest sale price across variants. */
function summarise(list: (Money | null)[]): Money | null {
    const present = list.filter((m): m is Money => m != null);
    if (present.length === 0) return null;
    const sales = present.filter((m) => m.sale != null).map((m) => m.sale as number);
    return {
        regular: Math.min(...present.map((m) => m.regular)),
        sale: sales.length ? Math.min(...sales) : null,
    };
}

function toRow(r: any, markets: Markets = 'all'): ProductRow {
    const meta = r.metadata || {};
    const variants: VariantRow[] = (r.variants || []).map((v: any) => ({
        id: v.id,
        label: [v.option2, v.option1 || v.name].filter(Boolean).join(' / ') || v.name || 'Variant',
        ghs: derive(num(v.price_ghs), num(v.compare_at_price_ghs), num(v.paused_sale_price_ghs)),
        usd: derive(num(v.price) ?? 0, num(v.compare_at_price), num(v.paused_sale_price)) as Money,
    }));
    const hasVariants = variants.length > 0;

    const ownGhs = derive(num(r.price_ghs), num(r.compare_at_price_ghs), num(meta.paused_sale_price_ghs));
    const ownUsd = derive(num(r.price) ?? 0, num(r.compare_at_price), num(meta.paused_sale_price)) as Money;

    const everyVariantHasGhs = hasVariants && variants.every((v) => v.ghs != null);
    const ghs = hasVariants ? (everyVariantHasGhs ? summarise(variants.map((v) => v.ghs)) : null) : ownGhs;
    const usd = hasVariants ? (summarise(variants.map((v) => v.usd)) as Money) : ownUsd;
    // Sale prices are typed in cedis, unless sales are for outside Ghana only
    // or the product has no cedi price.
    const currency: Currency = markets !== 'USD' && ghs != null && ghs.regular > 0 ? 'GHS' : 'USD';

    const perItem = hasVariants
        ? variants.map((v) => (currency === 'GHS' ? v.ghs : v.usd))
        : [currency === 'GHS' ? ownGhs : ownUsd];

    return {
        id: r.id,
        name: r.name || 'Untitled product',
        slug: r.slug,
        status: r.status,
        category: r.category || 'Uncategorized',
        image: r.image || null,
        on_sale: !!r.on_sale,
        paused: meta.paused_sale_price != null,
        currency,
        ghs,
        usd,
        priceVaries: hasVariants && new Set(perItem.map((m) => m?.regular)).size > 1,
        pct: Math.max(0, ...perItem.map(pctOf)),
        variants,
    };
}

const primary = (p: ProductRow): Money => (p.currency === 'GHS' && p.ghs ? p.ghs : p.usd);

/** On sale and showing its discount right now. */
const isLive = (p: ProductRow) => p.on_sale && !p.paused;
/** On sale, but switched off. */
const isPaused = (p: ProductRow) => p.on_sale && p.paused;

export default function AdminSalesPage() {
    const [products, setProducts] = useState<ProductRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [saleFilter, setSaleFilter] = useState<'all' | 'on' | 'live' | 'paused' | 'off'>('all');
    const [page, setPage] = useState(1);

    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkPercent, setBulkPercent] = useState('');
    const [bulkFixed, setBulkFixed] = useState('');
    const [rowPrice, setRowPrice] = useState<Record<string, string>>({});
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [variantInputs, setVariantInputs] = useState<Record<string, string>>({});
    const [variantFillAll, setVariantFillAll] = useState('');
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
    const [salesActive, setSalesActive] = useState(true);
    const [salesMarkets, setSalesMarkets] = useState<Markets>('all');
    const [changingMarkets, setChangingMarkets] = useState<Markets | null>(null);
    const [togglingActive, setTogglingActive] = useState(false);
    // A row's switch while its request is running: shows the new position at once.
    const [switching, setSwitching] = useState<{ id: string; to: boolean } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const json = await adminFetch('/api/admin/sales');
            const markets: Markets = json.salesMarkets === 'USD' || json.salesMarkets === 'GHS' ? json.salesMarkets : 'all';
            setSalesMarkets(markets);
            setProducts((json.products || []).map((r: any) => toRow(r, markets)));
            setSalesActive(json.salesActive !== false);
        } catch (err: any) {
            setLoadError(err?.message || 'Could not load products');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 6000);
        return () => clearTimeout(t);
    }, [toast]);

    const categories = useMemo(
        () => Array.from(new Set(products.map((r) => r.category))).sort(),
        [products],
    );

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return products.filter((p) => {
            if (term && !p.name.toLowerCase().includes(term)) return false;
            if (categoryFilter && p.category !== categoryFilter) return false;
            if (saleFilter === 'on' && !p.on_sale) return false;
            if (saleFilter === 'live' && !isLive(p)) return false;
            if (saleFilter === 'paused' && !isPaused(p)) return false;
            if (saleFilter === 'off' && p.on_sale) return false;
            return true;
        });
    }, [products, search, categoryFilter, saleFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    useEffect(() => {
        setPage(1);
    }, [search, categoryFilter, saleFilter]);

    const onSaleCount = useMemo(() => products.filter((p) => p.on_sale).length, [products]);
    const liveCount = useMemo(() => products.filter(isLive).length, [products]);
    const pausedCount = onSaleCount - liveCount;

    const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));

    const toggleSelectAllFiltered = () => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (allFilteredSelected) filtered.forEach((p) => next.delete(p.id));
            else filtered.forEach((p) => next.add(p.id));
            return next;
        });
    };

    const toggleOne = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const callApi = (payload: Record<string, unknown>) =>
        adminFetch('/api/admin/sales', { method: 'POST', body: JSON.stringify(payload) });

    /** Put the server's updated rows into the table. */
    const mergeRows = (rows: any[] | undefined) => {
        if (!rows?.length) return;
        const byId = new Map(rows.map((r) => [r.id, toRow(r, salesMarkets)]));
        setProducts((prev) => prev.map((p) => byId.get(p.id) || p));
    };

    const toggleSalesActive = async () => {
        const next = !salesActive;
        const question = next
            ? 'Turn ON all sales? Every switched-off sale goes live, including products you switched off one by one.'
            : 'Turn OFF all sales? Every product goes back to its normal price, including products you switched on one by one. Each sale price is kept and returns when you switch it on again.';
        if (!confirm(question)) return;
        setTogglingActive(true);
        try {
            await callApi({ action: 'set_active', active: next });
            setSalesActive(next);
            setExpandedId(null);
            await load();
            setToast({
                text: next
                    ? 'All sales are ON. Every sale price is live.'
                    : 'All sales are OFF. Every product is at its normal price.',
                ok: true,
            });
        } catch (err: any) {
            setToast({ text: err?.message || 'Could not switch sales', ok: false });
        } finally {
            setTogglingActive(false);
        }
    };

    /** Choose who sees sale prices: everyone, outside Ghana only, or Ghana only. */
    const changeMarkets = async (next: Markets) => {
        if (next === salesMarkets || changingMarkets) return;
        const question =
            next === 'all'
                ? 'Show sale prices to everyone? Customers in Ghana and outside Ghana will both see the sale prices.'
                : next === 'USD'
                    ? 'Show sale prices outside Ghana only? Customers in Ghana will see normal cedi prices. Dollar sale prices stay.'
                    : 'Show sale prices in Ghana only? Customers outside Ghana will see normal dollar prices. Cedi sale prices stay.';
        if (!confirm(question)) return;
        setChangingMarkets(next);
        try {
            await callApi({ action: 'set_markets', markets: next });
            setExpandedId(null);
            setSelected(new Set());
            await load();
            setToast({
                text:
                    next === 'all'
                        ? 'Sale prices now show to everyone.'
                        : next === 'USD'
                            ? 'Sale prices now show outside Ghana only. Ghana is back to normal prices.'
                            : 'Sale prices now show in Ghana only. Outside Ghana is back to normal prices.',
                ok: true,
            });
        } catch (err: any) {
            setToast({ text: err?.message || 'Could not change who sees sale prices', ok: false });
        } finally {
            setChangingMarkets(null);
        }
    };

    /** The currency a bulk fixed price is typed in. */
    const bulkCurrency: Currency = salesMarkets === 'USD' ? 'USD' : 'GHS';

    /** Switch one product's sale on or off. */
    const toggleProductSale = async (p: ProductRow) => {
        if (switching) return;
        const next = !isLive(p);
        setSwitching({ id: p.id, to: next });
        try {
            const json = await callApi({ action: 'set_product_active', active: next, productIds: [p.id] });
            mergeRows(json?.products);
            if (expandedId === p.id) setExpandedId(null);
            setToast({
                text: next ? `${p.name}: sale is on.` : `${p.name}: sale is off. It shows the normal price.`,
                ok: true,
            });
        } catch (err: any) {
            setToast({ text: err?.message || 'Could not switch the sale', ok: false });
        } finally {
            setSwitching(null);
        }
    };

    /** Switch the selected products' sales on or off. */
    const switchSelected = async (active: boolean) => {
        const ids = Array.from(selected);
        if (ids.length === 0) {
            setToast({ text: 'Select at least one product first', ok: false });
            return;
        }
        setBusy(true);
        try {
            const json = await callApi({ action: 'set_product_active', active, productIds: ids });
            mergeRows(json?.products);
            const changed = active ? json?.result?.products_resumed ?? 0 : json?.result?.products_paused ?? 0;
            setToast({
                text: `Switched ${active ? 'on' : 'off'} ${changed} sale${changed === 1 ? '' : 's'}.`,
                ok: true,
            });
            setSelected(new Set());
            setExpandedId(null);
        } catch (err: any) {
            setToast({ text: err?.message || 'That did not go through', ok: false });
        } finally {
            setBusy(false);
        }
    };

    /** Extra toast text when a change left sales switched off. */
    const pausedNote = (json: any) => {
        const n = json?.paused ?? 0;
        if (!n) return '';
        return salesActive
            ? ' Sales that were switched off stay off.'
            : ' All sales are off, so new sale prices start switched off. Use the Live switch to turn one on.';
    };

    const runBulk = async (kind: 'percentage' | 'fixed' | 'remove') => {
        const ids = Array.from(selected);
        if (ids.length === 0) {
            setToast({ text: 'Select at least one product first', ok: false });
            return;
        }
        let payload: Record<string, unknown>;
        let value: number | undefined;
        if (kind === 'remove') {
            payload = { action: 'remove', productIds: ids };
        } else if (kind === 'percentage') {
            value = Number(bulkPercent);
            if (!Number.isFinite(value) || value <= 0 || value >= 100) {
                setToast({ text: 'Enter a discount between 1 and 99%', ok: false });
                return;
            }
            payload = { action: 'apply', mode: 'percentage', value, productIds: ids };
        } else {
            value = Number(bulkFixed);
            if (!Number.isFinite(value) || value <= 0) {
                setToast({ text: 'Enter a valid sale price', ok: false });
                return;
            }
            payload = { action: 'apply', mode: 'fixed', value, currency: bulkCurrency, productIds: ids };
        }

        setBusy(true);
        try {
            const json = await callApi(payload);
            mergeRows(json?.products);
            const n = ids.length;
            if (kind === 'remove') {
                setToast({ text: `Removed ${n} product${n > 1 ? 's' : ''} from sale`, ok: true });
            } else if (kind === 'percentage') {
                setToast({ text: `Applied ${value}% off to ${n} product${n > 1 ? 's' : ''}.${pausedNote(json)}`, ok: true });
            } else {
                const skipped = json?.skipped ?? 0;
                const done = n - skipped;
                setToast({
                    text:
                        (skipped
                            ? `Set sale price on ${done} product${done !== 1 ? 's' : ''}. ${skipped} skipped (has variants, has no ${bulkCurrency === 'GHS' ? 'cedi' : 'dollar'} price, or the price is not below the regular price).`
                            : `Set sale price on ${n} product${n > 1 ? 's' : ''}.`) + pausedNote(json),
                    ok: done > 0,
                });
            }
            setSelected(new Set());
            setBulkPercent('');
            setBulkFixed('');
            setExpandedId(null);
        } catch (err: any) {
            setToast({ text: err?.message || 'That did not go through', ok: false });
        } finally {
            setBusy(false);
        }
    };

    const applyRowPrice = async (p: ProductRow) => {
        const value = Number(rowPrice[p.id]);
        if (!Number.isFinite(value) || value <= 0) {
            setToast({ text: 'Enter a valid sale price', ok: false });
            return;
        }
        if (value >= primary(p).regular) {
            setToast({ text: 'Sale price must be below the regular price', ok: false });
            return;
        }
        setBusy(true);
        try {
            const json = await callApi({
                action: 'apply',
                mode: 'fixed',
                value,
                currency: p.currency,
                productIds: [p.id],
            });
            mergeRows(json?.products);
            setRowPrice((prev) => ({ ...prev, [p.id]: '' }));
            setToast({ text: `${p.name} set to ${fmtMoney(value, p.currency)}.${pausedNote(json)}`, ok: true });
        } catch (err: any) {
            setToast({ text: err?.message || 'That did not go through', ok: false });
        } finally {
            setBusy(false);
        }
    };

    const removeRow = async (p: ProductRow) => {
        setBusy(true);
        try {
            const json = await callApi({ action: 'remove', productIds: [p.id] });
            mergeRows(json?.products);
            if (expandedId === p.id) setExpandedId(null);
            setToast({ text: `${p.name} removed from sale`, ok: true });
        } catch (err: any) {
            setToast({ text: err?.message || 'That did not go through', ok: false });
        } finally {
            setBusy(false);
        }
    };

    const toggleVariants = (p: ProductRow) => {
        setVariantFillAll('');
        setExpandedId((cur) => (cur === p.id ? null : p.id));
    };

    /** Apply the typed sale prices for one product's variants. */
    const applyVariantPrices = async (p: ProductRow) => {
        const items: { variantId: string; price: number }[] = [];
        for (const v of p.variants) {
            const raw = variantInputs[v.id];
            if (raw == null || raw.trim() === '') continue;
            const value = Number(raw);
            const regular = (p.currency === 'GHS' && v.ghs ? v.ghs : v.usd).regular;
            if (!Number.isFinite(value) || value <= 0) {
                setToast({ text: `Enter a valid sale price for "${v.label}"`, ok: false });
                return;
            }
            if (value >= regular) {
                setToast({
                    text: `Sale price for "${v.label}" must be below its regular price (${fmtMoney(regular, p.currency)})`,
                    ok: false,
                });
                return;
            }
            items.push({ variantId: v.id, price: Math.round(value * 100) / 100 });
        }
        if (items.length === 0) {
            setToast({ text: 'Enter a sale price for at least one variant', ok: false });
            return;
        }
        setBusy(true);
        try {
            const json = await callApi({ action: 'variant_prices', items, currency: p.currency });
            mergeRows(json?.products);
            setExpandedId(null);
            setVariantInputs((prev) => {
                const next = { ...prev };
                items.forEach((i) => delete next[i.variantId]);
                return next;
            });
            setToast({
                text: `Set sale price on ${items.length} variant${items.length > 1 ? 's' : ''} of ${p.name}.${pausedNote(json)}`,
                ok: true,
            });
        } catch (err: any) {
            setToast({ text: err?.message || 'That did not go through', ok: false });
        } finally {
            setBusy(false);
        }
    };

    /** Cedi price with the dollar price under it (or the dollar price alone). */
    const priceCell = (p: ProductRow, pick: (m: Money) => number | null, className: string) => {
        const main = pick(primary(p));
        if (main == null) return <span className="text-gray-400">—</span>;
        // The other currency goes underneath, so both markets are always in view.
        const otherCurrency: Currency = p.currency === 'GHS' ? 'USD' : 'GHS';
        const otherMoney = otherCurrency === 'USD' ? p.usd : p.ghs;
        const other = otherMoney ? pick(otherMoney) : null;
        return (
            <div className="tabular-nums">
                <div className={className}>
                    {p.priceVaries && <span className="font-normal text-gray-500">From </span>}
                    {fmtMoney(main, p.currency)}
                </div>
                {other != null && other > 0 && <div className="text-xs text-gray-600">{fmtMoney(other, otherCurrency)}</div>}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Sales</h1>
                    <p className="text-gray-600 mt-1">
                        Set a discount % or a sale price, then switch each sale on or off, or all of them at once.
                    </p>
                </div>
                <Link
                    href="/sale"
                    target="_blank"
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center gap-2 text-sm font-medium self-start md:self-auto"
                >
                    <i className="ri-external-link-line"></i>
                    View Sale page
                </Link>
            </div>

            {/* Master on/off switch */}
            <div
                className={`rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    salesActive ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                }`}
            >
                <div className="flex items-start gap-3">
                    <i
                        className={`text-2xl mt-0.5 ${
                            salesActive ? 'ri-flashlight-fill text-green-600' : 'ri-pause-circle-line text-amber-600'
                        }`}
                    ></i>
                    <div>
                        <p className="font-semibold text-gray-900">
                            All sales: {salesActive ? 'ON' : 'OFF'}
                            <span className="ml-2 text-sm font-normal text-gray-600">
                                {liveCount} live{pausedCount > 0 ? `, ${pausedCount} switched off` : ''}
                            </span>
                        </p>
                        <p className="text-sm text-gray-600 mt-0.5 max-w-xl">
                            {salesActive
                                ? 'This switch turns every sale on or off at once. To switch one product, use its Live switch in the table.'
                                : 'Every sale is off. You can still switch on single products with their Live switch in the table, or turn every sale back on here.'}
                        </p>
                    </div>
                </div>
                <button
                    onClick={toggleSalesActive}
                    disabled={togglingActive || busy || loading}
                    role="switch"
                    aria-checked={salesActive}
                    aria-busy={togglingActive}
                    aria-label="All sales"
                    className={`relative inline-flex h-9 w-16 flex-shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 ${
                        salesActive ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                >
                    <span
                        className={`relative inline-flex h-7 w-7 transform items-center justify-center rounded-full bg-white shadow transition-transform duration-200 ${
                            salesActive ? 'translate-x-8' : 'translate-x-1'
                        }`}
                    >
                        {togglingActive && <i className="ri-loader-4-line animate-spin text-gray-500 text-sm"></i>}
                    </span>
                </button>
            </div>

            {/* Who sees sale prices */}
            <fieldset className="bg-white rounded-xl border border-gray-200 p-5" disabled={!!changingMarkets || busy || togglingActive || loading}>
                <legend className="sr-only">Who sees sale prices</legend>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                        <p className="font-semibold text-gray-900">Who sees sale prices</p>
                        <p className="text-sm text-gray-600 mt-0.5 max-w-xl">
                            {salesMarkets === 'all'
                                ? 'Every customer sees the sale prices, in cedis in Ghana and in dollars everywhere else.'
                                : salesMarkets === 'USD'
                                    ? 'Only customers outside Ghana see sale prices. Customers in Ghana see normal cedi prices.'
                                    : 'Only customers in Ghana see sale prices. Customers outside Ghana see normal dollar prices.'}
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 lg:w-[620px] flex-shrink-0">
                        {MARKET_CHOICES.map((choice) => {
                            const chosen = salesMarkets === choice.value;
                            const pending = changingMarkets === choice.value;
                            return (
                                <label
                                    key={choice.value}
                                    className={`relative flex items-center gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 has-[:disabled]:cursor-not-allowed ${
                                        chosen ? 'border-blue-700 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="sales-markets"
                                        value={choice.value}
                                        checked={chosen}
                                        onChange={() => changeMarkets(choice.value)}
                                        className="w-4 h-4 text-blue-700 border-gray-300 focus:ring-0"
                                    />
                                    <span className="min-w-0">
                                        <span className={`block text-sm font-semibold ${chosen ? 'text-blue-800' : 'text-gray-900'}`}>
                                            {choice.label}
                                            {pending && <i className="ri-loader-4-line animate-spin ml-1.5 align-middle" aria-hidden="true"></i>}
                                        </span>
                                        <span className="block text-xs text-gray-600">{choice.detail}</span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            </fieldset>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-sm text-gray-500">Total products</p>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">{products.length}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-sm text-gray-500">Sale live</p>
                    <p className="text-2xl font-bold text-red-600 tabular-nums">{liveCount}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-sm text-gray-500">Sale switched off</p>
                    <p className="text-2xl font-bold text-amber-600 tabular-nums">{pausedCount}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-sm text-gray-500">Not on sale</p>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">{products.length - onSaleCount}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col md:flex-row gap-3 md:items-center">
                <div className="relative flex-1">
                    <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search products by name…"
                        aria-label="Search products by name"
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    aria-label="Category"
                    className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
                <select
                    value={saleFilter}
                    onChange={(e) => setSaleFilter(e.target.value as typeof saleFilter)}
                    aria-label="Sale status"
                    className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                    <option value="all">All products</option>
                    <option value="on">On sale</option>
                    <option value="live">Sale live</option>
                    <option value="paused">Sale switched off</option>
                    <option value="off">Not on sale</option>
                </select>
            </div>

            {/* Bulk action bar */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 lg:sticky lg:top-20 z-20">
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    <label className="flex items-center gap-2 lg:w-56 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={allFilteredSelected}
                            onChange={toggleSelectAllFiltered}
                            className="w-4 h-4 rounded border-gray-300"
                        />
                        <span className="text-sm font-medium text-gray-700">
                            {selected.size > 0 ? `${selected.size} selected` : `Select all ${filtered.length} filtered`}
                        </span>
                    </label>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                inputMode="decimal"
                                min={1}
                                max={99}
                                value={bulkPercent}
                                onChange={(e) => setBulkPercent(e.target.value)}
                                placeholder="%"
                                aria-label="Discount percent"
                                className="w-20 px-3 py-2 border border-gray-300 rounded-lg bg-white"
                            />
                            <button
                                onClick={() => runBulk('percentage')}
                                disabled={busy || selected.size === 0}
                                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                            >
                                Apply % off
                            </button>
                        </div>

                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.01"
                                value={bulkFixed}
                                onChange={(e) => setBulkFixed(e.target.value)}
                                placeholder={bulkCurrency === 'GHS' ? '₵ price' : '$ price'}
                                aria-label={bulkCurrency === 'GHS' ? 'Sale price in cedis' : 'Sale price in dollars'}
                                className="w-28 px-3 py-2 border border-gray-300 rounded-lg bg-white"
                            />
                            <button
                                onClick={() => runBulk('fixed')}
                                disabled={busy || selected.size === 0}
                                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                            >
                                Set price
                            </button>
                        </div>

                        <button
                            onClick={() => switchSelected(true)}
                            disabled={busy || selected.size === 0}
                            className="px-4 py-2 bg-white border border-green-300 text-green-800 hover:bg-green-50 rounded-lg text-sm font-semibold disabled:opacity-50"
                        >
                            Switch on
                        </button>
                        <button
                            onClick={() => switchSelected(false)}
                            disabled={busy || selected.size === 0}
                            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-semibold disabled:opacity-50"
                        >
                            Switch off
                        </button>

                        <button
                            onClick={() => runBulk('remove')}
                            disabled={busy || selected.size === 0}
                            className="px-4 py-2 bg-white border border-red-300 text-red-700 hover:bg-red-50 rounded-lg text-sm font-semibold disabled:opacity-50"
                        >
                            Remove from sale
                        </button>
                    </div>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                    {salesMarkets === 'all'
                        ? 'A discount % lowers the cedi price and the dollar price together. A fixed price is in cedis and the dollar price drops by the same share.'
                        : salesMarkets === 'USD'
                            ? 'Discounts apply to dollar prices only. Ghana prices stay as they are. A fixed price is in dollars.'
                            : 'Discounts apply to cedi prices only. Prices outside Ghana stay as they are. A fixed price is in cedis.'}{' '}
                    A fixed price applies only to products without variants and must be below the regular price. For
                    variant products use a percentage, or click &quot;Variant prices&quot; on the row.
                </p>
            </div>

            {toast && (
                <div
                    role="status"
                    className={`rounded-lg px-4 py-3 text-sm ${
                        toast.ok
                            ? 'bg-green-50 text-green-800 border border-green-200'
                            : 'bg-red-50 text-red-800 border border-red-200'
                    }`}
                >
                    {toast.text}
                </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-gray-500">
                        <i className="ri-loader-4-line text-3xl animate-spin block mb-2"></i>
                        Loading products…
                    </div>
                ) : loadError ? (
                    <div className="p-12 text-center">
                        <p className="text-gray-900 font-medium">The products did not load.</p>
                        <p className="text-sm text-gray-600 mt-1">{loadError}</p>
                        <button
                            onClick={load}
                            className="mt-4 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold"
                        >
                            Try again
                        </button>
                    </div>
                ) : products.length === 0 ? (
                    <div className="p-12 text-center text-gray-600">
                        No products yet.{' '}
                        <Link href="/admin/products/new" className="text-blue-700 font-medium hover:underline">
                            Add a product
                        </Link>{' '}
                        and it will show here.
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">No products match your filters.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 text-left border-b border-gray-200">
                                    <th className="p-3 w-10"><span className="sr-only">Select</span></th>
                                    <th className="p-3 font-semibold">Product</th>
                                    <th className="p-3 font-semibold">Regular</th>
                                    <th className="p-3 font-semibold">Sale price</th>
                                    <th className="p-3 font-semibold">Off</th>
                                    <th className="p-3 font-semibold">Live</th>
                                    <th className="p-3 font-semibold">Set price</th>
                                    <th className="p-3"><span className="sr-only">Remove</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageRows.map((p) => {
                                    const pending = switching?.id === p.id;
                                    const on = pending ? switching!.to : isLive(p);
                                    const expanded = expandedId === p.id;
                                    const symbol = p.currency === 'GHS' ? '₵' : '$';
                                    return (
                                        <Fragment key={p.id}>
                                            <tr className="border-b border-gray-100 hover:bg-gray-50/70">
                                                <td className="p-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={selected.has(p.id)}
                                                        onChange={() => toggleOne(p.id)}
                                                        aria-label={`Select ${p.name}`}
                                                        className="w-4 h-4 rounded border-gray-300"
                                                    />
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-3">
                                                        {p.image ? (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img
                                                                src={p.image}
                                                                alt=""
                                                                loading="lazy"
                                                                className="w-10 h-10 rounded object-cover bg-gray-100 flex-shrink-0"
                                                            />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded bg-gray-100 flex-shrink-0 flex items-center justify-center text-gray-400">
                                                                <i className="ri-image-line"></i>
                                                            </div>
                                                        )}
                                                        <div className="min-w-0">
                                                            <div className="font-medium text-gray-900 truncate max-w-[260px]">{p.name}</div>
                                                            <div className="text-xs text-gray-500 flex flex-wrap items-center gap-2">
                                                                <span>{p.category}</span>
                                                                {p.variants.length > 0 && (
                                                                    <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
                                                                        {p.variants.length} variants
                                                                    </span>
                                                                )}
                                                                {p.status !== 'active' && (
                                                                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">{p.status}</span>
                                                                )}
                                                                {p.currency === 'USD' && salesMarkets !== 'USD' && (
                                                                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">No cedi price</span>
                                                                )}
                                                                {salesMarkets === 'USD' && !(p.usd.regular > 0) && (
                                                                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">No dollar price</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-3 whitespace-nowrap">
                                                    {priceCell(p, (m) => m.regular, 'text-gray-700')}
                                                </td>
                                                <td className="p-3 whitespace-nowrap">
                                                    <div className="flex items-start gap-1">
                                                        {priceCell(p, (m) => m.sale, 'font-semibold text-red-600')}
                                                        {isPaused(p) && primary(p).sale != null && (
                                                            <span className="text-xs text-amber-700">(off)</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-3 whitespace-nowrap">
                                                    {p.pct > 0 ? (
                                                        <span className="inline-block px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs font-bold tabular-nums">
                                                            -{p.pct}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400">—</span>
                                                    )}
                                                </td>
                                                <td className="p-3">
                                                    {p.on_sale ? (
                                                        <button
                                                            type="button"
                                                            role="switch"
                                                            aria-checked={on}
                                                            aria-busy={pending}
                                                            aria-label={`Sale for ${p.name}`}
                                                            onClick={() => toggleProductSale(p)}
                                                            disabled={busy || togglingActive || !!switching}
                                                            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 ${
                                                                on ? 'bg-green-600' : 'bg-gray-300'
                                                            } ${pending ? 'opacity-60' : switching || busy || togglingActive ? 'opacity-50' : ''}`}
                                                        >
                                                            <span
                                                                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                                                                    on ? 'translate-x-[22px]' : 'translate-x-0.5'
                                                                }`}
                                                            />
                                                        </button>
                                                    ) : (
                                                        <span className="text-gray-400">—</span>
                                                    )}
                                                </td>
                                                <td className="p-3">
                                                    {p.variants.length > 0 ? (
                                                        <button
                                                            onClick={() => toggleVariants(p)}
                                                            disabled={busy}
                                                            aria-expanded={expanded}
                                                            className="px-2.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-medium disabled:opacity-50 inline-flex items-center gap-1 whitespace-nowrap"
                                                        >
                                                            <i className={expanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}></i>
                                                            {expanded ? 'Hide variants' : 'Variant prices'}
                                                        </button>
                                                    ) : (
                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                type="number"
                                                                inputMode="decimal"
                                                                min={0}
                                                                step="0.01"
                                                                value={rowPrice[p.id] ?? ''}
                                                                onChange={(e) => setRowPrice((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                                                onKeyDown={(e) => e.key === 'Enter' && applyRowPrice(p)}
                                                                placeholder={symbol}
                                                                aria-label={`Sale price for ${p.name} in ${p.currency === 'GHS' ? 'cedis' : 'dollars'}`}
                                                                className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg"
                                                            />
                                                            <button
                                                                onClick={() => applyRowPrice(p)}
                                                                disabled={busy}
                                                                className="px-2.5 py-1.5 bg-gray-900 hover:bg-black text-white rounded-lg text-xs font-medium disabled:opacity-50"
                                                            >
                                                                Set
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3 text-right">
                                                    {p.on_sale && (
                                                        <button
                                                            onClick={() => removeRow(p)}
                                                            disabled={busy}
                                                            className="text-red-600 hover:text-red-800 text-xs font-medium disabled:opacity-50 whitespace-nowrap"
                                                        >
                                                            Remove
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                            {expanded && (
                                                <tr className="border-b border-gray-100 bg-blue-50/40">
                                                    <td className="p-0"></td>
                                                    <td colSpan={7} className="p-4">
                                                        <div className="space-y-3">
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                                <p className="text-xs text-gray-600">
                                                                    Type a sale price in {p.currency === 'GHS' ? 'cedis' : 'dollars'} for each
                                                                    variant. Leave a box empty to keep that variant as it is.
                                                                </p>
                                                                <div className="flex items-center gap-1">
                                                                    <input
                                                                        type="number"
                                                                        inputMode="decimal"
                                                                        min={0}
                                                                        step="0.01"
                                                                        value={variantFillAll}
                                                                        onChange={(e) => setVariantFillAll(e.target.value)}
                                                                        placeholder={`${symbol} same for all`}
                                                                        aria-label="Same sale price for every variant"
                                                                        className="w-36 px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                                                                    />
                                                                    <button
                                                                        onClick={() => {
                                                                            if (!variantFillAll.trim()) return;
                                                                            setVariantInputs((prev) => {
                                                                                const next = { ...prev };
                                                                                p.variants.forEach((v) => {
                                                                                    next[v.id] = variantFillAll;
                                                                                });
                                                                                return next;
                                                                            });
                                                                        }}
                                                                        className="px-2.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg text-xs font-medium"
                                                                    >
                                                                        Fill all
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <ul className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3 bg-white border border-gray-200 rounded-lg px-3">
                                                                {p.variants.map((v) => {
                                                                    const m = p.currency === 'GHS' && v.ghs ? v.ghs : v.usd;
                                                                    return (
                                                                        <li
                                                                            key={v.id}
                                                                            className="py-2.5 flex items-center justify-between gap-3 border-b border-gray-100"
                                                                        >
                                                                            <div className="min-w-0">
                                                                                <p className="text-sm font-medium text-gray-900 truncate">{v.label}</p>
                                                                                <p className="text-xs text-gray-500 tabular-nums">
                                                                                    Regular {fmtMoney(m.regular, p.currency)}
                                                                                    {m.sale != null && (
                                                                                        <span className="text-red-600 font-semibold">
                                                                                            {' '}• Sale {fmtMoney(m.sale, p.currency)}
                                                                                        </span>
                                                                                    )}
                                                                                </p>
                                                                            </div>
                                                                            <input
                                                                                type="number"
                                                                                inputMode="decimal"
                                                                                min={0}
                                                                                step="0.01"
                                                                                value={variantInputs[v.id] ?? ''}
                                                                                onChange={(e) =>
                                                                                    setVariantInputs((prev) => ({ ...prev, [v.id]: e.target.value }))
                                                                                }
                                                                                placeholder={`${symbol} sale`}
                                                                                aria-label={`Sale price for ${v.label}`}
                                                                                className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-sm flex-shrink-0"
                                                                            />
                                                                        </li>
                                                                    );
                                                                })}
                                                            </ul>

                                                            <div className="flex justify-end">
                                                                <button
                                                                    onClick={() => applyVariantPrices(p)}
                                                                    disabled={busy}
                                                                    className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                                                                >
                                                                    Apply variant prices
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {!loading && filtered.length > PAGE_SIZE && (
                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 tabular-nums">
                        Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage((n) => Math.max(1, n - 1))}
                            disabled={currentPage <= 1}
                            className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 text-sm"
                        >
                            Previous
                        </button>
                        <span className="text-sm text-gray-600 tabular-nums">Page {currentPage} / {totalPages}</span>
                        <button
                            onClick={() => setPage((n) => Math.min(totalPages, n + 1))}
                            disabled={currentPage >= totalPages}
                            className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 text-sm"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
