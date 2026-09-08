'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { clearAuthCookies, setAuthCookies } from '@/lib/auth-cookies';
import { withTimeout, TimeoutError } from '@/lib/with-timeout';

const AUTH_TIMEOUT_MS = 12_000;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const authGen = useRef(0);

  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    // Login shell must never wait on session/profile network calls.
    if (isLoginPage) {
      setIsLoading(false);
      setAuthError(null);
      return;
    }

    let cancelled = false;
    const gen = ++authGen.current;

    async function checkAuth() {
      setIsLoading(true);
      setAuthError(null);

      try {
        const sessionResult = await withTimeout(
          supabase.auth.getSession(),
          AUTH_TIMEOUT_MS,
          'getSession'
        );
        if (cancelled || gen !== authGen.current) return;

        const session = sessionResult.data?.session;
        if (!session) {
          router.replace('/admin/login');
          return;
        }

        setAuthCookies(session.access_token, session.refresh_token);

        // Prefer role already on JWT (plain-PG mints app_metadata.role)
        const jwtRole = String(
          (session.user as any)?.app_metadata?.role || ''
        ).toLowerCase();

        let role = jwtRole;
        if (role !== 'admin' && role !== 'staff') {
          const profileResult = await withTimeout(
            Promise.resolve(
              supabase
                .from('profiles')
                .select('role')
                .eq('id', session.user.id)
                .single()
            ),
            AUTH_TIMEOUT_MS,
            'profiles.role'
          );
          if (cancelled || gen !== authGen.current) return;

          if (profileResult.error || !profileResult.data) {
            console.error('Failed to fetch user profile', profileResult.error?.message);
            clearAuthCookies();
            await supabase.auth.signOut().catch(() => {});
            router.replace('/admin/login?error=unauthorized');
            return;
          }
          role = String(profileResult.data.role || '').toLowerCase();
        }

        if (role !== 'admin' && role !== 'staff') {
          console.warn('User does not have admin/staff role');
          clearAuthCookies();
          await supabase.auth.signOut().catch(() => {});
          router.replace('/admin/login?error=unauthorized');
          return;
        }

        if (cancelled || gen !== authGen.current) return;
        setUser(session.user);
        setUserRole(role);
        setIsAuthenticated(true);
      } catch (err: any) {
        if (cancelled || gen !== authGen.current) return;
        const message =
          err instanceof TimeoutError
            ? 'Admin authentication timed out. Check your connection and try again.'
            : err?.message || 'Authentication failed';
        console.error('[AdminLayout] auth error:', message);
        setAuthError(message);
      } finally {
        if (!cancelled && gen === authGen.current) {
          setIsLoading(false);
        }
      }
    }

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session) {
        setAuthCookies(session.access_token, session.refresh_token);
      }
      if (event === 'SIGNED_OUT') {
        clearAuthCookies();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [isLoginPage, pathname, router]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showUserMenu && !target.closest('.user-menu-container')) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  useEffect(() => {
    if (isLoginPage || !isAuthenticated) return;
    let cancelled = false;

    async function fetchModules() {
      try {
        const { data, error } = await withTimeout(
          Promise.resolve(supabase.from('store_modules').select('id, enabled')),
          8_000,
          'store_modules'
        );
        if (cancelled) return;
        if (error) {
          console.warn('Error fetching modules:', error.message);
          return;
        }
        if (data) {
          setEnabledModules(data.filter((m: any) => m.enabled).map((m: any) => m.id));
        }
      } catch (err) {
        console.warn('Fetch modules failed:', err);
      }
    }

    fetchModules();
    return () => {
      cancelled = true;
    };
  }, [isLoginPage, isAuthenticated]);

  useEffect(() => {
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  }, []);

  const handleLogout = async () => {
    clearAuthCookies();
    await supabase.auth.signOut().catch(() => {});
    router.push('/admin/login');
  };

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-500 gap-3">
        <i className="ri-loader-4-line animate-spin text-2xl text-blue-700" />
        <p>Loading Admin...</p>
        <p className="text-xs text-gray-400">Authenticating session</p>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white border border-red-100 rounded-xl p-6 shadow-sm text-center">
          <i className="ri-error-warning-line text-3xl text-red-600 mb-3" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Admin unavailable</h1>
          <p className="text-sm text-gray-600 mb-4">{authError}</p>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700"
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">
        Redirecting to login...
      </div>
    );
  }

  const menuItems = [
    { title: 'Dashboard', icon: 'ri-dashboard-line', path: '/admin', exact: true },
    { title: 'Orders', icon: 'ri-shopping-bag-line', path: '/admin/orders', badge: '' },
    { title: 'POS System', icon: 'ri-store-3-line', path: '/admin/pos' },
    { title: 'Products', icon: 'ri-box-3-line', path: '/admin/products' },
    { title: 'Categories', icon: 'ri-folder-line', path: '/admin/categories' },
    { title: 'Customers', icon: 'ri-group-line', path: '/admin/customers' },
    { title: 'Reviews', icon: 'ri-chat-smile-2-line', path: '/admin/reviews' },
    { title: 'Inventory', icon: 'ri-stack-line', path: '/admin/inventory' },
    { title: 'Shipping', icon: 'ri-truck-line', path: '/admin/shipping' },
    { title: 'Maintenance', icon: 'ri-tools-line', path: '/admin/maintenance' },
    { title: 'Analytics', icon: 'ri-bar-chart-line', path: '/admin/analytics' },
    { title: 'Coupons', icon: 'ri-coupon-2-line', path: '/admin/coupons' },
    {
      title: 'Customer Insights',
      icon: 'ri-user-search-line',
      path: '/admin/customer-insights',
      moduleId: 'customer-insights',
    },
    {
      title: 'Notifications',
      icon: 'ri-notification-3-line',
      path: '/admin/notifications',
      moduleId: 'notifications',
    },
    { title: 'SMS Debugger', icon: 'ri-message-2-line', path: '/admin/test-sms' },
    { title: 'Blog', icon: 'ri-article-line', path: '/admin/blog', moduleId: 'blog' },
    { title: 'Modules', icon: 'ri-puzzle-line', path: '/admin/modules' },
  ];

  const visibleMenuItems = menuItems.filter((item) => {
    if (!('moduleId' in item) || !item.moduleId) return true;
    return enabledModules.includes(item.moduleId);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden glass-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-40 h-screen bg-white border-r border-gray-200 transition-all duration-300
          w-64
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
          ${isSidebarOpen ? 'lg:w-64' : 'lg:w-0 lg:overflow-hidden'}
          lg:translate-x-0
        `}
      >
        <div className="h-full px-4 py-6 overflow-y-auto">
          <Link href="/admin" className="flex items-center gap-2 mb-6 px-2 cursor-pointer">
            <Image
              src="/logo.png?v=4"
              alt="BADDIECURVES"
              width={120}
              height={36}
              className="h-7 w-auto max-w-[120px] object-contain"
              priority
            />
            <span className="text-[10px] font-semibold text-gray-400 tracking-wide uppercase">Admin</span>
          </Link>

          <nav className="space-y-1">
            {visibleMenuItems.map((item) => {
              const isActive = item.exact
                ? pathname === item.path
                : pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => window.innerWidth < 1024 && setIsSidebarOpen(false)}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <i
                      className={`${item.icon} text-xl w-5 h-5 flex items-center justify-center`}
                    ></i>
                    <span>{item.title}</span>
                  </div>
                  {item.badge && (
                    <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <Link
              href="/"
              target="_blank"
              onClick={() => window.innerWidth < 1024 && setIsSidebarOpen(false)}
              className="flex items-center space-x-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
            >
              <i className="ri-external-link-line text-xl w-5 h-5 flex items-center justify-center"></i>
              <span>View Store</span>
            </Link>
          </div>
        </div>
      </aside>

      <div className={`transition-all duration-300 ml-0 ${isSidebarOpen ? 'lg:ml-64' : 'lg:ml-0'}`}>
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="px-4 py-4 lg:px-6 flex items-center justify-between">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              <i
                className={`${isSidebarOpen ? 'ri-menu-fold-line' : 'ri-menu-unfold-line'} text-xl`}
              ></i>
            </button>

            <div className="flex items-center space-x-2 lg:space-x-4">
              <button className="relative w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
                <i className="ri-notification-3-line text-xl"></i>
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>

              <div className="relative user-menu-container">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-2 lg:space-x-3 px-2 lg:px-3 py-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="w-8 h-8 lg:w-9 lg:h-9 flex items-center justify-center bg-blue-100 text-blue-700 rounded-full font-semibold">
                    {user?.email?.charAt(0).toUpperCase() || 'A'}
                  </div>
                  <div className="text-left hidden md:block">
                    <p className="text-sm font-semibold text-gray-900 capitalize">
                      {userRole || 'Admin'}
                    </p>
                    <p className="text-xs text-gray-500 max-w-[100px] truncate">{user?.email}</p>
                  </div>
                  <i className="ri-arrow-down-s-line text-gray-600"></i>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-20">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 transition-colors border-t border-gray-200 text-left cursor-pointer"
                    >
                      <i className="ri-logout-box-line text-red-600 w-5 h-5 flex items-center justify-center"></i>
                      <span className="text-red-600">Logout</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
