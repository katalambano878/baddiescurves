'use client';
/* eslint-disable react-hooks/exhaustive-deps */

import { formatMoney } from '@/lib/format-money';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

/** A price greater than 0, or null when none is set. */
function realPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The prices shoppers are charged, per currency. A product with variants is read
 * from its variants (cheapest one, as the shop lists it); a variant without its
 * own price uses the product's. Cedis and dollars are separate prices and are
 * never worked out from each other.
 */
function shopPrices(product: any) {
  const variants: any[] = Array.isArray(product.product_variants) ? product.product_variants : [];
  if (variants.length === 0) {
    return { ghs: realPrice(product.price_ghs), usd: realPrice(product.price), from: { ghs: false, usd: false } };
  }
  const ghsPrices = variants.map((v) => realPrice(v.price_ghs) ?? realPrice(product.price_ghs)).filter((p): p is number => p !== null);
  const usdPrices = variants.map((v) => realPrice(v.price) ?? realPrice(product.price)).filter((p): p is number => p !== null);
  return {
    ghs: ghsPrices.length ? Math.min(...ghsPrices) : null,
    usd: usdPrices.length ? Math.min(...usdPrices) : null,
    // "From" when the variants do not all cost the same
    from: {
      ghs: ghsPrices.length > 0 && Math.min(...ghsPrices) !== Math.max(...ghsPrices),
      usd: usdPrices.length > 0 && Math.min(...usdPrices) !== Math.max(...usdPrices)
    }
  };
}

/** 'out' at 0, 'low' at or under the product's low-stock threshold, else 'in'. */
function stockLevel(product: any): 'out' | 'low' | 'in' {
  const stock = Number(product.quantity) || 0;
  if (stock <= 0) return 'out';
  return stock <= (Number(product.metadata?.low_stock_threshold) || 5) ? 'low' : 'in';
}

