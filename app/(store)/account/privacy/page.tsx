'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const ORDER_COLUMNS =
  'order_number, created_at, status, payment_status, currency, subtotal, shipping_total, discount_total, tax_total, total, shipping_method, payment_method, email, phone, shipping_address, billing_address, notes, order_items(product_name, variant_name, sku, quantity, unit_price, total_price)';

export default function PrivacySettingsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // This page is for signed-in customers only.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session) {
        router.replace('/auth/login');
        return;
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleExportData = async () => {
    setExporting(true);
    setExportMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/auth/login');
        return;
      }
      const user = session.user;

      const [profileResult, addressResult, orderResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('email, full_name, phone, date_of_birth, gender, created_at, updated_at')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('addresses')
          .select('label, full_name, phone, address_line1, address_line2, city, state, postal_code, country, is_default, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('orders')
          .select(ORDER_COLUMNS)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ]);

      // A file with a missing section would look complete, so stop instead.
      const failed = profileResult.error || addressResult.error || orderResult.error;
      if (failed) throw new Error(failed.message);

      const exportData = {
        exportedAt: new Date().toISOString(),
        account: {
          email: user.email || '',
          firstName: user.user_metadata?.first_name || '',
          lastName: user.user_metadata?.last_name || '',
          phone: user.user_metadata?.phone || user.phone || '',
          createdAt: user.created_at,
        },
        profile: profileResult.data || null,
        addresses: addressResult.data || [],
        orders: orderResult.data || [],
      };

      const dataBlob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `baddiecurves-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setExportMessage({ type: 'success', text: 'Your data file has been downloaded.' });
    } catch (err) {
      console.error('Data export failed:', err);
      setExportMessage({
        type: 'error',
        text: 'We could not prepare your data. Check your connection and try again.',
      });
    } finally {
      setExporting(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <i className="ri-loader-4-line animate-spin text-4xl text-blue-700"></i>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/account" aria-label="Back to account" className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors">
              <i className="ri-arrow-left-line text-xl"></i>
            </Link>
            <div>
              <h1 className="text-xl font-bold">Privacy & Data</h1>
              <p className="text-sm text-gray-600">Manage your personal information</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex gap-3">
            <i className="ri-shield-check-line text-xl text-blue-600 flex-shrink-0 mt-0.5"></i>
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">Your Privacy Matters</h3>
              <p className="text-sm text-blue-800">
                We are committed to protecting your personal information in compliance with GDPR, CCPA, and other privacy regulations.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold mb-4">Data Export</h2>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <i className="ri-download-cloud-line text-lg"></i>
                Download Your Data
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Get a copy of your profile, saved addresses and orders as a JSON file.
              </p>
              <button
                onClick={handleExportData}
                disabled={exporting}
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium whitespace-nowrap"
              >
                {exporting ? (
                  <>
                    <i className="ri-loader-4-line animate-spin mr-2"></i>
                    Preparing Export...
                  </>
                ) : (
                  <>
                    <i className="ri-download-line mr-2"></i>
                    Export My Data
                  </>
                )}
              </button>
              {exportMessage && (
                <p
                  role={exportMessage.type === 'error' ? 'alert' : 'status'}
                  className={`text-sm mt-3 ${exportMessage.type === 'error' ? 'text-red-700' : 'text-green-700'}`}
                >
                  {exportMessage.text}
                </p>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">What's Included?</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <i className="ri-check-line text-green-600 mt-0.5 flex-shrink-0"></i>
                  <span>Personal information (name, email, phone)</span>
                </li>
                <li className="flex items-start gap-2">
                  <i className="ri-check-line text-green-600 mt-0.5 flex-shrink-0"></i>
                  <span>Orders placed while signed in, with the items in each</span>
                </li>
                <li className="flex items-start gap-2">
                  <i className="ri-check-line text-green-600 mt-0.5 flex-shrink-0"></i>
                  <span>Saved addresses</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-lg font-bold mb-4 text-red-600">Delete Account</h2>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                <i className="ri-delete-bin-line text-lg"></i>
                Ask us to delete your account
              </h3>
              <p className="text-sm text-red-800 mb-4">
                Accounts are deleted by our team, not from this page. Send us a message from the email address on your account and say that you want your account deleted.
              </p>
              <Link
                href="/contact?subject=Delete%20my%20account"
                className="inline-block px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium whitespace-nowrap"
              >
                Contact Us to Delete
              </Link>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-bold mb-4">Your Privacy Rights</h2>
          <div className="space-y-4 text-sm text-gray-700">
            <div className="flex gap-3">
              <i className="ri-eye-line text-lg text-gray-400 flex-shrink-0"></i>
              <div>
                <h3 className="font-semibold mb-1">Right to Access</h3>
                <p className="text-gray-600">You can request and download all your personal data at any time.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <i className="ri-edit-line text-lg text-gray-400 flex-shrink-0"></i>
              <div>
                <h3 className="font-semibold mb-1">Right to Rectification</h3>
                <p className="text-gray-600">You can update and correct your personal information in account settings.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <i className="ri-delete-bin-line text-lg text-gray-400 flex-shrink-0"></i>
              <div>
                <h3 className="font-semibold mb-1">Right to Erasure</h3>
                <p className="text-gray-600">You can request complete deletion of your account and all data.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <i className="ri-file-shield-line text-lg text-gray-400 flex-shrink-0"></i>
              <div>
                <h3 className="font-semibold mb-1">Right to Data Portability</h3>
                <p className="text-gray-600">Export your data in a structured, machine-readable format.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-100 rounded-xl p-4">
          <p className="text-sm text-gray-600 text-center">
            Questions about privacy? Read our{' '}
            <Link href="/privacy" className="text-black font-medium hover:underline">
              Privacy Policy
            </Link>
            {' '}or{' '}
            <Link href="/contact" className="text-black font-medium hover:underline">
              contact support
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
