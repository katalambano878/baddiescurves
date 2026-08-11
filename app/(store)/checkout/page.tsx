'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import CheckoutSteps from '@/components/CheckoutSteps';
import OrderSummary from '@/components/OrderSummary';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useRecaptcha } from '@/hooks/useRecaptcha';
import { useIsGhana } from '@/lib/currency';
import {
  GHANA_REGIONS,
  INTERNATIONAL_COUNTRIES,
  DEFAULT_SHIPPING_RATES,
  mergeShippingRates,
  quoteShipping,
  type ShippingRatesConfig,
} from '@/lib/shipping';
import {
  emptyShippingAddress,
  normalizeShippingAddress,
  validateShippingAddress,
} from '@/lib/shipping-address';

export default function CheckoutPage() {
  usePageTitle('Checkout');
  const router = useRouter();
  const { cart, subtotal: cartSubtotal, clearCart } = useCart();
  const isGhana = useIsGhana();

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutType, setCheckoutType] = useState<'guest' | 'account'>('guest');
  const [saveAddress, setSaveAddress] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { getToken, verifying } = useRecaptcha();

  const [shippingData, setShippingData] = useState(emptyShippingAddress());
  const [rates, setRates] = useState<ShippingRatesConfig>(DEFAULT_SHIPPING_RATES);

  const [deliveryMethod, setDeliveryMethod] = useState('pickup');
  const paymentMethod: 'moolre' | 'paypal' = isGhana ? 'moolre' : 'paypal';
  const orderCurrency = isGhana ? 'GHS' : 'USD';
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        setCheckoutType('account');
        setShippingData((prev) => ({ ...prev, email: session.user.email || '' }));
      }
    }
    checkUser();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadRates() {
      try {
        const res = await fetch('/api/shipping/rates', { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && json?.rates) setRates(mergeShippingRates(json.rates));
      } catch {
        /* keep defaults */
      }
    }
    loadRates();
    return () => {
      cancelled = true;
    };
  }, []);

  // International checkout: doorstep/shipping by country; Ghana keeps pickup/doorstep options
  useEffect(() => {
    if (!isGhana && deliveryMethod === 'pickup') {
      setDeliveryMethod('international');
    }
    if (isGhana && deliveryMethod === 'international') {
      setDeliveryMethod('pickup');
    }
  }, [isGhana, deliveryMethod]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  const quote = useMemo(
    () =>
      quoteShipping({
        isGhana,
        deliveryMethod,
        countryCode: shippingData.countryCode,
        rates,
      }),
    [isGhana, deliveryMethod, shippingData.countryCode, rates]
  );

  const subtotal = cartSubtotal;
  const shippingCost = quote.amount;
  const tax = 0;
  const total = subtotal + shippingCost + tax;

  const updateField = (field: keyof typeof shippingData, value: string) => {
    setShippingData((prev) => ({ ...prev, [field]: value }));
  };

  const validateShipping = () => {
    const newErrors = validateShippingAddress(shippingData, isGhana);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinueToDelivery = () => {
    if (validateShipping()) setCurrentStep(2);
  };

  const handleContinueToPayment = async () => {
    if (!isGhana && !shippingData.countryCode) {
      setErrors({ countryCode: 'Country / region is required' });
      setCurrentStep(1);
      return;
    }
    await handlePlaceOrder();
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      alert('Your cart is empty');
      return;
    }

    setIsLoading(true);

    const isHuman = await getToken('checkout');
    if (!isHuman) {
      alert('Security verification failed. Please try again.');
      setIsLoading(false);
      return;
    }

    try {
      const address = normalizeShippingAddress(shippingData, isGhana);
      const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const trackingId = Array.from({ length: 6 }, () =>
        'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
      ).join('');
      const trackingNumber = `SLI-${trackingId}`;

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([
          {
            order_number: orderNumber,
            user_id: user?.id || null,
            email: address.email,
            phone: address.phone,
            status: 'pending',
            payment_status: 'pending',
            currency: orderCurrency,
            subtotal,
            tax_total: tax,
            shipping_total: shippingCost,
            discount_total: 0,
            total,
            shipping_method: deliveryMethod,
            payment_method: paymentMethod,
            shipping_address: address,
            billing_address: address,
            metadata: {
              guest_checkout: !user,
              first_name: address.firstName,
              last_name: address.lastName,
              tracking_number: trackingNumber,
              payment_method: paymentMethod,
              shipping_quote_label: quote.label,
              detected_market: isGhana ? 'GH' : 'INTL',
              ship_to_country: address.countryCode,
            },
          },
        ])
        .select()
        .single();

      if (orderError) throw orderError;

      const isValidUUID = (str: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

      const orderItems = [];
      const productIds = cart.map((item) => item.id).filter((id) => isValidUUID(id));
      const { data: productsData } =
        productIds.length > 0
          ? await supabase.from('products').select('id, metadata').in('id', productIds)
          : { data: [] };
      const productMetaMap = new Map((productsData || []).map((p: any) => [p.id, p.metadata]));

      for (const item of cart) {
        let productId = item.id;

        if (!isValidUUID(productId)) {
          const { data: product } = await supabase
            .from('products')
            .select('id, metadata')
            .or(`slug.eq.${productId},id.eq.${productId}`)
            .single();

          if (product) {
            productId = product.id;
            productMetaMap.set(product.id, product.metadata);
          } else {
            throw new Error(
              `Product not found: ${item.name}. Please remove it from your cart and try again.`
            );
          }
        }

        const prodMeta = productMetaMap.get(productId);

        orderItems.push({
          order_id: order.id,
          product_id: productId,
          product_name: item.name,
          variant_name: item.variant,
          quantity: item.quantity,
          unit_price: item.price,
          total_price: item.price * item.quantity,
          metadata: {
            image: item.image,
            slug: item.slug,
            preorder_shipping: prodMeta?.preorder_shipping || null,
          },
        });
      }

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      const fullName = `${address.firstName} ${address.lastName}`.trim();
      await supabase.rpc('upsert_customer_from_order', {
        p_email: address.email,
        p_phone: address.phone,
        p_full_name: fullName,
        p_first_name: address.firstName,
        p_last_name: address.lastName,
        p_user_id: user?.id || null,
        p_address: address,
      });

      if (paymentMethod === 'moolre' || paymentMethod === 'paypal') {
        try {
          const endpoint =
            paymentMethod === 'paypal' ? '/api/payment/paypal' : '/api/payment/moolre';

          const paymentRes = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: orderNumber,
              customerEmail: address.email,
            }),
          });

          const paymentResult = await paymentRes.json();

          if (!paymentResult.success) {
            throw new Error(paymentResult.message || 'Payment initialization failed');
          }

          clearCart();
          window.location.href = paymentResult.url;
          return;
        } catch (paymentErr: any) {
          console.error('Payment Error:', paymentErr);
          alert('Failed to initialize payment: ' + paymentErr.message);
          setIsLoading(false);
          return;
        }
      }

      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'order_created',
          orderId: order.id,
        }),
      }).catch(() => {});

      clearCart();
      router.push(`/order-success?order=${orderNumber}`);
    } catch (error: any) {
      console.error('Checkout error:', error);
      alert(error?.message || 'Checkout failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (cart.length === 0 && !isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 py-20">
        <div className="max-w-md mx-auto text-center px-4">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
            <i className="ri-shopping-cart-line text-4xl text-gray-300"></i>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Your cart is empty</h1>
          <p className="text-gray-600 mb-8">Add some items to start the checkout process.</p>
          <Link
            href="/shop"
            className="inline-block bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-800 transition-colors"
          >
            Return to Shop
          </Link>
        </div>
      </main>
    );
  }

  const inputClass = (field: string) =>
    `w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
      errors[field] ? 'border-red-500' : 'border-gray-300'
    }`;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link
            href="/cart"
            className="text-gray-600 hover:text-gray-900 font-medium inline-flex items-center whitespace-nowrap"
          >
            <i className="ri-arrow-left-line mr-2"></i>
            Back to Cart
          </Link>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Checkout</h1>
        <p className="text-sm text-gray-500 mb-8">
          {isGhana
            ? 'Ghana checkout — prices in GH₵, pay with Mobile Money.'
            : 'International checkout — prices in USD, pay with PayPal. Enter your full shipping address.'}
        </p>

        {currentStep === 1 && (
          <div className="mb-8 bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Checkout As</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <button
                onClick={() => !user && setCheckoutType('guest')}
                className={`p-6 rounded-xl border-2 transition-all text-left cursor-pointer ${
                  checkoutType === 'guest'
                    ? 'border-blue-700 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                } ${user ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!!user}
              >
                <div className="flex items-center justify-between mb-3">
                  <i className="ri-user-line text-3xl text-blue-700"></i>
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      checkoutType === 'guest' ? 'border-blue-700 bg-blue-700' : 'border-gray-300'
                    }`}
                  >
                    {checkoutType === 'guest' && <i className="ri-check-line text-white text-sm"></i>}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Guest Checkout</h3>
                <p className="text-sm text-gray-600">Quick checkout without creating an account</p>
              </button>

              <button
                onClick={() => setCheckoutType('account')}
                className={`p-6 rounded-xl border-2 transition-all text-left cursor-pointer ${
                  checkoutType === 'account'
                    ? 'border-blue-700 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <i className="ri-account-circle-line text-3xl text-blue-700"></i>
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      checkoutType === 'account' ? 'border-blue-700 bg-blue-700' : 'border-gray-300'
                    }`}
                  >
                    {checkoutType === 'account' && (
                      <i className="ri-check-line text-white text-sm"></i>
                    )}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {user ? 'My Account' : 'Create Account'}
                </h3>
                <p className="text-sm text-gray-600">
                  {user ? `Logged in as ${user.email}` : 'Save info and track orders'}
                </p>
              </button>
            </div>
          </div>
        )}

        <CheckoutSteps currentStep={currentStep} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          <div className="lg:col-span-2">
            {currentStep === 1 && (
              <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Shipping Information</h2>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        First Name *
                      </label>
                      <input
                        type="text"
                        value={shippingData.firstName}
                        onChange={(e) => updateField('firstName', e.target.value)}
                        className={inputClass('firstName')}
                        placeholder="John"
                      />
                      {errors.firstName && (
                        <p className="text-sm text-red-600 mt-1">{errors.firstName}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Last Name *
                      </label>
                      <input
                        type="text"
                        value={shippingData.lastName}
                        onChange={(e) => updateField('lastName', e.target.value)}
                        className={inputClass('lastName')}
                        placeholder="Doe"
                      />
                      {errors.lastName && (
                        <p className="text-sm text-red-600 mt-1">{errors.lastName}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      value={shippingData.email}
                      readOnly={!!user}
                      onChange={(e) => updateField('email', e.target.value)}
                      className={`${inputClass('email')} ${user ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                      placeholder="you@example.com"
                    />
                    {errors.email && <p className="text-sm text-red-600 mt-1">{errors.email}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Phone Number *
                    </label>
                    <input
                      type="tel"
                      value={shippingData.phone}
                      onChange={(e) => updateField('phone', e.target.value)}
                      className={inputClass('phone')}
                      placeholder={isGhana ? '+233 XX XXX XXXX' : '+1 XXX XXX XXXX'}
                    />
                    {errors.phone && <p className="text-sm text-red-600 mt-1">{errors.phone}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      {isGhana ? 'Street Address *' : 'Full Address *'}
                    </label>
                    <input
                      type="text"
                      value={shippingData.address}
                      onChange={(e) => updateField('address', e.target.value)}
                      className={inputClass('address')}
                      placeholder={
                        isGhana
                          ? 'House number and street name'
                          : 'Street, apartment, suite, etc.'
                      }
                    />
                    {errors.address && (
                      <p className="text-sm text-red-600 mt-1">{errors.address}</p>
                    )}
                  </div>

                  {isGhana ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          City *
                        </label>
                        <input
                          type="text"
                          value={shippingData.city}
                          onChange={(e) => updateField('city', e.target.value)}
                          className={inputClass('city')}
                          placeholder="Accra"
                        />
                        {errors.city && <p className="text-sm text-red-600 mt-1">{errors.city}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Region *
                        </label>
                        <select
                          value={shippingData.region}
                          onChange={(e) => updateField('region', e.target.value)}
                          className={`${inputClass('region')} bg-white`}
                        >
                          <option value="">Select Region</option>
                          {GHANA_REGIONS.map((region) => (
                            <option key={region} value={region}>
                              {region}
                            </option>
                          ))}
                        </select>
                        {errors.region && (
                          <p className="text-sm text-red-600 mt-1">{errors.region}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          City *
                        </label>
                        <input
                          type="text"
                          value={shippingData.city}
                          onChange={(e) => updateField('city', e.target.value)}
                          className={inputClass('city')}
                          placeholder="City"
                        />
                        {errors.city && <p className="text-sm text-red-600 mt-1">{errors.city}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          State
                        </label>
                        <input
                          type="text"
                          value={shippingData.state}
                          onChange={(e) => updateField('state', e.target.value)}
                          className={inputClass('state')}
                          placeholder="State / Province"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Delivery Note
                        </label>
                        <input
                          type="text"
                          value={shippingData.deliveryNote}
                          onChange={(e) => updateField('deliveryNote', e.target.value)}
                          className={inputClass('deliveryNote')}
                          placeholder="Landmark, instructions…"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Country / Region *
                        </label>
                        <select
                          value={shippingData.countryCode}
                          onChange={(e) => updateField('countryCode', e.target.value)}
                          className={`${inputClass('countryCode')} bg-white`}
                        >
                          <option value="">Select country...</option>
                          {INTERNATIONAL_COUNTRIES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        {errors.countryCode && (
                          <p className="text-sm text-red-600 mt-1">{errors.countryCode}</p>
                        )}
                        {shippingData.countryCode && (
                          <p className="text-xs text-gray-500 mt-2">
                            Shipping estimate: ${quote.amount.toFixed(2)} USD (
                            {quote.label})
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Postal / ZIP Code
                        </label>
                        <input
                          type="text"
                          value={shippingData.postalCode}
                          onChange={(e) => updateField('postalCode', e.target.value)}
                          className={inputClass('postalCode')}
                          placeholder="Optional"
                        />
                      </div>
                    </>
                  )}

                  {isGhana && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Delivery Note
                      </label>
                      <input
                        type="text"
                        value={shippingData.deliveryNote}
                        onChange={(e) => updateField('deliveryNote', e.target.value)}
                        className={inputClass('deliveryNote')}
                        placeholder="Landmark, gate color, instructions…"
                      />
                    </div>
                  )}

                  {checkoutType === 'account' && (
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveAddress}
                        onChange={(e) => setSaveAddress(e.target.checked)}
                        className="w-5 h-5 text-blue-700 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">
                        Save this address for future orders
                      </span>
                    </label>
                  )}
                </div>

                <button
                  onClick={handleContinueToDelivery}
                  className="w-full mt-6 bg-blue-700 hover:bg-blue-800 text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer"
                >
                  Continue to Delivery
                </button>
              </div>
            )}

            {currentStep === 2 && (
              <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Delivery Method</h2>
                <div className="space-y-4">
                  {isGhana ? (
                    <>
                      <label
                        className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                          deliveryMethod === 'pickup'
                            ? 'border-blue-700 bg-blue-50'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        <div className="flex items-center space-x-4">
                          <input
                            type="radio"
                            name="delivery"
                            value="pickup"
                            checked={deliveryMethod === 'pickup'}
                            onChange={(e) => setDeliveryMethod(e.target.value)}
                            className="w-5 h-5 text-blue-700"
                          />
                          <div>
                            <p className="font-semibold text-gray-900">Store Pickup</p>
                            <p className="text-sm text-gray-600">
                              Pick up from our store — Ready in 24 hours
                            </p>
                          </div>
                        </div>
                        <p className="font-bold text-blue-700">
                          {rates.ghana.pickup === 0 ? 'FREE' : `GH₵ ${rates.ghana.pickup}`}
                        </p>
                      </label>

                      <label
                        className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                          deliveryMethod === 'doorstep'
                            ? 'border-blue-700 bg-blue-50'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        <div className="flex items-center space-x-4">
                          <input
                            type="radio"
                            name="delivery"
                            value="doorstep"
                            checked={deliveryMethod === 'doorstep'}
                            onChange={(e) => setDeliveryMethod(e.target.value)}
                            className="w-5 h-5 text-blue-700"
                          />
                          <div>
                            <p className="font-semibold text-gray-900">Doorstep Delivery</p>
                            <p className="text-sm text-gray-600">
                              {rates.ghana.doorstep > 0
                                ? 'Local delivery to your address'
                                : 'We will contact you with the delivery cost'}
                            </p>
                          </div>
                        </div>
                        <p
                          className={`font-semibold text-sm ${
                            rates.ghana.doorstep > 0 ? 'text-gray-900 font-bold' : 'text-amber-600'
                          }`}
                        >
                          {rates.ghana.doorstep > 0
                            ? `GH₵ ${rates.ghana.doorstep}`
                            : 'At a Cost'}
                        </p>
                      </label>

                      <label
                        className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                          deliveryMethod === 'accra'
                            ? 'border-blue-700 bg-blue-50'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        <div className="flex items-center space-x-4">
                          <input
                            type="radio"
                            name="delivery"
                            value="accra"
                            checked={deliveryMethod === 'accra'}
                            onChange={(e) => setDeliveryMethod(e.target.value)}
                            className="w-5 h-5 text-blue-700"
                          />
                          <div>
                            <p className="font-semibold text-gray-900">Accra Delivery</p>
                            <p className="text-sm text-gray-600">Delivery within Accra</p>
                          </div>
                        </div>
                        <p className="font-bold text-gray-900">GH₵ {rates.ghana.accra}</p>
                      </label>

                      <label
                        className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                          deliveryMethod === 'outside_accra'
                            ? 'border-blue-700 bg-blue-50'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        <div className="flex items-center space-x-4">
                          <input
                            type="radio"
                            name="delivery"
                            value="outside_accra"
                            checked={deliveryMethod === 'outside_accra'}
                            onChange={(e) => setDeliveryMethod(e.target.value)}
                            className="w-5 h-5 text-blue-700"
                          />
                          <div>
                            <p className="font-semibold text-gray-900">Outside Accra</p>
                            <p className="text-sm text-gray-600">
                              Delivery to bus stations (VIP, OA, STC, etc.)
                            </p>
                          </div>
                        </div>
                        <p className="font-bold text-gray-900">
                          GH₵ {rates.ghana.outside_accra}
                        </p>
                      </label>
                    </>
                  ) : (
                    <div className="p-4 border-2 border-blue-700 bg-blue-50 rounded-lg">
                      <p className="font-semibold text-gray-900">International Shipping</p>
                      <p className="text-sm text-gray-600 mt-1">
                        Ships to {shippingData.country || 'your selected country'}
                        {shippingData.city ? ` · ${shippingData.city}` : ''}
                        {shippingData.state ? `, ${shippingData.state}` : ''}
                      </p>
                      <p className="font-bold text-blue-700 mt-3">
                        ${shippingCost.toFixed(2)} USD
                      </p>
                      <button
                        type="button"
                        onClick={() => setCurrentStep(1)}
                        className="text-sm text-blue-700 underline mt-2"
                      >
                        Change country / address
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-sm text-gray-600 mt-4">
                  {isGhana
                    ? 'Ghana customers pay securely with Mobile Money (Moolre) in GH₵.'
                    : 'International customers pay securely with PayPal in USD.'}
                </p>

                <div className="flex flex-col-reverse md:flex-row gap-4 mt-6">
                  <button
                    onClick={() => setCurrentStep(1)}
                    disabled={isLoading}
                    className="flex-1 border-2 border-gray-300 hover:border-gray-400 text-gray-700 py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleContinueToPayment}
                    disabled={isLoading || verifying}
                    className="flex-1 bg-blue-700 hover:bg-blue-800 text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-70 flex items-center justify-center"
                  >
                    {isLoading ? (
                      <>
                        <svg
                          className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Processing...
                      </>
                    ) : isGhana ? (
                      'Pay with Mobile Money'
                    ) : (
                      <>
                        <i className="ri-paypal-line mr-2 text-xl"></i>
                        Pay with PayPal
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <OrderSummary
              items={cart}
              subtotal={subtotal}
              shipping={shippingCost}
              tax={tax}
              total={total}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
