'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';

const MIN_PASSWORD_LENGTH = 8; // same rule as sign-up

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = (searchParams.get('token') || '').trim();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [formError, setFormError] = useState('');
  // Set when the link itself is the problem (missing, expired or already used).
  const [linkError, setLinkError] = useState(
    token ? '' : 'This reset link is incomplete. Request a new one.'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const newErrors: { password?: string; confirmPassword?: string } = {};
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      newErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }
    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsLoading(true);
    try {
      const res = await fetch('/auth/v1/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setIsDone(true);
        return;
      }

      const body = await res.json().catch(() => null);
      const code = body?.error;
      if (code === 'expired_token' || code === 'invalid_token') {
        setLinkError(
          code === 'expired_token'
            ? 'This reset link has expired. Request a new one.'
            : 'This reset link is not valid or has already been used. Request a new one.'
        );
      } else if (code === 'weak_password') {
        setErrors({ password: body?.message || `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      } else if (res.status === 429) {
        setFormError(body?.message || 'Too many attempts. Please wait a few minutes and try again.');
      } else {
        setFormError('We could not save your new password. Please try again.');
      }
    } catch {
      setFormError('Connection problem. Check your internet and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isDone) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <div className="w-16 h-16 flex items-center justify-center bg-blue-100 rounded-full mx-auto mb-6">
          <i className="ri-check-line text-3xl text-blue-700"></i>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Password changed</h1>
        <p className="text-gray-600 mb-8">Sign in with your new password.</p>
        <Link
          href="/auth/login"
          className="inline-block bg-blue-700 hover:bg-blue-800 text-white px-8 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
        >
          Sign In
        </Link>
      </div>
    );
  }

  if (linkError) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <div className="w-16 h-16 flex items-center justify-center bg-red-50 rounded-full mx-auto mb-6">
          <i className="ri-error-warning-line text-3xl text-red-600"></i>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">This link cannot be used</h1>
        <p className="text-gray-600 mb-8" role="alert">{linkError}</p>
        <Link
          href="/auth/forgot-password"
          className="inline-block bg-blue-700 hover:bg-blue-800 text-white px-8 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
        >
          Forgot Password
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">New Password</h1>
        <p className="text-gray-600">Choose a new password for your account</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-8">
        {formError && (
          <p className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm" role="alert">
            {formError}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <div>
            <label htmlFor="new-password" className="block text-sm font-semibold text-gray-900 mb-2">
              New Password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full px-4 py-3 pr-12 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.password ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors"
              >
                <i className={`${showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} text-lg`}></i>
              </button>
            </div>
            <PasswordStrengthMeter password={password} />
            {errors.password && <p className="text-sm text-red-600 mt-2">{errors.password}</p>}
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-sm font-semibold text-gray-900 mb-2">
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.confirmPassword ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Re-enter password"
            />
            {errors.confirmPassword && (
              <p className="text-sm text-red-600 mt-2">{errors.confirmPassword}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-700 hover:bg-blue-800 text-white py-4 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isLoading ? 'Saving...' : 'Save New Password'}
          </button>
        </form>

        <p className="mt-8 text-center text-gray-600">
          Remember your password?{' '}
          <Link href="/auth/login" className="text-blue-700 hover:text-blue-900 font-semibold whitespace-nowrap">
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="max-w-md w-full">
        <Suspense
          fallback={
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
              <i className="ri-loader-4-line animate-spin text-3xl text-blue-700"></i>
            </div>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
