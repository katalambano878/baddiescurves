'use client';

import { formatMoney } from '@/lib/format-money';
import { Fragment, useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// Stock value on this page is in Ghana cedis, worked out from cedi prices
// (price_ghs). The dollar price is a separate price and is never used here.

interface InventoryVariant {
  id: string;
  label: string;
  sku: string;
  stock: number;
  priceGhs: number | null; // null = no cedi price set
}

interface InventoryProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number; // the product's own stock (used when it has no variants)
  priceGhs: number | null;
  lowStockAt: number;
  variants: InventoryVariant[];
}

const STATUS_LABELS: Record<string, string> = { good: 'In Stock', low: 'Low Stock', out: 'Out of Stock' };

/** A cedi price greater than 0, or null when none is set. */
function cediPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function stockNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function variantLabel(v: { name?: string | null; option2?: string | null }): string {
  const color = (v.option2 || '').trim();
  const name = (v.name || '').trim();
  if (color && name && color !== name) return `${color} / ${name}`;
  return color || name || 'Default';
}

/** Stock, cedi value and status of one product, worked out from its variants when it has any. */
function summarize(product: InventoryProduct) {
  const hasVariants = product.variants.length > 0;
  const currentStock = hasVariants
    ? product.variants.reduce((sum, v) => sum + v.stock, 0)
    : product.quantity;

  // Lines that make up the value: one per variant, or the product itself
  const lines = hasVariants
    ? product.variants.map((v) => ({ stock: v.stock, priceGhs: v.priceGhs }))
    : [{ stock: product.quantity, priceGhs: product.priceGhs }];
  const value = lines.reduce((sum, line) => sum + (line.priceGhs !== null ? line.stock * line.priceGhs : 0), 0);
  const unpricedLines = lines.filter((line) => line.priceGhs === null).length;

  let status = 'good';
  if (currentStock <= 0) status = 'out';
  else if (currentStock <= product.lowStockAt) status = 'low';

  return {
    currentStock,
    value,
    // 'none' = nothing could be valued, 'some' = part of it could not
    unpriced: unpricedLines === 0 ? null : unpricedLines === lines.length ? 'none' : 'some',
    status
  };
}

