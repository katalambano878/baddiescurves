'use client';

import { money } from '@/lib/format-money';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { fetchJsonWithTimeout } from '@/lib/with-timeout';

const RevenueChart = dynamic(() => import('@/components/admin/RevenueChart'), {
  ssr: false,
  loading: () => (
    <div className="h-80 w-full flex items-center justify-center text-sm text-gray-400">
      Loading chart...
    </div>
  ),
});

type SectionStatus = { ok: boolean; ms?: number; error?: string };

export default function AdminDashboard() {
  const [dateRange, setDateRange] = useState('7days');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [sections, setSections] = useState<Record<string, SectionStatus>>({});

  const [stats, setStats] = useState([
    {
      title: 'Total Revenue',
      value: 'GH₵ 0.00',
      change: '0%',
      trend: 'up',
      icon: 'ri-money-dollar-circle-line',
      color: 'blue',
    },
    {
      title: 'Orders',
      value: '0',
      change: '0%',
      trend: 'up',
      icon: 'ri-shopping-bag-line',
      color: 'blue',
    },
    {
      title: 'Customers',
      value: '0',
      change: '0%',
      trend: 'up',
      icon: 'ri-group-line',
      color: 'purple',
    },
    {
      title: 'Avg Order Value',
      value: 'GH₵ 0.00',
      change: '0%',
      trend: 'up',
      icon: 'ri-line-chart-line',
      color: 'amber',
    },
  ]);

  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  const loadDashboard = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Session expired. Please log in again.');
        return;
      }

      const result = await fetchJsonWithTimeout<{
        success: boolean;
        degraded?: boolean;
        sections?: Record<string, SectionStatus>;
        data?: any;
        error?: { message?: string };
      }>('/api/admin/dashboard', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          Accept: 'application/json',
        },
        timeoutMs: 20_000,
        signal,
      });

      if (!result.ok || !result.data?.success) {
        setError(
          result.data?.error?.message ||
            result.error ||
            `Dashboard failed (${result.status || 'network'})`
        );
        return;
      }

      const payload = result.data.data || {};
      const s = payload.stats || {};
      setDegraded(!!result.data.degraded);
      setSections(result.data.sections || {});
      setChartData(payload.chartData || []);

      setStats([
        {
          title: 'Total Revenue',
          value: `GH₵ ${money(s.totalRevenue || 0)}`,
          change: '+0%',
          trend: 'up',
          icon: 'ri-money-dollar-circle-line',
          color: 'blue',
        },
        {
          title: 'Orders',
          value: String(s.totalOrders || 0),
          change: '+0%',
          trend: 'up',
          icon: 'ri-shopping-bag-line',
          color: 'blue',
        },
        {
          title: 'Customers (Active)',
          value: String(s.uniqueCustomers || 0),
          change: '+0%',
          trend: 'up',
          icon: 'ri-group-line',
          color: 'purple',
        },
        {
          title: 'Avg Order Value',
          value: `GH₵ ${money(s.avgOrderValue || 0)}`,
          change: '+0%',
          trend: 'up',
          icon: 'ri-line-chart-line',
          color: 'amber',
        },
      ]);

      const formattedRecent = (payload.recentOrders || []).map((o: any) => {
        const addr = o.shipping_address || {};
        const customerName =
          addr.firstName && addr.lastName
            ? `${addr.firstName.trim()} ${addr.lastName.trim()}`
            : addr.full_name || addr.firstName || String(o.email || '').split('@')[0];
        return {
          id: o.id,
          displayId: o.order_number,
          customer: customerName,
          email: o.email,
          date: new Date(o.created_at).toLocaleDateString(),
          total: o.total,
          status: o.status,
          items: 1,
        };
      });
      setRecentOrders(formattedRecent);

      setLowStockProducts(
        (payload.lowStockProducts || []).map((p: any) => ({
          name: p.name,
          stock: p.quantity,
          status: p.quantity === 0 ? 'critical' : 'low',
        }))
      );

      setTopProducts(
        (payload.topProducts || []).map((p: any) => ({
          id: p.slug || p.id,
          name: p.name,
          image: p.product_images?.[0]?.url || 'https://via.placeholder.com/200',
          sales: 0,
          revenue: 0,
          stock: p.quantity,
        }))
      );
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError') return;
      setError(err?.message || 'Failed to load dashboard');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadDashboard(controller.signal);
    return () => controller.abort();
  }, [loadDashboard]);

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    processing: 'bg-blue-100 text-blue-700',
    shipped: 'bg-purple-100 text-purple-700',
    delivered: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500 flex flex-col items-center gap-2">
        <i className="ri-loader-4-line animate-spin text-2xl text-blue-700" />
        <p>Loading Dashboard...</p>
        <p className="text-xs text-gray-400">Fetching store statistics</p>
      </div>
    );
  }

  if (error && !degraded && recentOrders.length === 0 && chartData.length === 0) {
    return (
      <div className="max-w-lg mx-auto mt-16 bg-white border border-red-100 rounded-xl p-6 text-center">
        <i className="ri-error-warning-line text-3xl text-red-600 mb-3" />
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Dashboard failed to load</h1>
        <p className="text-sm text-gray-600 mb-4">{error}</p>
        <button
          type="button"
          onClick={() => loadDashboard()}
          className="px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-1">
              Welcome back! Here&apos;s what&apos;s happening with your store.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadDashboard()}
            className="text-sm font-semibold text-blue-700 hover:text-blue-800"
          >
            Refresh
          </button>
        </div>

        {(error || degraded) && (
          <div className="mb-6 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm">
            {error
              ? `Partial load: ${error}`
              : 'Some dashboard sections timed out or failed. Showing available data.'}
            {Object.keys(sections).length > 0 && (
              <ul className="mt-2 text-xs text-amber-800 list-disc pl-5">
                {Object.entries(sections)
                  .filter(([, s]) => !s.ok)
                  .map(([name, s]) => (
                    <li key={name}>
                      {name}: {s.error || 'failed'}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => (
            <div
              key={stat.title}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className={`w-12 h-12 flex items-center justify-center bg-${stat.color}-100 text-${stat.color}-700 rounded-lg`}
                >
                  <i className={`${stat.icon} text-2xl`}></i>
                </div>
                <span className="text-sm font-semibold text-blue-700">{stat.change}</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</h3>
              <p className="text-gray-600 text-sm">{stat.title}</p>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Revenue Trend</h2>
              <select
                className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
              >
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
              </select>
            </div>
            <RevenueChart data={chartData} />
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <Link
                href="/admin/products/new"
                className="flex items-center justify-between p-4 bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-700 rounded-lg transition-colors group"
              >
                <div className="flex items-center font-medium">
                  <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center mr-3 group-hover:bg-blue-100 transition-colors shadow-sm">
                    <i className="ri-add-line"></i>
                  </span>
                  Add Product
                </div>
                <i className="ri-arrow-right-line"></i>
              </Link>
              <Link
                href="/admin/pos"
                className="flex items-center justify-between p-4 bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-700 rounded-lg transition-colors group"
              >
                <div className="flex items-center font-medium">
                  <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center mr-3 group-hover:bg-blue-100 transition-colors shadow-sm">
                    <i className="ri-computer-line"></i>
                  </span>
                  Open POS
                </div>
                <i className="ri-arrow-right-line"></i>
              </Link>
              <Link
                href="/admin/orders"
                className="flex items-center justify-between p-4 bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-700 rounded-lg transition-colors group"
              >
                <div className="flex items-center font-medium">
                  <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center mr-3 group-hover:bg-blue-100 transition-colors shadow-sm">
                    <i className="ri-file-list-line"></i>
                  </span>
                  Manage Orders
                </div>
                <i className="ri-arrow-right-line"></i>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Recent Orders</h2>
              <Link
                href="/admin/orders"
                className="text-blue-700 hover:text-blue-800 font-medium text-sm whitespace-nowrap cursor-pointer"
              >
                View All <i className="ri-arrow-right-line ml-1"></i>
              </Link>
            </div>

            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              {sections.recent_orders && !sections.recent_orders.ok ? (
                <p className="text-amber-700 text-center py-4 text-sm">
                  Recent orders unavailable. {sections.recent_orders.error}
                </p>
              ) : recentOrders.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No recent orders.</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Order ID
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Customer
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Date</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Total
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <td className="py-4 px-4">
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="text-blue-700 hover:text-blue-800 font-medium whitespace-nowrap cursor-pointer"
                          >
                            {order.displayId}
                          </Link>
                        </td>
                        <td className="py-4 px-4">
                          <p className="font-medium text-gray-900 whitespace-nowrap">
                            {order.customer}
                          </p>
                          <p className="text-sm text-gray-500">{order.email}</p>
                        </td>
                        <td className="py-4 px-4 text-gray-700 whitespace-nowrap">{order.date}</td>
                        <td className="py-4 px-4 font-semibold text-gray-900 whitespace-nowrap">
                          GH₵ {money(order.total)}
                        </td>
                        <td className="py-4 px-4">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusColors[order.status] || 'bg-gray-100'}`}
                          >
                            {order.status === 'shipped'
                              ? 'Packaged'
                              : order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Low Stock Alert</h2>
              {sections.low_stock && !sections.low_stock.ok ? (
                <p className="text-amber-700 text-sm">Low-stock section unavailable.</p>
              ) : lowStockProducts.length === 0 ? (
                <p className="text-gray-500">Inventory looks good!</p>
              ) : (
                <div className="space-y-3">
                  {lowStockProducts.map((product, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 text-sm truncate pr-2">
                          {product.name}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">Stock: {product.stock} units</p>
                      </div>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                          product.status === 'critical'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {product.status === 'critical' ? 'Critical' : 'Low'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <Link
                href="/admin/products?filter=low-stock"
                className="block text-center mt-4 text-blue-700 hover:text-blue-800 font-medium text-sm whitespace-nowrap cursor-pointer"
              >
                View All Products <i className="ri-arrow-right-line ml-1"></i>
              </Link>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Products</h2>
            <Link
              href="/admin/products"
              className="text-blue-700 hover:text-blue-800 font-medium text-sm whitespace-nowrap cursor-pointer"
            >
              View All <i className="ri-arrow-right-line ml-1"></i>
            </Link>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {topProducts.map((product) => (
              <div
                key={product.id}
                className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
              >
                <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden mb-3">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{product.name}</h3>
                <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-sm text-gray-600">Stock: {product.stock}</span>
                  <Link
                    href={`/admin/products/${product.id}`}
                    className="text-blue-700 hover:text-blue-800 text-sm font-medium whitespace-nowrap cursor-pointer"
                  >
                    Edit <i className="ri-arrow-right-line ml-1"></i>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
