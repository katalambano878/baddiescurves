'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatMoney, formatMoneyByCurrency } from '@/lib/format-money';
import { downloadCsv } from '../orders/csv';
import { VIP_THRESHOLD, isRealEmail, isVip, ordersForCustomer, paidSummary } from '../customers/match-orders';

const DAY_MS = 1000 * 3600 * 24;

export default function CustomerInsightsPage() {
  const [selectedSegment, setSelectedSegment] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomerData();
  }, []);

  const fetchCustomerData = async () => {
    try {
      setLoading(true);
      setLoadError(null);

      // Built on the customers table (guests and registered alike). Orders are guest orders,
      // so they are matched to a customer by email or phone, and only paid orders are counted.
      const [customersRes, ordersRes] = await Promise.all([
        supabase.from('customers').select('*').order('created_at', { ascending: false }),
        supabase
          .from('orders')
          .select('id, email, phone, total, currency, payment_status, status, created_at')
          .order('created_at', { ascending: false })
          .limit(5000)
      ]);

      if (customersRes.error) throw new Error(customersRes.error.message);
      if (ordersRes.error) throw new Error(ordersRes.error.message);

      const allOrders = ordersRes.data || [];
      const now = Date.now();

      const aggregated = (customersRes.data || []).map((customer: any) => {
        const { paidCount, paidCountByCurrency, spent, lastPaidAt } = paidSummary(ordersForCustomer(customer, allOrders));
        const daysSinceJoin = (now - new Date(customer.created_at).getTime()) / DAY_MS;
        const daysSinceLastPaid = lastPaidAt ? (now - new Date(lastPaidAt).getTime()) / DAY_MS : null;

        // A customer can be in more than one group (for example VIP and Returning).
        const segments: string[] = [];
        if (isVip(spent)) segments.push('vip');
        if (paidCount > 1) segments.push('returning');
        if (daysSinceJoin < 30) segments.push('new');
        if (daysSinceLastPaid !== null && daysSinceLastPaid > 90) segments.push('at-risk');
        if (paidCount === 0) segments.push('no-paid-order');

        const name = customer.full_name ||
          [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
          'No Name';

        return {
          id: customer.id,
          name,
          // POS walk-in customers carry a placeholder address; that is not an email.
          email: isRealEmail(customer.email) ? customer.email : '',
          phone: customer.phone || '',
          segments,
          spent,
          orders: paidCount,
          // Average paid order, per currency (empty when there is no paid order in that currency)
          avgOrder: (['GHS', 'USD'] as const)
            .filter(currency => paidCountByCurrency[currency] > 0)
            .map(currency => formatMoney(spent[currency] / paidCountByCurrency[currency], currency))
            .join(' · '),
          joinDate: customer.created_at,
          lastPaidAt
        };
      });

      setCustomers(aggregated);
    } catch (err: any) {
      console.error('Error fetching customer insights:', err);
      setLoadError(err?.message || 'Could not load customer insights.');
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    vip: customers.filter(c => c.segments.includes('vip')).length,
    returning: customers.filter(c => c.segments.includes('returning')).length,
    new: customers.filter(c => c.segments.includes('new')).length,
    atRisk: customers.filter(c => c.segments.includes('at-risk')).length,
    noPaidOrder: customers.filter(c => c.segments.includes('no-paid-order')).length,
    // Average paid spend per buyer, worked out separately for each currency.
    avgSpend: (['GHS', 'USD'] as const)
      .map(currency => {
        const buyers = customers.filter(c => c.spent[currency] > 0);
        if (buyers.length === 0) return null;
        return formatMoney(buyers.reduce((sum, c) => sum + c.spent[currency], 0) / buyers.length, currency);
      })
      .filter(Boolean)
      .join(' · ')
  };

  const filteredCustomers = customers.filter(customer => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = customer.name.toLowerCase().includes(term) ||
      customer.email.toLowerCase().includes(term) ||
      customer.phone.toLowerCase().includes(term);
    const matchesSegment = selectedSegment === 'all' || customer.segments.includes(selectedSegment);
    return matchesSearch && matchesSegment;
  });

  const getSegmentBadge = (segment: string) => {
    const badges: any = {
      vip: 'bg-blue-100 text-blue-700',
      returning: 'bg-blue-100 text-blue-700',
      new: 'bg-amber-100 text-amber-700',
      'at-risk': 'bg-red-100 text-red-700'
    };
    return badges[segment] || 'bg-gray-100 text-gray-700';
  };

  const getSegmentLabel = (segment: string) => {
    const labels: any = {
      vip: 'VIP Customer',
      returning: 'Returning',
      new: 'New Customer',
      'at-risk': 'At Risk',
      'no-paid-order': 'No paid order yet'
    };
    return labels[segment] || segment;
  };

  const handleExport = () => {
    downloadCsv(
      'customer-insights.csv',
      ['Name', 'Email', 'Phone', 'Groups', 'Paid orders', 'Spent (GHS)', 'Spent (USD)', 'Last paid order', 'Joined'],
      filteredCustomers.map(c => [
        c.name,
        c.email,
        c.phone,
        c.segments.map(getSegmentLabel).join('; '),
        c.orders,
        c.spent.GHS.toFixed(2),
        c.spent.USD.toFixed(2),
        c.lastPaidAt ? new Date(c.lastPaidAt).toLocaleDateString('en-GB') : '',
        new Date(c.joinDate).toLocaleDateString('en-GB')
      ])
    );
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading Insights...</div>;
  if (loadError) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-red-500">Could not load customer insights: {loadError}</p>
        <button onClick={fetchCustomerData} className="text-blue-700 font-semibold hover:underline cursor-pointer">Try again</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Customer Insights</h1>
            <p className="text-gray-600 mt-1 md:mt-2 text-sm md:text-base">Deep dive into customer behavior and lifetime value</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleExport}
              disabled={filteredCustomers.length === 0}
              className="border-2 border-gray-300 hover:border-gray-400 text-gray-700 px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-download-line mr-2"></i>
              Export List
            </button>
            <Link
              href="/admin"
              className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap text-center"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-blue-100 rounded-lg">
                <i className="ri-vip-crown-line text-2xl text-blue-700"></i>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-1">VIP Customers</p>
            <p className="text-3xl font-bold text-gray-900">{stats.vip}</p>
            <p className="text-sm text-blue-700 font-semibold mt-2">
              Spent over {formatMoney(VIP_THRESHOLD.GHS, 'GHS')} or {formatMoney(VIP_THRESHOLD.USD, 'USD')}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-blue-100 rounded-lg">
                <i className="ri-refresh-line text-2xl text-blue-700"></i>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-1">Returning Customers</p>
            <p className="text-3xl font-bold text-gray-900">{stats.returning}</p>
            <p className="text-sm text-blue-700 font-semibold mt-2">More than 1 paid order</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-red-100 rounded-lg">
                <i className="ri-alert-line text-2xl text-red-700"></i>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-1">At Risk</p>
            <p className="text-3xl font-bold text-gray-900">{stats.atRisk}</p>
            <p className="text-sm text-red-700 font-semibold mt-2">Last paid order over 90 days ago</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-purple-100 rounded-lg">
                <i className="ri-line-chart-line text-2xl text-purple-700"></i>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-1">Avg. Spent per Buyer</p>
            <p className="text-3xl font-bold text-gray-900">{stats.avgSpend || 'No paid orders yet'}</p>
            <p className="text-sm text-gray-500 mt-2">Paid orders only, per currency</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl"></i>
                <input
                  type="text"
                  placeholder="Search customers by name, email or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 bg-gray-100 rounded-lg p-1">
              {[
                { value: 'all', label: 'All', count: customers.length },
                { value: 'vip', label: 'VIP', count: stats.vip },
                { value: 'returning', label: 'Returning', count: stats.returning },
                { value: 'new', label: 'New', count: stats.new },
                { value: 'at-risk', label: 'At Risk', count: stats.atRisk },
                { value: 'no-paid-order', label: 'No Paid Order', count: stats.noPaidOrder }
              ].map((segment) => (
                <button
                  key={segment.value}
                  onClick={() => setSelectedSegment(segment.value)}
                  className={`px-3 py-2 rounded-md font-medium text-sm transition-colors whitespace-nowrap flex-grow sm:flex-grow-0 ${selectedSegment === segment.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  {segment.label} ({segment.count})
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {filteredCustomers.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl">
              <p className="text-gray-500">No customers found matching this criteria.</p>
            </div>
          ) : (
            filteredCustomers.map((customer) => (
              <div key={customer.id} className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start space-x-4">
                    <div className="w-16 h-16 flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 rounded-full text-white text-2xl font-bold">
                      {customer.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{customer.name}</h3>
                      <div className="flex items-center space-x-3 mt-1 text-sm text-gray-600">
                        <span className="flex items-center">
                          <i className="ri-mail-line mr-1"></i>
                          {customer.email || 'No email'}
                        </span>
                        <span className="flex items-center">
                          <i className="ri-phone-line mr-1"></i>
                          {customer.phone || 'No phone'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {customer.segments.map((segment: string) => (
                          <span key={segment} className={`px-3 py-1 rounded-full text-sm font-medium ${getSegmentBadge(segment)} whitespace-nowrap`}>
                            {getSegmentLabel(segment)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/admin/customers/${customer.id}`}
                    className="text-blue-700 hover:text-blue-800 font-medium text-sm whitespace-nowrap"
                  >
                    View customer <i className="ri-arrow-right-line ml-1"></i>
                  </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Total Spent</p>
                    <p className="text-2xl font-bold text-gray-900">{formatMoneyByCurrency(customer.spent)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Paid Orders</p>
                    <p className="text-2xl font-bold text-gray-900">{customer.orders}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Avg. Paid Order</p>
                    <p className="text-2xl font-bold text-gray-900">{customer.avgOrder || 'None yet'}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <div className="flex items-center space-x-6 text-sm text-gray-600">
                    <span>
                      <span className="font-medium">Joined:</span> {new Date(customer.joinDate).toLocaleDateString('en-GB')}
                    </span>
                    <span>
                      <span className="font-medium">Last Paid Order:</span> {customer.lastPaidAt ? new Date(customer.lastPaidAt).toLocaleDateString('en-GB') : 'None yet'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