export default function ProductsPage() {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortBy, setSortBy] = useState('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStock, setFilterStock] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [deleting, setDeleting] = useState(false);

  // Statistics, always worked out from the products on the page
  const stats = {
    total: products.length,
    lowStock: products.filter((p) => stockLevel(p) === 'low').length,
    outOfStock: products.filter((p) => stockLevel(p) === 'out').length,
    active: products.filter((p) => p.status === 'active').length
  };

  const statusColors: any = {
    'active': 'bg-blue-100 text-blue-700',
    'draft': 'bg-gray-100 text-gray-700',
    'archived': 'bg-amber-100 text-amber-700',
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, [sortBy]);

  // The dashboard links here with ?filter=low-stock
  useEffect(() => {
    const filter = new URLSearchParams(window.location.search).get('filter');
    if (filter === 'low-stock') {
      setFilterStock('low');
      setShowFilters(true);
    } else if (filter === 'out-of-stock') {
      setFilterStock('out');
      setShowFilters(true);
    }
  }, []);

  const fetchCategories = async () => {
    const { data } = await supabase.from('categories').select('name').order('name');
    if (data) setCategories(data);
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setFetchError(null);
      let query = supabase
        .from('products')
        .select(`
          id,
          name,
          sku,
          price,
          price_ghs,
          quantity,
          status,
          rating_avg,
          metadata,
          created_at,
          categories(name),
          product_variants(id, price, price_ghs),
          product_images(url, position)
        `);

      // Apply sorting
      if (sortBy === 'newest') query = query.order('created_at', { ascending: false });
      if (sortBy === 'price_asc') query = query.order('price', { ascending: true });
      if (sortBy === 'price_desc') query = query.order('price', { ascending: false });
      if (sortBy === 'name') query = query.order('name', { ascending: true });
      if (sortBy === 'stock') query = query.order('quantity', { ascending: true });

      const { data, error } = await query;

      if (error) throw error;

      if (data) {
        const categoryName = (p: any) => {
          const cat = p.categories;
          if (Array.isArray(cat)) return cat[0]?.name || 'Uncategorized';
          return cat?.name || 'Uncategorized';
        };

        // Transform data for UI
        const transformedProducts = data.map((p: any) => ({
          ...p,
          category: categoryName(p),
          image: p.product_images?.find((img: any) => img.position === 0)?.url
            || p.product_images?.[0]?.url
            || '/placeholder-product.svg',
          variantsCount: Array.isArray(p.product_variants) ? p.product_variants.length : 0,
          stock: p.quantity,
          sales: 0, // Placeholder for now
          rating: p.rating_avg || 0
        }));

        setProducts(transformedProducts);
      }
    } catch (error: any) {
      console.error('Error fetching products:', error);
      setFetchError(error?.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  // The rows on screen: search plus the Filters panel (category, status, stock level)
  const filteredProducts = products.filter(product => {
    const term = searchQuery.trim().toLowerCase();
    const matchesSearch = !term ||
      (product.name || '').toLowerCase().includes(term) ||
      (product.sku && product.sku.toLowerCase().includes(term)) ||
      (product.category && product.category.toLowerCase().includes(term));
    const matchesCategory = !filterCategory || product.category === filterCategory;
    const matchesStatus = !filterStatus || product.status === filterStatus;
    const matchesStock = !filterStock || stockLevel(product) === filterStock;
    return matchesSearch && matchesCategory && matchesStatus && matchesStock;
  });

  const activeFilterCount = [filterCategory, filterStatus, filterStock].filter(Boolean).length;

  const clearFilters = () => {
    setFilterCategory('');
    setFilterStatus('');
    setFilterStock('');
  };

  // Selection only ever counts rows that are on screen, so a bulk action can
  // never touch a product hidden by the search or the filters.
  const visibleIds = filteredProducts.map((p) => p.id);
  const selectedVisible = selectedProducts.filter((id) => visibleIds.includes(id));
  const allVisibleSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;

  const handleSelectAll = () => {
    setSelectedProducts(allVisibleSelected ? [] : visibleIds);
  };

  const handleSelectProduct = (productId: string) => {
    if (selectedProducts.includes(productId)) {
      setSelectedProducts(selectedProducts.filter(id => id !== productId));
    } else {
      setSelectedProducts([...selectedProducts, productId]);
    }
  };

  // Deletes one product and everything that hangs off it. Stops at the first
  // step that fails and returns its message; returns null when the product is gone.
  const deleteProductRows = async (productId: string): Promise<string | null> => {
    // Unlink from order_items so we can delete (order history keeps product_name/sku/price)
    const unlink = await supabase.from('order_items').update({ product_id: null, variant_id: null }).eq('product_id', productId);
    if (unlink.error) return unlink.error.message;
    // Delete in dependency order: review_images → reviews → cart_items → wishlist_items → product_images → product_variants → products
    const reviews = await supabase.from('reviews').select('id').eq('product_id', productId);
    if (reviews.error) return reviews.error.message;
    if (reviews.data?.length) {
      const ids = reviews.data.map((r: any) => r.id);
      const reviewImages = await supabase.from('review_images').delete().in('review_id', ids);
      if (reviewImages.error) return reviewImages.error.message;
      const reviewRows = await supabase.from('reviews').delete().eq('product_id', productId);
      if (reviewRows.error) return reviewRows.error.message;
    }
    for (const table of ['cart_items', 'wishlist_items', 'product_images', 'product_variants']) {
      const { error } = await supabase.from(table).delete().eq('product_id', productId);
      if (error) return error.message;
    }
    const { error } = await supabase.from('products').delete().eq('id', productId);
    return error ? error.message : null;
  };

  const handleDeleteProduct = async (productId: string) => {
    if (deleting) return;
    const name = products.find((p) => p.id === productId)?.name || 'this product';
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(true);
    const problem = await deleteProductRows(productId);
    setDeleting(false);
    if (problem) {
      alert(`"${name}" was not deleted: ${problem}`);
      return;
    }
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    setSelectedProducts((prev) => prev.filter((id) => id !== productId));
  };

  const handleBulkDelete = async () => {
    if (deleting) return;
    const ids = selectedVisible;
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} product${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setDeleting(true);
    const deleted: string[] = [];
    const failed: string[] = [];
    for (const productId of ids) {
      const problem = await deleteProductRows(productId);
      if (problem) {
        failed.push(products.find((p) => p.id === productId)?.name || productId.slice(0, 8));
      } else {
        deleted.push(productId);
      }
    }
    setDeleting(false);
    // Only the rows that really were deleted leave the list; the rest stay selected
    setProducts((prev) => prev.filter((p) => !deleted.includes(p.id)));
    setSelectedProducts((prev) => prev.filter((id) => !deleted.includes(id)));
    if (failed.length) {
      alert(`Deleted ${deleted.length}. Not deleted: ${failed.join(', ')}. They are still in the list; try again.`);
    } else {
      alert(`Deleted ${deleted.length} product${deleted.length !== 1 ? 's' : ''}.`);
    }
  };

  // Cedi price with the dollar price under it; a missing price is called out in amber
  const renderPrices = (product: any) => {
    const prices = shopPrices(product);
    return (
      <div className="whitespace-nowrap">
        {prices.ghs !== null ? (
          <p className="font-semibold text-gray-900">
            {prices.from.ghs ? 'From ' : ''}{formatMoney(prices.ghs, 'GHS')}
          </p>
        ) : (
          <p className="text-sm font-semibold text-amber-600">No cedi price</p>
        )}
        {prices.usd !== null ? (
          <p className="text-xs text-gray-500">
            {prices.from.usd ? 'From ' : ''}{formatMoney(prices.usd, 'USD')}
          </p>
        ) : (
          <p className="text-xs font-semibold text-amber-600">No dollar price</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-600 mt-1">Manage your product catalog and inventory</p>
        </div>
        <Link
          href="/admin/products/new"
          className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center md:items-start"
        >
          <i className="ri-add-line mr-2"></i>
          Add Product
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Products</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Active</p>
          <p className="text-2xl font-bold text-blue-700">{stats.active}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Low Stock</p>
          <p className="text-2xl font-bold text-amber-700">{stats.lowStock}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Out of Stock</p>
          <p className="text-2xl font-bold text-red-700">{stats.outOfStock}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg w-5 h-5 flex items-center justify-center"></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products by name, SKU, or category..."
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 transition-colors font-medium whitespace-nowrap cursor-pointer"
              >
                <i className="ri-filter-line mr-2"></i>
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full">{activeFilterCount}</span>
                )}
              </button>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium cursor-pointer"
              >
                <option value="newest">Newest First</option>
                <option value="name">Sort by Name</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="stock">Sort by Stock</option>
              </select>
              <div className="flex border-2 border-gray-300 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('list')}
                  className={`w-10 h-10 flex items-center justify-center transition-colors cursor-pointer ${viewMode === 'list' ? 'bg-blue-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  <i className="ri-list-check text-xl w-5 h-5 flex items-center justify-center"></i>
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`w-10 h-10 flex items-center justify-center border-l-2 border-gray-300 transition-colors cursor-pointer ${viewMode === 'grid' ? 'bg-blue-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  <i className="ri-grid-line text-xl w-5 h-5 flex items-center justify-center"></i>
                </button>
              </div>
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg grid md:grid-cols-4 gap-4">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                aria-label="Filter by category"
                className="px-3 py-2 pr-8 border-2 border-gray-300 rounded-lg text-sm cursor-pointer"
              >
                <option value="">All Categories</option>
                {categories.map((cat: any) => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
                <option value="Uncategorized">Uncategorized</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                aria-label="Filter by status"
                className="px-3 py-2 pr-8 border-2 border-gray-300 rounded-lg text-sm cursor-pointer"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
              <select
                value={filterStock}
                onChange={(e) => setFilterStock(e.target.value)}
                aria-label="Filter by stock level"
                className="px-3 py-2 pr-8 border-2 border-gray-300 rounded-lg text-sm cursor-pointer"
              >
                <option value="">All Stock Levels</option>
                <option value="in">In Stock</option>
                <option value="low">Low Stock</option>
                <option value="out">Out of Stock</option>
              </select>
              <button
                type="button"
                onClick={clearFilters}
                disabled={activeFilterCount === 0}
                className="px-3 py-2 border-2 border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:border-gray-400 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        {selectedVisible.length > 0 && (
          <div className="p-4 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
            <p className="text-blue-800 font-semibold">
              {selectedVisible.length} product{selectedVisible.length > 1 ? 's' : ''} selected
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        )}

        {fetchError ? (
          <div className="p-12 text-center">
            <i className="ri-error-warning-line text-4xl mb-4 text-red-500 inline-block"></i>
            <p className="text-lg text-gray-900 font-semibold">Could not load products</p>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{fetchError}</p>
            <button
              type="button"
              onClick={fetchProducts}
              className="mt-4 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="p-12 text-center text-gray-500">
            <i className="ri-loader-4-line animate-spin text-3xl mb-2 inline-block"></i>
            <p>Loading products...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <i className="ri-inbox-line text-4xl mb-4 text-gray-300 inline-block"></i>
            <p className="text-lg">No products found</p>
            <p className="text-sm text-gray-400 mt-1">Try adjusting your search or filters</p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-4 px-6">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={handleSelectAll}
                      aria-label="Select all products shown"
                      className="w-4 h-4 text-blue-700 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Product</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">SKU</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Category</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Price</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Stock</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(product.id)}
                        onChange={() => handleSelectProduct(product.id)}
                        className="w-4 h-4 text-blue-700 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{product.name || <span className="text-amber-600">No name</span>}</p>
                          <div className="flex items-center mt-1">
                            <span className="text-xs text-gray-400">ID: {product.id.substring(0, 8)}...</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-700 text-sm font-mono">{product.sku || '-'}</td>
                    <td className="py-4 px-4 text-gray-700 text-sm">{product.category}</td>
                    <td className="py-4 px-4">{renderPrices(product)}</td>
                    <td className="py-4 px-4 text-gray-700">
                      {product.stock}
                      {stockLevel(product) === 'low' && (
                        <span className="ml-2 w-2 h-2 rounded-full bg-amber-500 inline-block" title="Low Stock"></span>
                      )}
                      {stockLevel(product) === 'out' && (
                        <span className="ml-2 w-2 h-2 rounded-full bg-red-500 inline-block" title="Out of Stock"></span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap capitalize ${statusColors[product.status] || 'bg-gray-100 text-gray-600'}`}>
                        {product.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2">
                        <Link
                          href={`/admin/products/${product.id}`}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <i className="ri-edit-line text-lg"></i>
                        </Link>
                        <button
                          onClick={() => handleDeleteProduct(product.id)}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <i className="ri-delete-bin-line text-lg"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((product) => (
              <div key={product.id} className="border-2 border-gray-200 rounded-xl p-4 hover:shadow-lg transition-shadow">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={selectedProducts.includes(product.id)}
                    onChange={() => handleSelectProduct(product.id)}
                    className="absolute top-2 left-2 w-5 h-5 text-blue-700 border-gray-300 rounded focus:ring-blue-500 cursor-pointer z-10"
                  />
                  <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden mb-3 border border-gray-200">
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                  </div>
                </div>
                <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold mb-2 capitalize ${statusColors[product.status] || 'bg-gray-100 text-gray-600'}`}>
                  {product.status}
                </span>
                <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">{product.name}</h3>
                <p className="text-sm text-gray-600 mb-2">{product.category}</p>
                <div className="flex items-center justify-between mb-3">
                  {renderPrices(product)}
                </div>
                <div className="flex items-center justify-between text-sm text-gray-600 mb-3 pb-3 border-b border-gray-200">
                  <span>Stock: {product.stock}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Link
                    href={`/admin/products/${product.id}`}
                    className="flex-1 bg-blue-700 hover:bg-blue-800 text-white py-2 rounded-lg text-sm font-medium text-center transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDeleteProduct(product.id)}
                    className="w-9 h-9 flex items-center justify-center border-2 border-gray-300 text-gray-700 hover:border-red-600 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                  >
                    <i className="ri-delete-bin-line"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="p-6 border-t border-gray-200 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {filteredProducts.length === 0 ? 'No products' : `Showing ${filteredProducts.length} product${filteredProducts.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>
    </div>
  );
}
