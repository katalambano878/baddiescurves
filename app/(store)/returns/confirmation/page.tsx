'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ReturnConfirmationPage() {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  // Only someone who has just sent the form should see "we have your request".
  useEffect(() => {
    let sent: string | null = null;
    try {
      sent = sessionStorage.getItem('return_request_sent');
    } catch {
      sent = null;
    }
    if (!sent) {
      router.replace('/returns');
      return;
    }
    setOrderNumber(sent);
  }, [router]);

  if (!orderNumber) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
        <i className="ri-loader-4-line animate-spin text-4xl text-blue-700"></i>
      </main>
    );
  }

  return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="w-20 h-20 flex items-center justify-center bg-blue-100 rounded-full mx-auto mb-6">
              <i className="ri-check-line text-4xl text-blue-700"></i>
            </div>

            <h1 className="text-3xl font-bold text-gray-900 mb-4">We have your request</h1>
            <p className="text-gray-600 mb-2">We will reply by email or phone.</p>
            <p className="text-sm text-gray-500 mb-8 break-words">
              Order number: <span className="font-semibold">{orderNumber}</span>
            </p>

            <p className="text-sm text-gray-600 mb-8">
              Our return policy is on the{' '}
              <Link href="/returns" className="text-blue-700 hover:text-blue-900 font-semibold">returns page</Link>.
            </p>

            <div className="space-y-3">
              <Link
                href="/shop"
                className="block w-full bg-blue-700 hover:bg-blue-800 text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                Continue Shopping
              </Link>
              <Link
                href="/contact"
                className="block text-blue-700 hover:text-blue-900 font-semibold whitespace-nowrap"
              >
                Need Help? Contact Us
              </Link>
            </div>
          </div>
        </div>
      </main>
  );
}