/** One CSV field: always quoted, quotes doubled, and never read as a formula by a spreadsheet. */
function csvField(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export default function InventoryManagementPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Inline stock editor: one product at a time. Keys are variant ids, or
  // 'product' for a product without variants.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editBase, setEditBase] = useState<Record<string, number>>({});
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [savingStock, setSavingStock] = useState(false);

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('products')
      .select(`
        id,
        name,
        sku,
        price_ghs,
        quantity,
        metadata,
        categories(name),
        product_variants(id, name, option2, sku, price_ghs, quantity)
      `)
      .order('name');

    if (error || !data) {
      console.error('Error fetching inventory:', error);
      setLoadError('Could not load the inventory. Check your connection and try again.');
      setLoading(false);
      return;
    }

    const mapped: InventoryProduct[] = data.map((p: any) => {
      const ownPrice = cediPrice(p.price_ghs);
      // The category comes back as one object, not a list
      const category = Array.isArray(p.categories) ? p.categories[0] : p.categories;
      const variants: InventoryVariant[] = (Array.isArray(p.product_variants) ? p.product_variants : [])
        .map((v: any) => ({
          id: v.id,
          label: variantLabel(v),
          sku: v.sku || '',
          stock: stockNumber(v.quantity),
          // A variant without its own cedi price uses the product's cedi price, as the shop does
          priceGhs: cediPrice(v.price_ghs) ?? ownPrice
        }))
        .sort((a: InventoryVariant, b: InventoryVariant) => a.label.localeCompare(b.label, undefined, { numeric: true }));
      return {
        id: p.id,
        name: (p.name || '').trim() || 'No name',
        sku: p.sku || 'N/A',
        category: category?.name || 'Uncategorized',
        quantity: stockNumber(p.quantity),
        priceGhs: ownPrice,
        lowStockAt: Number(p.metadata?.low_stock_threshold) || 5,
        variants
      };
    });
    setProducts(mapped);
    setLoading(false);
  };

  const rows = products.map((product) => ({ ...product, ...summarize(product) }));

  const filteredProducts = rows.filter(product => {
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch = !term ||
      product.name.toLowerCase().includes(term) ||
      product.sku.toLowerCase().includes(term) ||
      product.variants.some((v) => v.sku.toLowerCase().includes(term));
    const matchesFilter = stockFilter === 'all' || product.status === stockFilter;
    return matchesSearch && matchesFilter;
  });

  const lowStockCount = rows.filter(p => p.status === 'low').length;
  const outOfStockCount = rows.filter(p => p.status === 'out').length;
  const totalValue = rows.reduce((sum, p) => sum + p.value, 0);
  // Products with stock that could not be valued, fully or in part, because a cedi price is missing
  const leftOutCount = rows.filter(p => p.unpriced !== null).length;

  // ---- Inline stock editor --------------------------------------------------

  const closeEditor = () => {
    setEditingId(null);
    setEditBase({});
    setEditDraft({});
    setEditError(null);
  };

  // Puts freshly read stock numbers into the list
  const applyStock = (productId: string, stock: Record<string, number>) => {
    setProducts((prev) => prev.map((p) => {
      if (p.id !== productId) return p;
      if (p.variants.length === 0) {
        return { ...p, quantity: stock.product ?? p.quantity };
      }
      const variants = p.variants.map((v) => ({ ...v, stock: stock[v.id] ?? v.stock }));
      return { ...p, variants, quantity: variants.reduce((sum, v) => sum + v.stock, 0) };
    }));
  };

  // Opens the editor on the stock as it is right now: orders may have come in
  // since the page was loaded, and saving must not put sold stock back.
  const openEditor = async (product: InventoryProduct) => {
    if (savingStock || editLoading) return;
    setEditingId(product.id);
    setEditError(null);
    setEditBase({});
    setEditDraft({});
    setEditLoading(true);

    const base: Record<string, number> = {};
    if (product.variants.length > 0) {
      const { data, error } = await supabase
        .from('product_variants')
        .select('id, quantity')
        .eq('product_id', product.id);
      if (error || !data) {
        setEditError('Could not read the current stock. Check your connection and try again.');
        setEditLoading(false);
        return;
      }
      for (const variant of product.variants) {
        const fresh = data.find((row: any) => row.id === variant.id);
        if (fresh) base[variant.id] = stockNumber(fresh.quantity);
      }
      if (Object.keys(base).length !== product.variants.length || data.length !== product.variants.length) {
        // Variants were added or removed on the product page since this list was loaded
        setEditError('This product\'s variants have changed. Reload the page, then edit its stock.');
        setEditLoading(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from('products')
        .select('quantity')
        .eq('id', product.id)
        .maybeSingle();
      if (error || !data) {
        setEditError('Could not read the current stock. Check your connection and try again.');
        setEditLoading(false);
        return;
      }
      base.product = stockNumber(data.quantity);
    }

    applyStock(product.id, base);
    setEditBase(base);
    setEditDraft(Object.fromEntries(Object.entries(base).map(([key, value]) => [key, String(value)])));
    setEditLoading(false);
  };

  const saveStock = async (product: InventoryProduct) => {
    if (savingStock) return;
    const keys = Object.keys(editBase);
    const invalid = keys.some((key) => !/^\d+$/.test((editDraft[key] ?? '').trim()));
    if (invalid) {
      setEditError('Stock must be a whole number, 0 or more.');
      return;
    }
    const changed = keys.filter((key) => Number(editDraft[key]) !== editBase[key]);
    if (changed.length === 0) {
      closeEditor();
      return;
    }

    setSavingStock(true);
    setEditError(null);
    let problem: string | null = null;

    if (product.variants.length === 0) {
      const quantity = Number(editDraft.product);
      const { error } = await supabase.from('products').update({ quantity }).eq('id', product.id);
      if (error) {
        problem = `Stock was not saved: ${error.message}`;
      } else {
        applyStock(product.id, { product: quantity });
      }
    } else {
      for (const variantId of changed) {
        const { error } = await supabase
          .from('product_variants')
          .update({ quantity: Number(editDraft[variantId]) })
          .eq('id', variantId);
        if (error) {
          const label = product.variants.find((v) => v.id === variantId)?.label || 'a variant';
          problem = `Stock for "${label}" was not saved: ${error.message}. Changes above it in the list were saved.`;
          break;
        }
      }

      // The product's own stock is the total of its variants. Add it up from
      // what is saved now, whether or not every change went through.
      const { data: saved, error: readError } = await supabase
        .from('product_variants')
        .select('id, quantity')
        .eq('product_id', product.id);
      if (readError || !saved) {
        problem = problem || 'Variant stock was saved, but the product total was not updated. Open the editor and save again.';
      } else {
        const total = saved.reduce((sum: number, row: any) => sum + stockNumber(row.quantity), 0);
        const { error: totalError } = await supabase.from('products').update({ quantity: total }).eq('id', product.id);
        if (totalError) {
          problem = problem || `Variant stock was saved, but the product total was not updated: ${totalError.message}. Open the editor and save again.`;
        }
        const fresh: Record<string, number> = {};
        saved.forEach((row: any) => { fresh[row.id] = stockNumber(row.quantity); });
        applyStock(product.id, fresh);
        // Keep the editor in step with what is saved, in case it stays open on an error
        setEditBase((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((key) => { if (fresh[key] !== undefined) next[key] = fresh[key]; });
          return next;
        });
      }
    }

    setSavingStock(false);
    if (problem) {
      setEditError(problem);
    } else {
      closeEditor();
    }
  };

  // ---- Export ---------------------------------------------------------------

  // Exports what is on screen (after search and the stock filter): one line per
  // variant, or one line for a product without variants.
  const handleExportCSV = () => {
    const header = ['Product', 'Variant', 'SKU', 'Category', 'Stock', 'Cedi price (GHS)', 'Retail value (GHS)', 'Status'];
    const lines: unknown[][] = [];
    for (const product of filteredProducts) {
      const status = STATUS_LABELS[product.status] || product.status;
      if (product.variants.length === 0) {
        lines.push([
          product.name, '', product.sku === 'N/A' ? '' : product.sku, product.category, product.quantity,
          product.priceGhs !== null ? product.priceGhs.toFixed(2) : '',
          product.priceGhs !== null ? (product.quantity * product.priceGhs).toFixed(2) : '',
          status
        ]);
      } else {
        for (const variant of product.variants) {
          lines.push([
            product.name, variant.label, variant.sku || (product.sku === 'N/A' ? '' : product.sku), product.category, variant.stock,
            variant.priceGhs !== null ? variant.priceGhs.toFixed(2) : '',
            variant.priceGhs !== null ? (variant.stock * variant.priceGhs).toFixed(2) : '',
            status
          ]);
        }
      }
    }

    const csvContent = [header, ...lines].map(row => row.map(csvField).join(',')).join('\r\n');
    // The leading mark lets Excel read names with accents or symbols correctly
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Inventory Management</h1>
            <p className="text-gray-600 mt-1 md:mt-2 text-sm md:text-base">Check stock levels, correct them, and export a stock list</p>
          </div>
          <Link
            href="/admin"
            className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap text-center"
          >
            Back to Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Products</p>
                <p className="text-3xl font-bold text-gray-900">{products.length}</p>
              </div>
              <div className="w-12 h-12 flex items-center justify-center bg-blue-100 rounded-lg">
                <i className="ri-stack-line text-2xl text-blue-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Low Stock Items</p>
                <p className="text-3xl font-bold text-amber-600">{lowStockCount}</p>
              </div>
              <div className="w-12 h-12 flex items-center justify-center bg-amber-100 rounded-lg">
                <i className="ri-alert-line text-2xl text-amber-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Out of Stock</p>
                <p className="text-3xl font-bold text-red-600">{outOfStockCount}</p>
              </div>
              <div className="w-12 h-12 flex items-center justify-center bg-red-100 rounded-lg">
                <i className="ri-close-circle-line text-2xl text-red-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Retail Value</p>
                <p className="text-3xl font-bold text-blue-600">GH₵{totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                <p className="text-xs text-gray-500 mt-1">Stock × cedi price</p>
                {leftOutCount > 0 && (
                  <p className="text-xs font-semibold text-amber-600 mt-1">
                    {leftOutCount} product{leftOutCount !== 1 ? 's' : ''} with no cedi price left out
                  </p>
                )}
              </div>
              <div className="w-12 h-12 flex items-center justify-center bg-blue-100 rounded-lg">
                <i className="ri-money-dollar-circle-line text-2xl text-blue-600"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl flex items-center justify-center"></i>
                <input
                  type="text"
                  placeholder="Search by product name or SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
                {['all', 'low', 'out', 'good'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setStockFilter(filter)}
                    className={`px-4 py-2 rounded-md font-medium text-sm transition-colors whitespace-nowrap cursor-pointer ${stockFilter === filter
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    {filter === 'all' && 'All'}
                    {filter === 'low' && 'Low Stock'}
                    {filter === 'out' && 'Out (0)'}
                    {filter === 'good' && 'In Stock'}
                  </button>
                ))}
              </div>

              <button
                onClick={handleExportCSV}
                disabled={loading || filteredProducts.length === 0}
                title="Download the products shown below as a CSV file"
                className="border-2 border-gray-300 hover:border-gray-400 text-gray-700 px-4 py-3 rounded-lg font-semibold transition-colors flex items-center space-x-2 whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="ri-download-line"></i>
                <span>Export CSV</span>
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Product</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">SKU</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Category</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Stock</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Retail Value</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr><td colSpan={7} className="p-10 text-center text-gray-500">Loading inventory...</td></tr>
                ) : loadError ? (
                  <tr>
                    <td colSpan={7} className="p-10 text-center">
                      <p className="text-gray-700 font-medium">{loadError}</p>
                      <button
                        type="button"
                        onClick={fetchInventory}
                        className="mt-4 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold cursor-pointer"
                      >
                        Try again
                      </button>
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr><td colSpan={7} className="p-10 text-center text-gray-500">No products found.</td></tr>
                ) : (
                  filteredProducts.map((product) => (
                    <Fragment key={product.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-gray-900">{product.name}</p>
                          {product.variants.length > 0 && (
                            <p className="text-sm text-gray-500">
                              {product.variants.length} variant{product.variants.length !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-700">{product.sku}</td>
                      <td className="px-6 py-4 text-gray-700">{product.category}</td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-gray-900">{product.currentStock}</span>
                      </td>
                      <td className="px-6 py-4">
                        {product.unpriced === 'none' ? (
                          <span className="text-sm font-semibold text-amber-600 whitespace-nowrap">No cedi price</span>
                        ) : (
                          <div>
                            <span className="font-semibold text-gray-900 whitespace-nowrap">
                              {formatMoney(product.value, 'GHS')}
                            </span>
                            {product.unpriced === 'some' && (
                              <p className="text-xs font-semibold text-amber-600">Some variants have no cedi price</p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {product.status === 'good' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700 whitespace-nowrap">
                            <i className="ri-checkbox-circle-fill mr-1"></i>
                            In Stock
                          </span>
                        )}
                        {product.status === 'low' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-700 whitespace-nowrap">
                            <i className="ri-alert-fill mr-1"></i>
                            Low Stock
                          </span>
                        )}
                        {product.status === 'out' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700 whitespace-nowrap">
                            <i className="ri-close-circle-fill mr-1"></i>
                            Out of Stock
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => (editingId === product.id ? closeEditor() : openEditor(product))}
                            disabled={savingStock || editLoading}
                            aria-expanded={editingId === product.id}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${editingId === product.id ? 'text-blue-700 bg-blue-50' : 'text-gray-600 hover:text-blue-700'}`}
                            title="Edit stock"
                            aria-label={`Edit stock for ${product.name}`}
                          >
                            <i className="ri-edit-line text-lg"></i>
                          </button>
                          <Link
                            href={`/admin/products/${product.id}`}
                            className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-blue-700 transition-colors cursor-pointer"
                            title="Open product"
                            aria-label={`Open ${product.name}`}
                          >
                            <i className="ri-eye-line text-lg"></i>
                          </Link>
                        </div>
                      </td>
                    </tr>
                    {editingId === product.id && (
                      <tr className="bg-gray-50">
                        <td colSpan={7} className="px-6 py-4">
                          {editError && (
                            <div role="alert" className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                              {editError}
                            </div>
                          )}
                          {editLoading ? (
                            <p className="text-sm text-gray-500">Reading current stock...</p>
                          ) : Object.keys(editBase).length === 0 ? (
                            <button
                              type="button"
                              onClick={closeEditor}
                              className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:border-gray-400 transition-colors cursor-pointer"
                            >
                              Close
                            </button>
                          ) : (
                            <div className="space-y-3">
                              <p className="text-sm font-semibold text-gray-900">
                                {product.variants.length > 0
                                  ? 'Stock for each variant. The product total is added up for you.'
                                  : 'Stock on hand'}
                              </p>
                              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                {(product.variants.length > 0
                                  ? product.variants.map((v) => ({ key: v.id, label: v.label }))
                                  : [{ key: 'product', label: product.name }]
                                ).map((line) => (
                                  <label key={line.key} className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2">
                                    <span className="text-sm text-gray-900 min-w-0 truncate">{line.label}</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      inputMode="numeric"
                                      value={editDraft[line.key] ?? ''}
                                      onChange={(e) => setEditDraft((prev) => ({ ...prev, [line.key]: e.target.value }))}
                                      disabled={savingStock}
                                      className="w-24 px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                  </label>
                                ))}
                              </div>
                              <div className="flex items-center space-x-3">
                                <button
                                  type="button"
                                  onClick={() => saveStock(product)}
                                  disabled={savingStock}
                                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  {savingStock ? 'Saving...' : 'Save stock'}
                                </button>
                                <button
                                  type="button"
                                  onClick={closeEditor}
                                  disabled={savingStock}
                                  className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:border-gray-400 transition-colors cursor-pointer disabled:opacity-60"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
