'use client';
/* eslint-disable react-hooks/exhaustive-deps */

import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { formatMoney, formatMoneyByCurrency } from '@/lib/format-money';
import { downloadCsv } from '../orders/csv';
import { VIP_THRESHOLD, isRealEmail, isVip, ordersForCustomer, paidSummary } from './match-orders';

export default function AdminCustomersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState('Sort by Join Date');
  const [filterStatus, setFilterStatus] = useState('All Customers');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setLoadError(null);

      // Customers table: guests and registered users alike.
      // Orders are loaded beside it because order counts and spend are worked out from the
      // orders themselves (paid only, per currency), matched by email or phone.
      const [customersRes, ordersRes] = await Promise.all([
        supabase
          .from('customers')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('orders')
          .select('id, email, phone, total, currency, payment_status, status, created_at')
          .order('created_at', { ascending: false })
          .limit(5000)
      ]);

      if (customersRes.error) throw new Error(customersRes.error.message);
      if (ordersRes.error) throw new Error(ordersRes.error.message);

      const allOrders = ordersRes.data || [];

      const processed = (customersRes.data || []).map((customer: any) => {
        const { paidCount, spent, lastPaidAt } = paidSummary(ordersForCustomer(customer, allOrders));

        let status = 'New';
        if (isVip(spent)) status = 'VIP';
        else if (paidCount > 0) status = 'Active';
        else if (new Date(customer.created_at).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000) status = 'Inactive';

        const displayName = customer.full_name ||
          (customer.first_name && customer.last_name ? `${customer.first_name} ${customer.last_name}` : null) ||
          customer.first_name ||
          'No Name';
        const hasEmail = isRealEmail(customer.email);

        return {
          id: customer.id,
          name: displayName,
          // POS walk-in customers carry a placeholder address; that is not an email.
          email: hasEmail ? customer.email : '',
          phone: customer.phone || 'N/A',
          avatar: getInitials(displayName !== 'No Name' ? displayName : (hasEmail ? customer.email : customer.phone || '')),
          orders: paidCount,
          spent,
          joined: new Date(customer.created_at).toLocaleDateString(),
          lastOrder: lastPaidAt ? timeAgo(new Date(lastPaidAt)) : 'Never',
          status: status,
          rawJoined: new Date(customer.created_at),
          rawLastOrder: lastPaidAt ? new Date(lastPaidAt) : null,
          isGuest: !customer.user_id
        };
      });
      setCustomers(processed);
    } catch (error: any) {
      console.error('Error fetching customers:', error);
      setLoadError(error?.message || 'Could not load customers.');
    } finally {
      setLoading(false);
    }
  };

  const exportCustomers = (rows: any[], filename: string) => {
    downloadCsv(
      filename,
      ['Name', 'Email', 'Phone', 'Paid orders', 'Spent (GHS)', 'Spent (USD)', 'Last paid order', 'Joined', 'Status', 'Account'],
      rows.map(c => [
        c.name,
        c.email,
        c.phone === 'N/A' ? '' : c.phone,
        c.orders,
        c.spent.GHS.toFixed(2),
        c.spent.USD.toFixed(2),
        c.rawLastOrder ? c.rawLastOrder.toLocaleDateString() : '',
        c.joined,
        c.status,
        c.isGuest ? 'Guest' : 'Registered'
      ])
    );
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    return name
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const timeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    return "Just now";
  }

  const statusColors: any = {
    'New': 'bg-blue-100 text-blue-700',
    'Active': 'bg-blue-100 text-blue-700',
    'VIP': 'bg-purple-100 text-purple-700',
    'Inactive': 'bg-gray-100 text-gray-700'
  };

  const handleSelectAll = () => {
    if (selectedCustomers.length === filteredCustomers.length) {
      setSelectedCustomers([]);
    } else {
      setSelectedCustomers(filteredCustomers.map(c => c.id));
    }
  };

  const handleSelectCustomer = (customerId: string) => {
    if (selectedCustomers.includes(customerId)) {
      setSelectedCustomers(selectedCustomers.filter(id => id !== customerId));
    } else {
      setSelectedCustomers([...selectedCustomers, customerId]);
    }
  };

  // Memoized filter and sort
  const filteredCustomers = useMemo(() => {
    let result = customers;

    // Filter by Status
    if (filterStatus !== 'All Customers') {
      result = result.filter(c => c.status === filterStatus);
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      if (sortOption === 'Sort by Name') return a.name.localeCompare(b.name);
      if (sortOption === 'Sort by Orders') return b.orders - a.orders;
      // Cedis and dollars are not comparable: rank by cedis first, then by dollars.
      if (sortOption === 'Sort by Spent') return (b.spent.GHS - a.spent.GHS) || (b.spent.USD - a.spent.USD);
      if (sortOption === 'Sort by Join Date') return b.rawJoined.getTime() - a.rawJoined.getTime();
      return 0;
    });

    return result;
  }, [customers, searchQuery, sortOption, filterStatus]);

  // Derived Stats
  const stats = useMemo(() => ({
    total: customers.length,
    newThisMonth: customers.filter(c => {
      const d = new Date(c.rawJoined);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length,
    vip: customers.filter(c => c.status === 'VIP').length,
    // Average paid spend per buyer, worked out separately for each currency.
    avgSpend: (['GHS', 'USD'] as const)
      .map(currency => {
        const buyers = customers.filter(c => c.spent[currency] > 0);
        if (buyers.length === 0) return null;
        return formatMoney(buyers.reduce((sum, c) => sum + c.spent[currency], 0) / buyers.length, currency);
      })
      .filter(Boolean)
      .join(' · ')
  }), [customers]);

  // Selected customers with a real email address, for the bulk "Send Email" link.
  const selectedEmails = customers
    .filter(c => selectedCustomers.includes(c.id) && c.email)
    .map(c => c.email as string);
  const bulkMailto = `mailto:?bcc=${selectedEmails.map(e => encodeURIComponent(e)).join(',')}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-600 mt-1">Manage your customer base and relationships</p>
        </div>
        <button
          onClick={() => exportCustomers(filteredCustomers, 'customers.csv')}
          disabled={loading || filteredCustomers.length === 0}
          className="bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i className="ri-download-line mr-2"></i>
          Export Customers
        </button>
      </div>

      {loadError && (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm flex items-center justify-between">
          <span>Could not load customers: {loadError}</span>
          <button onClick={fetchCustomers} className="font-semibold underline cursor-pointer">Try again</button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Customers</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">New This Month</p>
          <p className="text-2xl font-bold text-blue-700">{stats.newThisMonth}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">VIP Customers</p>
          <p className="text-2xl font-bold text-purple-700">{stats.vip}</p>
          <p className="text-xs text-gray-500 mt-1">
            Spent over {formatMoney(VIP_THRESHOLD.GHS, 'GHS')} or {formatMoney(VIP_THRESHOLD.USD, 'USD')}
          </p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Avg Spent per Buyer</p>
          <p className="text-2xl font-bold text-gray-900">{stats.avgSpend || 'No paid orders yet'}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg flex items-center justify-center"></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, email, or phone..."
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium cursor-pointer"
              >
                <option>All Customers</option>
                <option>New</option>
                <option>Active</option>
                <option>VIP</option>
                <option>Inactive</option>
              </select>
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                className="px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium cursor-pointer"
              >
                <option>Sort by Join Date</option>
                <option>Sort by Name</option>
                <option>Sort by Orders</option>
                <option>Sort by Spent</option>
              </select>
            </div>
          </div>
        </div>

        {selectedCustomers.length > 0 && (
          <div className="p-4 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
            <p className="text-blue-800 font-semibold">
              {selectedCustomers.length} customer{selectedCustomers.length > 1 ? 's' : ''} selected
            </p>
            <div className="flex items-center space-x-2">
              {selectedEmails.length === 0 ? (
                <span className="text-sm text-blue-800">No email address on the selected customers</span>
              ) : bulkMailto.length > 1800 ? (
                <span className="text-sm text-blue-800">Too many to email at once. Export the list instead.</span>
              ) : (
                <a
                  href={bulkMailto}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
                >
                  <i className="ri-mail-line mr-2"></i>
                  Send Email ({selectedEmails.length})
                </a>
              )}
              <button
                onClick={() => exportCustomers(customers.filter(c => selectedCustomers.includes(c.id)), 'selected-customers.csv')}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
              >
                <i className="ri-download-line mr-2"></i>
                Export
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-4 px-6">
                  <input
                    type="checkbox"
                    checked={selectedCustomers.length === filteredCustomers.length && filteredCustomers.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-blue-700 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Customer</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Contact</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Paid Orders</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Total Spent</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Last Paid Order</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="p-10 text-center text-gray-500">Loading customers...</td></tr>
              ) : filteredCustomers.length === 0 ? (
                <tr><td colSpan={8} className="p-10 text-center text-gray-500">No customers found.</td></tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <input
                        type="checkbox"
                        checked={selectedCustomers.includes(customer.id)}
                        onChange={() => handleSelectCustomer(customer.id)}
                        className="w-4 h-4 text-blue-700 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 flex items-center justify-center bg-blue-100 text-blue-700 rounded-full font-semibold">
                          {customer.avatar}
                        </div>
                        <div>
                          <Link href={`/admin/customers/${customer.id}`} className="font-semibold text-gray-900 hover:text-blue-700 whitespace-nowrap">
                            {customer.name}
                          </Link>
                          <p className="text-sm text-gray-500">Joined {customer.joined}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-gray-700 text-sm">{customer.email || 'No email'}</p>
                      <p className="text-gray-600 text-sm">{customer.phone}</p>
                    </td>
                    <td className="py-4 px-4 font-semibold text-gray-900">{customer.orders}</td>
                    <td className="py-4 px-4 font-semibold text-blue-700 whitespace-nowrap">{formatMoneyByCurrency(customer.spent)}</td>
                    <td className="py-4 px-4 text-gray-700 text-sm whitespace-nowrap">{customer.lastOrder}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusColors[customer.status]}`}>
                          {customer.status}
                        </span>
                        {customer.isGuest && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Guest
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2">
                        <Link
                          href={`/admin/customers/${customer.id}`}
                          title="View customer"
                          aria-label={`View ${customer.name}`}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <i className="ri-eye-line text-lg"></i>
                        </Link>
                        {customer.email && (
                          <a
                            href={`mailto:${customer.email}`}
                            title={`Email ${customer.email}`}
                            aria-label={`Email ${customer.name}`}
                            className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <i className="ri-mail-line text-lg"></i>
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-6 border-t border-gray-200 flex items-center justify-between">
          <p className="text-gray-600">Showing {filteredCustomers.length} of {customers.length} customers</p>
          <div className="flex items-center space-x-2">
            {/* Simple pagination place holder logic or hidden if few */}
          </div>
        </div>
      </div>
    </div>
  );
}
