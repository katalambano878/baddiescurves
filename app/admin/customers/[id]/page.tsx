'use client';
/* eslint-disable react-hooks/exhaustive-deps */

import { formatMoney, formatMoneyByCurrency } from '@/lib/format-money';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { isRealEmail, ordersForCustomer, paidSummary } from '../match-orders';

export default function CustomerDetailsPage() {
    const params = useParams();
    const customerId = params.id as string;

    const [customer, setCustomer] = useState<any>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
        if (customerId) {
            fetchCustomerData();
        }
    }, [customerId]);

    const fetchCustomerData = async () => {
        try {
            setLoading(true);
            setLoadError(null);

            // 1. The customer row (the customers list links here with customers.id)
            const { data: customerRow, error: customerError } = await supabase
                .from('customers')
                .select('*')
                .eq('id', customerId)
                .maybeSingle();

            if (customerError) throw new Error(customerError.message);
            if (!customerRow) {
                setCustomer(null);
                setOrders([]);
                return;
            }

            // 2. This customer's orders. Orders are guest orders (no user id), so they are
            // matched by email or phone against the customer's main and secondary contacts.
            const { data: ordersData, error: ordersError } = await supabase
                .from('orders')
                .select('id, order_number, email, phone, total, currency, status, payment_status, created_at')
                .order('created_at', { ascending: false })
                .limit(5000);

            if (ordersError) throw new Error(ordersError.message);

            setCustomer(customerRow);
            setOrders(ordersForCustomer(customerRow, ordersData || []));
        } catch (err: any) {
            console.error('Error fetching customer:', err);
            setLoadError(err?.message || 'Could not load this customer.');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading customer details...</div>;
    if (loadError) {
        return (
            <div className="p-8 text-center space-y-4">
                <p className="text-red-500">Could not load this customer: {loadError}</p>
                <button onClick={fetchCustomerData} className="text-blue-700 font-semibold hover:underline cursor-pointer">Try again</button>
            </div>
        );
    }
    if (!customer) {
        return (
            <div className="p-8 text-center space-y-4">
                <p className="text-red-500">Customer not found</p>
                <Link href="/admin/customers" className="inline-flex text-blue-700 hover:underline font-semibold">← Back to Customers</Link>
            </div>
        );
    }

    // Order count and spend come from the orders themselves: paid orders only, per currency.
    const { paidCount, spent, lastPaidAt } = paidSummary(orders);
    const displayName = customer.full_name ||
        [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
        'No Name';
    // POS walk-in customers carry a placeholder address ending in @pos.local; that is not an email.
    const emails = [customer.email, customer.secondary_email].filter(isRealEmail) as string[];
    const phones = [customer.phone, customer.secondary_phone].filter(Boolean) as string[];

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-4">
                    <Link href="/admin/customers" className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                        <i className="ri-arrow-left-line text-xl"></i>
                    </Link>
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-2xl font-bold">
                        {(displayName !== 'No Name' ? displayName : emails[0] || phones[0] || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">{displayName}</h1>
                        <p className="text-gray-500">{emails.length ? emails.join(' · ') : 'No email'}</p>
                    </div>
                </div>
                {emails.length > 0 && (
                    <div className="flex space-x-3">
                        <a
                            href={`mailto:${emails[0]}`}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 cursor-pointer"
                        >
                            <i className="ri-mail-send-line mr-2"></i>
                            Send Email
                        </a>
                    </div>
                )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm font-medium text-gray-500 mb-1">Total Spent</p>
                    <p className="text-2xl font-bold text-gray-900">{formatMoneyByCurrency(spent)}</p>
                    <p className="text-xs text-gray-500 mt-1">Paid orders only</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm font-medium text-gray-500 mb-1">Paid Orders</p>
                    <p className="text-2xl font-bold text-gray-900">{paidCount}</p>
                    {orders.length > paidCount && (
                        <p className="text-xs text-gray-500 mt-1">{orders.length - paidCount} more not paid</p>
                    )}
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm font-medium text-gray-500 mb-1">Last Paid Order</p>
                    <p className="text-xl font-bold text-gray-900">
                        {lastPaidAt ? new Date(lastPaidAt).toLocaleDateString() : 'Never'}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm font-medium text-gray-500 mb-1">Phone</p>
                    <p className="text-lg font-bold text-gray-900">{phones[0] || 'N/A'}</p>
                    {phones[1] && <p className="text-sm text-gray-600 mt-1">Also: {phones[1]}</p>}
                </div>
            </div>

            {/* Orders History */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900">Order History</h2>
                </div>

                {orders.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">No orders found.</div>
                ) : (
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-600 text-xs uppercase font-semibold">
                            <tr>
                                <th className="px-6 py-4">Order ID</th>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Payment</th>
                                <th className="px-6 py-4">Total</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {orders.map(order => (
                                <tr key={order.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-sm font-medium text-blue-600">
                                        <Link href={`/admin/orders/${order.id}`}>{order.order_number || `#${order.id.slice(0, 8)}`}</Link>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        {new Date(order.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                            ${order.status === 'completed' || order.status === 'delivered' ? 'bg-blue-100 text-blue-800' :
                                                order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                    order.status === 'cancelled' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                                            {String(order.status || 'pending').replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm capitalize">
                                        <span className={order.payment_status === 'paid' ? 'text-gray-900 font-medium' : 'text-amber-700'}>
                                            {String(order.payment_status || 'pending').replace(/_/g, ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-gray-900">
                                        {formatMoney(order.total, order.currency)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Link href={`/admin/orders/${order.id}`} className="text-gray-400 hover:text-blue-600">
                                            <i className="ri-eye-line text-lg"></i>
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
