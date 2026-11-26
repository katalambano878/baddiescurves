'use client';
/* eslint-disable react-hooks/exhaustive-deps */

import { asNumber, formatMoney } from '@/lib/format-money';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { adminFetch } from '@/lib/admin-fetch';
import FraudDetectionAlert from '@/components/FraudDetectionAlert';

interface OrderDetailClientProps {
  orderId: string;
}

type RiskLevel = 'low' | 'medium' | 'high';

interface FraudAnalysis {
  riskLevel: RiskLevel;
  reasons: string[];
}

export default function OrderDetailClient({ orderId }: OrderDetailClientProps) {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  // Inject print styles
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const styleId = 'order-print-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = '@media print { body * { visibility: hidden; } .print-section, .print-section * { visibility: visible; } .print-section { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; } .no-print { display: none !important; } }';
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const orderSelect = `
          *,
          order_items (
            id,
            product_id,
            product_name,
            variant_name,
            sku,
            quantity,
            unit_price,
            total_price,
            metadata,
            products (
              id,
              name,
              slug,
              product_images (url, position)
            )
          )
        `;

      // Try to fetch by ID or order_number
      let { data, error } = await supabase
        .from('orders')
        .select(orderSelect)
        .eq('id', orderId)
        .maybeSingle();

      if ((!data || error) && orderId) {
        // Not found by UUID, try order_number
        const byNum = await supabase
          .from('orders')
          .select(orderSelect)
          .eq('order_number', orderId)
          .maybeSingle();

        if (byNum.data) {
          data = byNum.data;
          error = null;
        } else if (byNum.error) {
          error = byNum.error;
        }
      }

      // Fallback without nested product images if embed path fails
      if (error || !data) {
        let plain = await supabase
          .from('orders')
          .select(`
            *,
            order_items (
              id,
              product_id,
              product_name,
              variant_name,
              sku,
              quantity,
              unit_price,
              total_price,
              metadata
            )
          `)
          .eq('id', orderId)
          .maybeSingle();

        if (!plain.data) {
          plain = await supabase
            .from('orders')
            .select(`
              *,
              order_items (
                id,
                product_id,
                product_name,
                variant_name,
                sku,
                quantity,
                unit_price,
                total_price,
                metadata
              )
            `)
            .eq('order_number', orderId)
            .maybeSingle();
        }

        if (plain.data) {
          data = plain.data;
          error = null;
        } else if (plain.error) {
          error = plain.error;
        }
      }

      if (error) throw error;
      if (!data) throw new Error('Order not found');

      setOrder(data);
      setTrackingNumber(data.metadata?.tracking_number || '');
      setAdminNotes(data.notes || '');

    } catch (err: any) {
      console.error('Error fetching order:', err);
      setError(err?.message || 'Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const getOrderCustomerName = (o: any) => {
    const addr = o?.shipping_address || {};
    if (addr.firstName || addr.lastName) {
      return `${addr.firstName?.trim() || ''} ${addr.lastName?.trim() || ''}`.trim();
    }
    return addr.full_name || addr.firstName || o?.email?.split('@')[0] || 'Customer';
  };

  const handleUpdateStatus = async (newStatus?: string) => {
    try {
      setStatusUpdating(true);
      const statusToUpdate = newStatus || order.status;
      const shippingAddress = order.shipping_address || {};
      const customerName = getOrderCustomerName(order);

      const { error } = await supabase
        .from('orders')
        .update({
          status: statusToUpdate,
          notes: adminNotes,
          metadata: {
            ...order.metadata,
            tracking_number: trackingNumber
          }
        })
        .eq('id', order.id);

      if (error) throw error;

      // Update local state
      setOrder({
        ...order,
        status: statusToUpdate,
        notes: adminNotes,
        metadata: { ...order.metadata, tracking_number: trackingNumber }
      });

      // Send Notification (Email + SMS)
      // Only send if status changed OR tracking number was added/changed
      const statusChanged = statusToUpdate !== order.status;
      const trackingChanged = trackingNumber !== order.metadata?.tracking_number;

      if (statusChanged || (trackingChanged && trackingNumber)) {
        // Get auth token for notification API
        const { data: { session } } = await supabase.auth.getSession();
        const authToken = session?.access_token;

        fetch('/api/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken && { 'Authorization': `Bearer ${authToken}` })
          },
          body: JSON.stringify({
            type: 'order_status',
            payload: {
              email: order.email,
              name: customerName,
              orderId: orderId,
              orderNumber: order.order_number || orderId,
              status: statusToUpdate,
              trackingNumber: trackingNumber,
              phone: shippingAddress.phone || order.phone
            }
          })
        }).catch(err => console.error('Notification error:', err));
      }

      alert('Order updated successfully');
      setShowStatusMenu(false);
    } catch (err) {
      console.error('Error updating order:', err);
      alert('Failed to update order');
    } finally {
      setStatusUpdating(false);
    }
  };

  const [resendingNotification, setResendingNotification] = useState(false);

  const handleResendNotification = async () => {
    if (!order) return;

    try {
      setResendingNotification(true);

      const shippingAddress = order.shipping_address || {};
      const customerName = (shippingAddress.firstName && shippingAddress.lastName)
        ? `${shippingAddress.firstName.trim()} ${shippingAddress.lastName.trim()}`
        : shippingAddress.full_name || shippingAddress.firstName || order.email?.split('@')[0] || 'Customer';
      const phone = order.phone || shippingAddress.phone;

      // adminFetch adds the session token and throws with the API's own error message.
      const result = await adminFetch<{ success?: boolean; message?: string }>('/api/notifications', {
        method: 'POST',
        body: JSON.stringify({
          type: 'order_status',
          payload: {
            email: order.email,
            name: customerName,
            orderNumber: order.order_number || order.id,
            status: order.status,
            trackingNumber: order.metadata?.tracking_number || '',
            phone
          }
        })
      });

      // The API reports that it handed the messages over, not that they arrived.
      alert(
        `Sent to the SMS/email provider (${phone ? 'email and text' : 'email only, no phone number on this order'}).\n` +
        `Server reply: ${result?.message || 'no details returned'}.\n` +
        `This does not confirm the customer received it.`
      );
    } catch (err: any) {
      console.error('Error resending notification:', err);
      alert(`Could not resend the notification: ${err?.message || 'Unknown error'}`);
    } finally {
      setResendingNotification(false);
    }
  };

  // Print the packing slip once when the page was opened with ?print=true (orders list printer icon).
  const autoPrinted = useRef(false);
  useEffect(() => {
    if (!order || loading || autoPrinted.current) return;
    if (new URLSearchParams(window.location.search).get('print') !== 'true') return;
    const timer = setTimeout(() => {
      autoPrinted.current = true;
      window.print();
    }, 400);
    return () => clearTimeout(timer);
  }, [order, loading]);

  // Mark as paid: for cash, bank transfer or a mobile-money payment confirmed by phone.
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [markPaidError, setMarkPaidError] = useState<string | null>(null);

  const handleMarkAsPaid = async () => {
    if (!order?.order_number) return;
    try {
      setMarkingPaid(true);
      setMarkPaidError(null);

      const { data: { session } } = await supabase.auth.getSession();
      const adminEmail = session?.user?.email;
      if (!adminEmail) {
        setMarkPaidError('Your session has expired. Please log in again.');
        return;
      }

      // The database function marks the order paid, moves it to processing and reduces stock once.
      const { data, error } = await supabase.rpc('mark_order_paid', {
        order_ref: order.order_number,
        moolre_ref: `manual:${adminEmail}`
      });

      if (error) {
        setMarkPaidError(error.message || 'The order could not be marked as paid.');
        return;
      }
      if (!data || data.payment_status !== 'paid') {
        setMarkPaidError('The order was not found, so nothing was changed.');
        return;
      }

      setShowMarkPaid(false);
      await fetchOrderDetails();
    } catch (err: any) {
      console.error('Error marking order as paid:', err);
      setMarkPaidError(err?.message || 'The order could not be marked as paid.');
    } finally {
      setMarkingPaid(false);
    }
  };

  const statusOptions = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
  const statusLabel = (s: string) => s === 'shipped' ? 'Packaged' : s.charAt(0).toUpperCase() + s.slice(1);
  const statusColors: any = {
    'pending': 'bg-amber-100 text-amber-700 border-amber-200',
    'processing': 'bg-blue-100 text-blue-700 border-blue-200',
    'shipped': 'bg-purple-100 text-purple-700 border-purple-200',
    'delivered': 'bg-blue-100 text-blue-700 border-blue-200',
    'cancelled': 'bg-red-100 text-red-700 border-red-200',
    'awaiting_payment': 'bg-gray-100 text-gray-700 border-gray-200'
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (error || !order) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-red-500 font-medium">{error || 'Order not found'}</p>
        <Link href="/admin/orders" className="inline-flex text-blue-700 hover:underline font-semibold">
          ← Back to Orders
        </Link>
      </div>
    );
  }

  const currentStatus = order.status || 'pending';
  // Unpaid and still open. Refunded or cancelled orders are not offered "Mark as paid".
  const canMarkPaid =
    !['paid', 'refunded', 'partially_refunded', 'cancelled'].includes(order.payment_status) &&
    order.status !== 'cancelled';
  const shippingAddress = order.shipping_address || {};
  const customerName = (shippingAddress.firstName && shippingAddress.lastName)
    ? `${shippingAddress.firstName.trim()} ${shippingAddress.lastName.trim()}`
    : shippingAddress.full_name || shippingAddress.firstName || order.email?.split('@')[0] || 'Customer';

  // Derive timeline from status (simplified logic as we don't have full history table joined here yet)
  const timeline = [
    { status: 'Order Placed', date: new Date(order.created_at).toLocaleString(), completed: true },
    { status: 'Payment', date: order.payment_status, completed: order.payment_status === 'paid' },
    { status: 'Processing', date: '', completed: ['processing', 'shipped', 'delivered'].includes(order.status) },
    { status: 'Packaged', date: '', completed: ['shipped', 'delivered'].includes(order.status) },
    { status: 'Delivered', date: '', completed: order.status === 'delivered' }
  ];

  // Mock fraud analysis for now (or implement real logic later)
  const fraudAnalysis: FraudAnalysis = {
    riskLevel: 'low',
    reasons: []
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Print styles injected via useEffect */}

      {/* Printable Order Slip */}
      <div className="print-section hidden print:block bg-white p-8">
        <div className="border-2 border-gray-800 p-6">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-gray-800 pb-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold">BADDIECURVES</h1>
              <p className="text-sm text-gray-600">Order Packing Slip</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-lg">{order?.order_number}</p>
              <p className="text-sm">{order ? new Date(order.created_at).toLocaleDateString() : ''}</p>
            </div>
          </div>

          {/* Ship To */}
          <div className="mb-6">
            <h2 className="font-bold text-lg mb-2 bg-gray-200 px-2 py-1">SHIP TO:</h2>
            <div className="pl-2">
              <p className="font-bold text-lg">{customerName}</p>
              <p>{shippingAddress.phone || order?.phone}</p>
              <p>{shippingAddress.address || shippingAddress.address_line1}</p>
              <p>
                {[
                  shippingAddress.city,
                  shippingAddress.state || shippingAddress.region,
                  shippingAddress.postalCode || shippingAddress.postal_code,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </p>
              {shippingAddress.country && <p>{shippingAddress.country}</p>}
              {shippingAddress.deliveryNote && (
                <p className="text-sm mt-1">Note: {shippingAddress.deliveryNote}</p>
              )}
            </div>
          </div>

          {/* Order Items */}
          <div className="mb-6">
            <h2 className="font-bold text-lg mb-2 bg-gray-200 px-2 py-1">ORDER ITEMS:</h2>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-400">
                  <th className="text-left py-2 px-2">Product</th>
                  <th className="text-left py-2 px-2">Variant</th>
                  <th className="text-center py-2 px-2">Qty</th>
                  <th className="text-right py-2 px-2">Price</th>
                </tr>
              </thead>
              <tbody>
                {order?.order_items?.map((item: any) => (
                  <tr key={item.id} className="border-b border-gray-200">
                    <td className="py-2 px-2 font-medium">{item.product_name}</td>
                    <td className="py-2 px-2 text-sm">{item.variant_name || '-'}</td>
                    <td className="py-2 px-2 text-center font-bold">{item.quantity}</td>
                    <td className="py-2 px-2 text-right">{formatMoney(item.unit_price, order?.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Order Summary */}
          <div className="flex justify-between mb-6">
            <div>
              <p><span className="font-semibold">Shipping Method:</span> {order?.shipping_method || 'Standard'}</p>
              <p><span className="font-semibold">Payment:</span> {order?.payment_method} ({order?.payment_status})</p>
              {trackingNumber && <p><span className="font-semibold">Tracking #:</span> {trackingNumber}</p>}
            </div>
            <div className="text-right">
              <p>Subtotal: {formatMoney(order?.subtotal, order?.currency)}</p>
              <p>Shipping: {formatMoney(order?.shipping_total, order?.currency)}</p>
              {asNumber(order?.tax_total) > 0 && <p>Tax: {formatMoney(order?.tax_total, order?.currency)}</p>}
              {asNumber(order?.discount_total) > 0 && <p>Discount: -{formatMoney(order?.discount_total, order?.currency)}</p>}
              <p className="font-bold text-lg border-t border-gray-400 pt-1 mt-1">Total: {formatMoney(order?.total, order?.currency)}</p>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t-2 border-gray-800 pt-4 text-center text-sm text-gray-600">
            <p>Thank you for choosing BADDIECURVES.</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 no-print">
        {/* Page Header with Print Button */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Link href="/admin/orders" className="text-gray-600 hover:text-gray-900">
              <i className="ri-arrow-left-line text-2xl"></i>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{order?.order_number}</h1>
              <p className="text-sm text-gray-600">Order placed on {order ? new Date(order.created_at).toLocaleDateString() : ''}</p>
            </div>
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center space-x-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <i className="ri-printer-line text-lg"></i>
            <span>Print Order</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {fraudAnalysis.riskLevel !== 'low' && (
              <FraudDetectionAlert
                riskLevel={fraudAnalysis.riskLevel}
                reasons={fraudAnalysis.reasons}
                orderId={orderId}
              />
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Order Items</h2>
                <span className="text-gray-600">{order.order_items?.length || 0} items</span>
              </div>

              <div className="space-y-4">
                {order.order_items?.map((item: any) => (
                  <div key={item.id} className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                    <div className="w-20 h-20 bg-white rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center relative">
                      {item.products?.product_images?.[0]?.url ? (
                        <img
                          src={item.products.product_images[0].url}
                          alt={item.product_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <i className="ri-image-line text-2xl text-gray-300"></i>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{item.product_name}</h3>
                      <p className="text-sm text-gray-600 mb-1">{item.variant_name}</p>
                      <p className="text-xs text-gray-500">SKU: {item.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900 mb-1">{formatMoney(item.unit_price, order.currency)}</p>
                      <p className="text-sm text-gray-600">Qty: {item.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
                <div className="flex justify-between text-gray-700">
                  <span>Subtotal</span>
                  <span>{formatMoney(order.subtotal, order.currency)}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Shipping</span>
                  <span>{formatMoney(order.shipping_total, order.currency)}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Tax</span>
                  <span>{formatMoney(order.tax_total, order.currency)}</span>
                </div>
                {order.discount_total > 0 && (
                  <div className="flex justify-between text-blue-700 font-semibold">
                    <span>Discount</span>
                    <span>-{formatMoney(order.discount_total, order.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xl font-bold text-gray-900 pt-3 border-t border-gray-200">
                  <span>Total</span>
                  <span>{formatMoney(order.total, order.currency)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Order Timeline</h2>
              <div className="space-y-4">
                {timeline.map((event, index) => (
                  <div key={index} className="flex items-start space-x-4">
                    <div className={`w-10 h-10 flex items-center justify-center rounded-full border-2 ${event.completed ? 'bg-blue-700 border-blue-700' : 'bg-white border-gray-300'
                      }`}>
                      {event.completed ? (
                        <i className="ri-check-line text-white text-xl"></i>
                      ) : (
                        <span className="w-3 h-3 bg-gray-300 rounded-full"></span>
                      )}
                    </div>
                    <div className="flex-1 pb-6 border-b border-gray-200 last:border-0">
                      <p className={`font-semibold ${event.completed ? 'text-gray-900' : 'text-gray-500'}`}>
                        {event.status}
                      </p>
                      {event.date && (
                        <p className="text-sm text-gray-600 mt-1">{event.date}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Order Status</h2>
              <div className="relative">
                <button
                  onClick={() => setShowStatusMenu(!showStatusMenu)}
                  className={`w-full px-4 py-3 rounded-lg border-2 font-semibold text-left flex items-center justify-between ${statusColors[currentStatus] || 'bg-gray-100'}`}
                >
                  <span>{statusLabel(currentStatus)}</span>
                  <i className="ri-arrow-down-s-line text-xl"></i>
                </button>
                {showStatusMenu && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-200 rounded-lg shadow-lg overflow-hidden z-10">
                    {statusOptions.map((status) => (
                      <button
                        key={status}
                        onClick={() => {
                          handleUpdateStatus(status);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${status === currentStatus ? 'bg-blue-50 font-semibold' : ''
                          }`}
                      >
                        {statusLabel(status)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Tracking Number
                </label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <button
                onClick={() => handleUpdateStatus()}
                disabled={statusUpdating}
                className="w-full mt-4 bg-blue-700 hover:bg-blue-800 text-white py-3 rounded-lg font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {statusUpdating ? 'Updating...' : 'Update Status'}
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Customer</h2>
              <div className="flex items-start space-x-3 mb-4">
                <div className="w-12 h-12 flex items-center justify-center bg-blue-100 text-blue-700 rounded-full font-semibold uppercase">
                  {customerName.substring(0, 2)}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{customerName}</p>
                  <p className="text-sm text-gray-600">{order.email}</p>
                  <p className="text-sm text-gray-600">{shippingAddress.phone || order.phone}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Shipping Address</h2>
              <div className="text-gray-700 space-y-1">
                {/* Support both old field names (address_line1) and new (address) */}
                <p>{shippingAddress.address || shippingAddress.address_line1}</p>
                {shippingAddress.address_line2 && <p>{shippingAddress.address_line2}</p>}
                <p>
                  {[
                    shippingAddress.city,
                    shippingAddress.state || shippingAddress.region,
                    shippingAddress.postalCode || shippingAddress.postal_code,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                {shippingAddress.country && (
                  <p className="font-semibold">{shippingAddress.country}</p>
                )}
                {shippingAddress.deliveryNote && (
                  <p className="text-sm text-gray-600 mt-2">
                    Delivery note: {shippingAddress.deliveryNote}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Payment Info</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Method</span>
                  <span className="font-semibold text-gray-900 capitalize">{order.payment_method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold whitespace-nowrap capitalize ${order.payment_status === 'paid' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                    {String(order.payment_status || 'pending').replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Amount</span>
                  <span className="font-semibold text-gray-900">{formatMoney(order.total, order.currency)}</span>
                </div>
                <div className="flex justify-between">
                  {/* Transaction ID might be in metadata depending on callback */}
                  <span className="text-gray-600">Transaction</span>
                  <span className="text-sm text-gray-900 font-mono truncate max-w-[150px]">
                    {order.metadata?.paypal_capture_id ||
                      order.metadata?.paypal_order_id ||
                      order.metadata?.moolre_reference ||
                      order.payment_transaction_id ||
                      'N/A'}
                  </span>
                </div>
                {order.currency && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Currency</span>
                    <span className="font-semibold text-gray-900">{order.currency}</span>
                  </div>
                )}
              </div>
              {canMarkPaid && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => { setMarkPaidError(null); setShowMarkPaid(true); }}
                    className="w-full bg-blue-700 hover:bg-blue-800 text-white py-3 rounded-lg font-semibold transition-colors whitespace-nowrap flex items-center justify-center"
                  >
                    <i className="ri-checkbox-circle-line mr-2"></i>
                    Mark as paid
                  </button>
                  <p className="text-xs text-gray-500 mt-2">
                    Use this when the customer paid by cash, bank transfer, or mobile money confirmed by phone.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Notifications</h2>
              <p className="text-sm text-gray-600 mb-4">
                Resend email and SMS notifications to the customer about the current order status.
              </p>
              <button
                onClick={handleResendNotification}
                disabled={resendingNotification}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition-colors whitespace-nowrap disabled:opacity-50 flex items-center justify-center"
              >
                {resendingNotification ? (
                  <>
                    <i className="ri-loader-4-line animate-spin mr-2"></i>
                    Sending...
                  </>
                ) : (
                  <>
                    <i className="ri-notification-3-line mr-2"></i>
                    Resend Notifications
                  </>
                )}
              </button>
              <p className="text-xs text-gray-500 mt-2">
                Phone: {order.phone || shippingAddress.phone || 'Not provided'}
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Admin Notes</h2>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Add internal notes about this order..."
                rows={4}
                maxLength={500}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
              <button
                onClick={() => handleUpdateStatus()}
                disabled={statusUpdating}
                className="w-full mt-3 bg-gray-700 hover:bg-gray-800 text-white py-2 rounded-lg font-medium transition-colors whitespace-nowrap disabled:opacity-50"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      </div>

      {showMarkPaid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 no-print">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mark-paid-title"
            className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6"
          >
            <h2 id="mark-paid-title" className="text-lg font-bold text-gray-900 mb-2">
              Mark order {order.order_number} as paid?
            </h2>
            <p className="text-sm text-gray-700">
              You are confirming that <span className="font-semibold">{customerName}</span> has paid{' '}
              <span className="font-semibold">{formatMoney(order.total, order.currency)}</span> for order{' '}
              <span className="font-semibold">{order.order_number}</span>.
            </p>
            <p className="text-sm text-gray-600 mt-3">
              The order will move to Processing and the stock for its items will be reduced. This cannot be undone from this page.
            </p>
            {markPaidError && (
              <p className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{markPaidError}</p>
            )}
            <div className="mt-6 flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowMarkPaid(false)}
                disabled={markingPaid}
                className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:border-gray-400 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkAsPaid}
                disabled={markingPaid}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                {markingPaid ? 'Saving...' : `Yes, mark ${formatMoney(order.total, order.currency)} as paid`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
