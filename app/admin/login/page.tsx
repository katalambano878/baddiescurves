'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useRecaptcha } from '@/hooks/useRecaptcha';
import { setAuthCookies } from '@/lib/auth-cookies';

/**
 * Where to go after login. Only an internal admin path is accepted
 * ("/admin" or "/admin/..."); anything else falls back to the dashboard.
 */
function safeAdminPath(raw: string | null): string {
  const fallback = '/admin';
  if (!raw || !raw.startsWith('/admin')) return fallback;
  // No other site, no protocol tricks, no control characters
  const hasControlChar = raw.split('').some((ch) => ch.charCodeAt(0) < 32);
  if (raw.startsWith('//') || raw.includes('\\') || raw.includes('://') || hasControlChar) return fallback;
  const pathOnly = raw.split(/[?#]/)[0];
  if (pathOnly !== '/admin' && !pathOnly.startsWith('/admin/')) return fallback;
  if (pathOnly === '/admin/login' || pathOnly.startsWith('/admin/login/')) return fallback;
  return raw;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ title: string; text: string } | null>(null);
  const [redirectTo, setRedirectTo] = useState('/admin');
  const { getToken, verifying } = useRecaptcha();

  // Read ?redirect= and ?error= once the page is in the browser.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRedirectTo(safeAdminPath(params.get('redirect')));

    const reason = params.get('error');
    if (reason === 'unauthorized') {
      setNotice({ title: 'No admin access', text: 'This account does not have admin access.' });
    } else if (reason === 'session_expired') {
      setNotice({ title: 'Session expired', text: 'Your session has expired. Please sign in again.' });
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice(null);
    setIsLoading(true);

    // reCAPTCHA verification
    const isHuman = await getToken('admin_login');
    if (!isHuman) {
      setError('Security verification failed. Please try again.');
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      if (data.session) {
        // Cookie must work on http (staging/local) and https — Secure only when HTTPS
        setAuthCookies(data.session.access_token, data.session.refresh_token);
        router.replace(redirectTo);
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <Image src="/logo.png?v=4" alt="BADDIECURVES" width={90} height={28} className="h-7 w-auto mx-auto object-contain" style={{ width: 'auto', height: 'auto' }} />
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-6 mb-2">Admin Login</h1>
          <p className="text-gray-600">Sign in to access the admin dashboard</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {notice && !error && (
            <div role="alert" className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-3">
              <i className="ri-information-line text-amber-600 text-xl mt-0.5"></i>
              <div>
                <p className="text-amber-900 font-semibold">{notice.title}</p>
                <p className="text-amber-800 text-sm mt-1">{notice.text}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
              <i className="ri-error-warning-line text-red-600 text-xl mt-0.5"></i>
              <div>
                <p className="text-red-800 font-semibold">Login Failed</p>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Email Address
              </label>
              <div className="relative">
                <i className="ri-mail-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="admin@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Password
              </label>
              <div className="relative">
                <i className="ri-lock-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center"
                >
                  <i className={`${showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} text-lg`}></i>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || verifying}
              className="w-full bg-blue-700 hover:bg-blue-800 text-white py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isLoading || verifying ? (
                <span className="flex items-center justify-center space-x-2">
                  <i className="ri-loader-4-line animate-spin"></i>
                  <span>{verifying ? 'Verifying...' : 'Signing in...'}</span>
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Admin access is restricted to users with admin/staff role */}
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-gray-600 hover:text-blue-700 transition-colors whitespace-nowrap">
            <i className="ri-arrow-left-line mr-2"></i>
            Back to Store
          </Link>
        </div>
      </div>
    </div>
  );
}
