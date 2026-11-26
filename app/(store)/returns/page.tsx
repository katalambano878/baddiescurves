'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useRecaptcha } from '@/hooks/useRecaptcha';

const reasons = [
  'Wrong size/fit',
  'Wrong item received',
  'Defective/damaged item',
  'Not as described',
  'Changed my mind',
  'Better price elsewhere',
  'No longer needed',
  'Other'
];

type FormState = {
  orderNumber: string;
  name: string;
  email: string;
  phone: string;
  items: string;
  reason: string;
  details: string;
};

const inputClass = (error?: string) =>
  `w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
    error ? 'border-red-500' : 'border-gray-300'
  }`;

export default function ReturnsPortalPage() {
  const router = useRouter();
  const { getToken, verifying } = useRecaptcha();
  const [form, setForm] = useState<FormState>({
    orderNumber: '',
    name: '',
    email: '',
    phone: '',
    items: '',
    reason: '',
    details: ''
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitError, setSubmitError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const setField = (key: keyof FormState, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    const orderNumber = form.orderNumber.trim();
    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    const items = form.items.trim();
    const details = form.details.trim();

    const newErrors: Partial<Record<keyof FormState, string>> = {};
    if (!orderNumber) newErrors.orderNumber = 'Enter your order number. It is in your order confirmation.';
    if (!name) newErrors.name = 'Enter your name.';
    if (!email) newErrors.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = 'Enter a valid email address.';
    if (phone.replace(/\D/g, '').length < 7) newErrors.phone = 'Enter a phone number we can reach you on.';
    if (!items) newErrors.items = 'Tell us which items you want to return.';
    if (!form.reason) newErrors.reason = 'Choose a reason.';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsLoading(true);
    try {
      const isHuman = await getToken('return_request');
      if (!isHuman) {
        setSubmitError('Security check failed. Please try again.');
        return;
      }

      const subject = `Return request – ${orderNumber}`;
      const message = [
        `Order number: ${orderNumber}`,
        `Phone: ${phone}`,
        `Items to return: ${items}`,
        `Reason: ${form.reason}`,
        details ? `Details: ${details}` : ''
      ].filter(Boolean).join('\n');

      const { error } = await supabase
        .from('contact_submissions')
        .insert({ name, email, phone, subject, message });
      if (error) throw error;

      // Tell the shop by email as well (same notification the contact form uses).
      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'contact', payload: { name, email, phone, subject, message } })
      }).catch(err => console.error('Return request notification error:', err));

      try {
        sessionStorage.setItem('return_request_sent', orderNumber);
      } catch {
        // Storage blocked: the confirmation page falls back to this form.
      }
      router.push('/returns/confirmation');
    } catch (err) {
      console.error('Return request failed:', err);
      setSubmitError('Your request was not sent. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Returns Portal</h1>
          <p className="text-gray-600 mb-6">Start your return or exchange — BADDIECURVES accepts returns within the US for eligible items. All returns are processed as store credit.</p>

          <div className="mb-8 p-6 bg-white rounded-xl border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Additional Return Policy</h2>
            <div className="text-gray-600 text-sm space-y-4 leading-relaxed">
              <p>To help ensure you get the best fit, BADDIECURVES accepts returns within the United States for eligible items returned in new condition with original packaging and tags. Additional restocking fees may apply to items not returned in original condition (tags and bagging). The customer is responsible for all shipping fees to and from. If you need to return more than one item, it is suggested that all items are processed in the same request and sent back in one package with the return label.</p>
              <p>This does not guarantee that you will be able to exchange for the exact same item. Returns are only eligible for options available on the return platform at the time the return is submitted. If we are out of stock of a particular product, we may issue you a store credit for a different item (meaning you may have to utilize the credit toward a different color or product). If a limited-edition product is approved for return, a store credit will be issued for a replacement product.</p>
              <p>We will physically inspect each return and we reserve the right to refuse an item if it does not pass inspection. In order for an exchange to pass inspection, the item that you are returning should be in new condition and inside the original packaging with all original tags attached. Exchanges should show no signs of wear, odors, stains (glitters, oils, etc) and no dampness from sweat or otherwise. If during inspection we find that the item is not in new condition (free of odors, stains, glitters, marks, etc) a credit or replacement will not be issued and you will be responsible for the cost of having the item shipped back to you. If the item is in new condition you will receive a store credit for your return once approved.</p>
              <p>In order for your return to be processed, we ask that you follow the steps listed on our returns page closely. All returns will be processed as store credit for you to utilize to repurchase your sizing. To initiate the exchange, please send an email and send a copy of your order confirmation back with your exchange item details. Please note that you will be responsible for shipping charges.</p>
              <p>If the proper order information is not provided, the return portal is not utilized, or proper return steps are not followed we will not be able to locate your return. We are not responsible for items shipped back without proper identification and we will not be able to issue you a refund if we cannot properly identify your return.</p>
              <p>Once your item is received we have to inspect the item. Processing time for returns averages 4–7 business days. Once approved, we will send you a store credit for your item to the email address on file. Please follow the steps on the returns page closely to ensure we receive your return.</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Request a Return</h2>
            <p className="text-gray-600 mb-6">Send us the details below. We will reply by email or phone.</p>

            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              <div>
                <label htmlFor="return-order" className="block text-sm font-semibold text-gray-900 mb-2">
                  Order Number *
                </label>
                <input
                  id="return-order"
                  type="text"
                  value={form.orderNumber}
                  onChange={(e) => setField('orderNumber', e.target.value)}
                  maxLength={60}
                  className={inputClass(errors.orderNumber)}
                  placeholder="ORD-..."
                />
                {errors.orderNumber && <p className="text-sm text-red-600 mt-2">{errors.orderNumber}</p>}
              </div>

              <div>
                <label htmlFor="return-name" className="block text-sm font-semibold text-gray-900 mb-2">
                  Full Name *
                </label>
                <input
                  id="return-name"
                  type="text"
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  maxLength={100}
                  className={inputClass(errors.name)}
                />
                {errors.name && <p className="text-sm text-red-600 mt-2">{errors.name}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="return-email" className="block text-sm font-semibold text-gray-900 mb-2">
                    Email Address *
                  </label>
                  <input
                    id="return-email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    maxLength={200}
                    className={inputClass(errors.email)}
                    placeholder="you@example.com"
                  />
                  {errors.email && <p className="text-sm text-red-600 mt-2">{errors.email}</p>}
                </div>

                <div>
                  <label htmlFor="return-phone" className="block text-sm font-semibold text-gray-900 mb-2">
                    Phone Number *
                  </label>
                  <input
                    id="return-phone"
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    maxLength={30}
                    className={inputClass(errors.phone)}
                  />
                  {errors.phone && <p className="text-sm text-red-600 mt-2">{errors.phone}</p>}
                </div>
              </div>

              <div>
                <label htmlFor="return-items" className="block text-sm font-semibold text-gray-900 mb-2">
                  Items to Return *
                </label>
                <textarea
                  id="return-items"
                  rows={3}
                  value={form.items}
                  onChange={(e) => setField('items', e.target.value)}
                  maxLength={1000}
                  className={`${inputClass(errors.items)} resize-none`}
                  placeholder="Item name, size and color for each item"
                ></textarea>
                {errors.items && <p className="text-sm text-red-600 mt-2">{errors.items}</p>}
              </div>

              <div>
                <label htmlFor="return-reason" className="block text-sm font-semibold text-gray-900 mb-2">
                  Reason for Return *
                </label>
                <select
                  id="return-reason"
                  value={form.reason}
                  onChange={(e) => setField('reason', e.target.value)}
                  className={`${inputClass(errors.reason)} pr-8`}
                >
                  <option value="">Select a reason</option>
                  {reasons.map((reason) => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </select>
                {errors.reason && <p className="text-sm text-red-600 mt-2">{errors.reason}</p>}
              </div>

              <div>
                <label htmlFor="return-details" className="block text-sm font-semibold text-gray-900 mb-2">
                  More Details <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <textarea
                  id="return-details"
                  rows={3}
                  value={form.details}
                  onChange={(e) => setField('details', e.target.value)}
                  maxLength={1000}
                  className={`${inputClass()} resize-none`}
                ></textarea>
              </div>

              {submitError && (
                <p className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm" role="alert">
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                disabled={isLoading || verifying}
                className="w-full bg-blue-700 hover:bg-blue-800 text-white py-4 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isLoading || verifying ? 'Sending...' : 'Send Return Request'}
              </button>
            </form>

            <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start space-x-3">
                <i className="ri-information-line text-xl text-blue-700 mt-0.5"></i>
                <div className="text-sm text-blue-700">
                  <p className="font-semibold mb-1">BADDIECURVES Return Policy Highlights</p>
                  <ul className="space-y-1">
                    <li>• Returns accepted within the United States for eligible items in new condition with original packaging and tags.</li>
                    <li>• Items must be in new condition — no wear, odors, stains, glitter, or dampness. Restocking fees may apply if not in original condition.</li>
                    <li>• Returns are processed as <strong>store credit</strong>. Exchanges depend on options available on the return platform at the time you submit.</li>
                    <li>• Customer is responsible for shipping fees to and from. Send all items in one package when returning multiple items.</li>
                    <li>• We physically inspect each return; processing takes 4–7 business days after we receive the item.</li>
                    <li>• Follow the steps on this returns page and include your order confirmation when initiating a return.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
  );
}
