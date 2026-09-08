'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Status = {
  enabled: boolean;
  message: string;
  estimatedMinutes: number | null;
};

export default function MaintenancePage() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/site/status', { cache: 'no-store' });
        const json = await res.json();
        if (cancelled) return;
        setStatus({
          enabled: Boolean(json.enabled),
          message:
            json.message ||
            "We're currently performing scheduled maintenance to improve your shopping experience. We'll be back online shortly.",
          estimatedMinutes: json.estimatedMinutes ?? 30,
        });
      } catch {
        if (!cancelled) {
          setStatus({
            enabled: true,
            message:
              "We're currently performing scheduled maintenance to improve your shopping experience. We'll be back online shortly.",
            estimatedMinutes: 30,
          });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const message =
    status?.message ||
    "We're currently performing scheduled maintenance to improve your shopping experience. We'll be back online shortly.";
  const minutes = status?.estimatedMinutes;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-amber-50 flex items-center justify-center px-4">
      <div className="max-w-2xl mx-auto text-center">
        <div className="mb-8">
          <div className="w-32 h-32 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="ri-tools-line text-6xl text-blue-700"></i>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">We&apos;ll Be Right Back</h1>
          <p className="text-lg sm:text-xl text-gray-600 mb-8 leading-relaxed">{message}</p>
        </div>

        {minutes != null && minutes > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Expected Downtime</h2>
            <div className="flex items-center justify-center gap-3 text-blue-700">
              <i className="ri-time-line text-3xl"></i>
              <div className="text-left">
                <p className="text-sm text-gray-600">Estimated completion</p>
                <p className="text-2xl font-bold">{minutes} minutes</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-8 mb-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Need Immediate Assistance?</h3>
          <p className="text-gray-600 mb-6">Our team can still help with urgent order questions.</p>
          <a
            href="mailto:tashaofori@yahoo.com"
            className="inline-flex items-center gap-2 bg-white text-gray-900 px-6 py-3 rounded-full font-medium hover:bg-gray-50 transition-colors border border-gray-200"
          >
            <i className="ri-mail-line"></i>
            Email Support
          </a>
        </div>

        {status && !status.enabled && (
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-blue-700 font-semibold hover:underline"
          >
            Store is back — continue shopping <i className="ri-arrow-right-line" />
          </Link>
        )}

        <p className="text-gray-500 text-sm mt-8">Thank you for your patience — BADDIECURVES</p>
      </div>
    </div>
  );
}
