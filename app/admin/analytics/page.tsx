'use client';
/* eslint-disable react-hooks/exhaustive-deps */

import { asNumber, formatMoney, normalizeCurrency } from '@/lib/format-money';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { PieChart, Pie, AreaChart, Area, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { downloadCsv } from '../orders/csv';

type CurrencyCode = 'GHS' | 'USD';

interface CurrencyReport {
  revenue: number;
  orders: number;
  aov: number;
  salesData: { date: string; sales: number; orders: number }[];
  categoryRevenue: { name: string; value: number }[];
  topProducts: { name: string; revenue: number; units: number }[];
}

const EMPTY_REPORT: CurrencyReport = {
  revenue: 0,
  orders: 0,
  aov: 0,
  salesData: [],
  categoryRevenue: [],
  topProducts: []
};

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState('30days');
  const [reportType, setReportType] = useState('overview');
  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [reports, setReports] = useState<Record<CurrencyCode, CurrencyReport>>({
    GHS: EMPTY_REPORT,
    USD: EMPTY_REPORT
  });
  // null until the admin uses the currency switch
  const [pickedCurrency, setPickedCurrency] = useState<CurrencyCode | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setLoadError(null);

      // Calculate start date based on timeRange
      const now = new Date();
      let startDate = new Date();
      if (timeRange === '7days') startDate.setDate(now.getDate() - 7);
      if (timeRange === '30days') startDate.setDate(now.getDate() - 30);
      if (timeRange === '90days') startDate.setDate(now.getDate() - 90);
      if (timeRange === 'year') startDate.setFullYear(now.getFullYear(), 0, 1);

      const isoStart = startDate.toISOString();

      // Fetch Orders for Revenue & Count - only PAID orders count as revenue
      const { data: orders, error: orderError } = await supabase
        .from('orders')
        .select('id, created_at, total, currency, payment_status')
        .gte('created_at', isoStart)
        .eq('payment_status', 'paid') // Only count paid orders as revenue
        .neq('status', 'cancelled')
        .order('created_at');

      if (orderError) throw orderError;

      // Order items for products & categories, fetched for the paid orders above.
      // Ids are sent in batches so a busy period cannot build an over-long request.
      const validItems: any[] = [];
      const orderIds = (orders || []).map(o => o.id);
      for (let i = 0; i < orderIds.length; i += 100) {
        const batch = orderIds.slice(i, i + 100);
        const { data: fetchedItems, error: itemFetchError } = await supabase
          .from('order_items')
          .select(`
            order_id,
            quantity,
            unit_price,
            total_price,
            product_id,
            product_name,
            products(name, category_id, categories(name))
          `)
          .in('order_id', batch);

        if (itemFetchError) {
          console.error('Error fetching order items:', itemFetchError);
          // Fallback without category embed
          const plain = await supabase
            .from('order_items')
            .select('order_id, quantity, unit_price, total_price, product_id, product_name')
            .in('order_id', batch);
          if (plain.data) validItems.push(...plain.data);
        } else if (fetchedItems) {
          validItems.push(...fetchedItems);
        }
      }

      // Every figure is worked out once per currency. Cedis and dollars are never added together.
      const currencyOfOrder = new Map<string, CurrencyCode>();
      (orders || []).forEach(o => currencyOfOrder.set(o.id, normalizeCurrency(o.currency)));

      const dayKey = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const buildReport = (currency: CurrencyCode): CurrencyReport => {
        const currencyOrders = (orders || []).filter(o => normalizeCurrency(o.currency) === currency);
        const currencyItems = validItems.filter(item => currencyOfOrder.get(item.order_id) === currency);

        const revenue = currencyOrders.reduce((sum, o) => sum + asNumber(o.total), 0);
        const orderCount = currencyOrders.length;

        // Sales chart: one point per day in the range, zero-filled
        const salesMap: Record<string, { date: string; sales: number; orders: number }> = {};
        const d = new Date(startDate);
        const today = new Date();
        while (d <= today) {
          const key = dayKey(d);
          salesMap[key] = { date: key, sales: 0, orders: 0 };
          d.setDate(d.getDate() + 1);
        }
        currencyOrders.forEach(o => {
          const key = dayKey(new Date(o.created_at));
          if (salesMap[key]) {
            salesMap[key].sales += asNumber(o.total);
            salesMap[key].orders += 1;
          }
        });

        // Revenue by category and top products
        const catMap: Record<string, { name: string; value: number }> = {};
        const prodMap: Record<string, { name: string; revenue: number; units: number }> = {};
        currencyItems.forEach(item => {
          // Use total_price if available, otherwise unit_price * quantity
          const itemRevenue = asNumber(item.total_price) || asNumber(item.unit_price) * asNumber(item.quantity);

          const cat = item.products?.categories;
          const catName = (Array.isArray(cat) ? cat[0]?.name : cat?.name) || 'Uncategorized';
          if (!catMap[catName]) catMap[catName] = { name: catName, value: 0 };
          catMap[catName].value += itemRevenue;

          const pName = item.products?.name || item.product_name || 'Unknown';
          if (!prodMap[pName]) prodMap[pName] = { name: pName, revenue: 0, units: 0 };
          prodMap[pName].revenue += itemRevenue;
          prodMap[pName].units += asNumber(item.quantity);
        });

        return {
          revenue,
          orders: orderCount,
          aov: orderCount > 0 ? revenue / orderCount : 0,
          salesData: Object.values(salesMap),
          categoryRevenue: Object.values(catMap),
          topProducts: Object.values(prodMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
        };
      };

      setReports({ GHS: buildReport('GHS'), USD: buildReport('USD') });

    } catch (err: any) {
      console.error('Error fetching analytics:', err);
      setLoadError(err?.message || 'Could not load analytics.');
    } finally {
      setLoading(false);
    }
  };

  // Show the currency the admin picked; until they pick, the one that has more paid orders.
  const currency: CurrencyCode =
    pickedCurrency ?? (reports.USD.orders > reports.GHS.orders ? 'USD' : 'GHS');
  const report = reports[currency];
  const otherCurrency: CurrencyCode = currency === 'USD' ? 'GHS' : 'USD';
  const otherReport = reports[otherCurrency];
  const { salesData, categoryRevenue, topProducts } = report;
  const currencySign = currency === 'USD' ? '$' : 'GH₵';
  const rangeLabel: Record<string, string> = {
    '7days': 'Last 7 days',
    '30days': 'Last 30 days',
    '90days': 'Last 90 days',
    year: 'This year'
  };

  // Exports the figures on screen: summary, daily sales, categories and top products.
  const handleExport = () => {
    const amount = (value: number) => value.toFixed(2);
    downloadCsv(
      `analytics-${currency.toLowerCase()}-${timeRange}.csv`,
      ['Section', 'Item', 'Amount', 'Currency', 'Count'],
      [
        ['Summary', `Total revenue (${rangeLabel[timeRange] || timeRange}, paid orders)`, amount(report.revenue), currency, ''],
        ['Summary', 'Paid orders', '', '', report.orders],
        ['Summary', 'Average order value', amount(report.aov), currency, ''],
        ...salesData.map(day => ['Daily sales', day.date, amount(day.sales), currency, day.orders]),
        ...categoryRevenue.map(cat => ['Revenue by category', cat.name, amount(cat.value), currency, '']),
        ...topProducts.map(product => ['Top products', product.name, amount(product.revenue), currency, product.units])
      ]
    );
  };

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Advanced Analytics</h1>
            <p className="text-gray-600 mt-1 md:mt-2 text-sm md:text-base">Detailed insights and performance metrics</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium pr-8 cursor-pointer bg-white"
            >
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="90days">Last 90 Days</option>
              <option value="year">This Year</option>
            </select>
            <select
              aria-label="Currency"
              value={currency}
              onChange={(e) => setPickedCurrency(e.target.value as CurrencyCode)}
              className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium pr-8 cursor-pointer bg-white"
            >
              <option value="GHS">Cedi orders (GH₵)</option>
              <option value="USD">Dollar orders ($)</option>
            </select>
            <button
              onClick={handleExport}
              disabled={loading}
              className="bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center disabled:opacity-50"
            >
              <i className="ri-download-line mr-2"></i>
              Export
            </button>
            <Link
              href="/admin"
              className="border-2 border-gray-300 hover:border-gray-400 text-gray-700 px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap text-center"
            >
              Back
            </Link>
          </div>
        </div>

        {loadError && (
          <div className="mb-6 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
            Could not load analytics: {loadError}
          </div>
        )}

        <p className="text-sm text-gray-600 mb-4">
          Showing paid {currency === 'USD' ? 'dollar' : 'cedi'} orders only.{' '}
          {otherReport.orders > 0
            ? `This period also has ${otherReport.orders} paid ${otherCurrency === 'USD' ? 'dollar' : 'cedi'} ${otherReport.orders === 1 ? 'order' : 'orders'} (${formatMoney(otherReport.revenue, otherCurrency)}). Use the currency switch to see ${otherReport.orders === 1 ? 'it' : 'them'}.`
            : `There are no paid ${otherCurrency === 'USD' ? 'dollar' : 'cedi'} orders in this period.`}
        </p>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-blue-100 rounded-lg">
                <i className="ri-money-dollar-circle-line text-2xl text-blue-700"></i>
              </div>
              <span className="text-blue-700 font-semibold text-sm">Live</span>
            </div>
            <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
            <p className="text-3xl font-bold text-gray-900">{formatMoney(report.revenue, currency)}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-blue-100 rounded-lg">
                <i className="ri-shopping-cart-line text-2xl text-blue-700"></i>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-1">Paid Orders</p>
            <p className="text-3xl font-bold text-gray-900">{report.orders}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-purple-100 rounded-lg">
                <i className="ri-bar-chart-box-line text-2xl text-purple-700"></i>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-1">Avg. Order Value</p>
            <p className="text-3xl font-bold text-gray-900">{formatMoney(report.aov, currency)}</p>
          </div>
        </div>

        {/* Charts */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Revenue & Performance Trends</h2>
            {/* Report Type Toggles omitted for brevity, hardcoded to Sales for now */}
          </div>
          <div style={{ width: '100%', height: 350 }}>
            <ResponsiveContainer>
              <AreaChart data={salesData.length > 0 ? salesData : [{ date: 'No Data', sales: 0 }]}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip formatter={(value) => formatMoney(value, currency)} />
                <Legend />
                <Area type="monotone" dataKey="sales" stroke="#10b981" fillOpacity={1} fill="url(#colorSales)" name={`Sales (${currencySign})`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Pie Chart */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Revenue by Category</h2>
            <div className="flex items-center justify-center mb-6">
              <div style={{ width: '100%', height: 250 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={categoryRevenue.length > 0 ? categoryRevenue : [{ name: 'No Data', value: 1 }]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {categoryRevenue.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => (categoryRevenue.length > 0 ? formatMoney(value, currency) : '')} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Top Products */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Top Performing Products</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-100">
                  <tr>
                    <th className="text-left pb-3 text-sm font-semibold text-gray-600">Product</th>
                    <th className="text-right pb-3 text-sm font-semibold text-gray-600">Units</th>
                    <th className="text-right pb-3 text-sm font-semibold text-gray-600">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {topProducts.map((product, index) => (
                    <tr key={index}>
                      <td className="py-3 text-sm font-medium text-gray-900">{product.name}</td>
                      <td className="py-3 text-right text-sm text-gray-600">{product.units}</td>
                      <td className="py-3 text-right text-sm font-semibold text-blue-600">{formatMoney(product.revenue, currency)}</td>
                    </tr>
                  ))}
                  {topProducts.length === 0 && <tr><td colSpan={3} className="text-center py-4 text-gray-500">No sales data yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
