'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import MiniCart from './MiniCart';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { useCMS } from '@/context/CMSContext';
export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [wishlistCount, setWishlistCount] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  const { cartCount, isCartOpen, setIsCartOpen } = useCart();
  const { getSetting } = useCMS();

  const siteName = getSetting('site_name') || "BADDIECURVES";
  const siteLogo = getSetting('site_logo') || '/logo.png?v=4';

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    // Wishlist logic
    const updateWishlistCount = () => {
      const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
      setWishlistCount(wishlist.length);
    };

    updateWishlistCount();
    window.addEventListener('wishlistUpdated', updateWishlistCount);

    // Auth logic
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      window.removeEventListener('wishlistUpdated', updateWishlistCount);
      subscription.unsubscribe();
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/shop?search=${encodeURIComponent(searchQuery)}`;
    }
  };

  return (
    <>
      <header className="bg-white/70 backdrop-blur-3xl sticky top-0 z-50 border-b border-black/[0.04] shadow-[0_20px_40px_-24px_rgba(0,0,0,0.02)] transition-all duration-700 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] supports-[backdrop-filter]:bg-white/50">
        <div className="safe-area-top" />
        <nav aria-label="Main navigation" className="relative">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="h-[5.5rem] grid grid-cols-[auto_1fr_auto] items-center gap-4">

              {/* Left: Mobile Menu Trigger (Mobile) & Logo */}
              <div className="flex items-center gap-2 sm:gap-4">
                <button
                  className={`lg:hidden p-2 -ml-2 rounded-full transition-all duration-500 active:scale-95 ${isScrolled ? 'text-gray-900 hover:bg-black/[0.06]' : 'text-gray-400 hover:text-gray-900 hover:bg-black/[0.02]'}`}
                  onClick={() => setIsMobileMenuOpen(true)}
                  aria-label="Open menu"
                >
                  <i className="ri-menu-line text-[22px] font-light"></i>
                </button>
                <Link
                  href="/"
                  className="flex items-center select-none opacity-90 transition-opacity duration-500 hover:opacity-100"
                  aria-label="Go to homepage"
                >
                  <Image src={siteLogo} alt={siteName} width={140} height={44} className="h-9 w-auto md:h-11 object-contain object-left" priority />
                </Link>
              </div>

              {/* Center: Navigation Links (Desktop) */}
              <div className="hidden lg:flex items-center justify-center space-x-12">
                {[
                  { label: 'Shop', href: '/shop' },
                  { label: 'Categories', href: '/categories' },
                  { label: 'About', href: '/about' },
                  { label: 'Contact', href: '/contact' },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`group relative py-2 text-[11px] uppercase tracking-[0.2em] font-bold transition-colors duration-500 ${isScrolled ? 'text-gray-900 hover:text-gray-900' : 'text-gray-400 hover:text-gray-900'}`}
                  >
                    {link.label}
                    <span className="absolute inset-x-0 bottom-0 h-px origin-center scale-x-0 bg-gray-900 transition-transform duration-500 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] group-hover:scale-x-100" />
                  </Link>
                ))}
              </div>

              {/* Right: Icons */}
              <div className="flex items-center justify-end space-x-1 sm:space-x-2">
                <button
                  className={`p-2 sm:p-2.5 rounded-full transition-all duration-500 active:scale-95 ${isScrolled ? 'text-gray-900 hover:bg-black/[0.06]' : 'text-gray-400 hover:text-gray-900 hover:bg-black/[0.02]'}`}
                  onClick={() => setIsSearchOpen(true)}
                  aria-label="Search"
                >
                  <i className="ri-search-line text-[20px] font-light"></i>
                </button>

                <Link
                  href="/wishlist"
                  className={`p-2 sm:p-2.5 rounded-full transition-all duration-500 active:scale-95 relative hidden sm:block ${isScrolled ? 'text-gray-900 hover:bg-black/[0.06]' : 'text-gray-400 hover:text-gray-900 hover:bg-black/[0.02]'}`}
                  aria-label="Wishlist"
                >
                  <i className="ri-heart-line text-[20px] font-light"></i>
                  {wishlistCount > 0 && (
                    <span className="absolute top-1 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-900 text-[10px] font-medium text-white shadow-[0_2px_8px_rgba(0,0,0,0.1)] ring-2 ring-white/80">
                      {wishlistCount}
                    </span>
                  )}
                </Link>

                {user ? (
                  <Link
                    href="/account"
                    className={`p-2 sm:p-2.5 rounded-full transition-all duration-500 active:scale-95 hidden sm:block ${isScrolled ? 'text-gray-900 hover:bg-black/[0.06]' : 'text-gray-400 hover:text-gray-900 hover:bg-black/[0.02]'}`}
                    aria-label="Account"
                  >
                    <i className="ri-user-line text-[20px] font-light"></i>
                  </Link>
                ) : (
                  <Link
                    href="/auth/login"
                    className={`p-2 sm:p-2.5 rounded-full transition-all duration-500 active:scale-95 hidden sm:block ${isScrolled ? 'text-gray-900 hover:bg-black/[0.06]' : 'text-gray-400 hover:text-gray-900 hover:bg-black/[0.02]'}`}
                    aria-label="Login"
                  >
                    <i className="ri-user-line text-[20px] font-light"></i>
                  </Link>
                )}

                <div className="relative shrink-0">
                  <button
                    className={`p-2 sm:p-2.5 rounded-full transition-all duration-500 active:scale-95 group ${isScrolled ? 'text-gray-900 hover:bg-black/[0.06]' : 'text-gray-400 hover:text-gray-900 hover:bg-black/[0.02]'}`}
                    onClick={() => setIsCartOpen(!isCartOpen)}
                    aria-label="Cart"
                  >
                    <div className="relative">
                      <i className="ri-shopping-bag-line text-[20px] font-light"></i>
                      {cartCount > 0 && (
                        <span className="absolute -top-[5px] -right-[5px] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-gray-900 text-[10px] font-medium text-white shadow-[0_2px_8px_rgba(0,0,0,0.1)] ring-[2px] ring-white transition-transform duration-500 group-active:scale-90">
                          {cartCount}
                        </span>
                      )}
                    </div>
                  </button>
                  <MiniCart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
                </div>
              </div>

            </div>
          </div>
        </nav>
      </header>

      {isSearchOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 sm:px-6">
          <div
            className="absolute inset-0 bg-gray-900/30 backdrop-blur-xl transition-opacity animate-in fade-in duration-500"
            onClick={() => setIsSearchOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-3xl bg-white/95 backdrop-blur-3xl rounded-[1.25rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-black/[0.04] overflow-hidden animate-in fade-in zoom-in-[0.98] slide-in-from-top-6 duration-500 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]">
            <form onSubmit={handleSearch} className="relative flex items-center bg-gray-50/30">
              <div className="absolute left-6 text-gray-400 pointer-events-none transition-colors duration-500 group-focus-within:text-gray-600">
                <i className="ri-search-line text-[20px]"></i>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products, collections, categories..."
                className="group w-full h-[64px] bg-transparent pl-[60px] pr-20 text-[17px] font-light text-gray-800 placeholder:text-gray-400 caret-gray-400 focus:outline-none focus:ring-0 border-0"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="absolute right-5 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-black/[0.03] transition-all duration-300"
                aria-label="Close search"
              >
                <i className="ri-close-line text-[20px] font-medium"></i>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute top-0 left-0 bottom-0 w-4/5 max-w-xs bg-white shadow-xl flex flex-col animate-in slide-in-from-left duration-300">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center">
                <Image src={siteLogo} alt={siteName} width={120} height={38} className="h-8 w-auto object-contain object-left" />
              </Link>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 -mr-2 text-gray-500 hover:text-gray-900"
                aria-label="Close menu"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-4 space-y-2">
              {[
                { label: 'Home', href: '/' },
                { label: 'Shop', href: '/shop' },
                { label: 'Categories', href: '/categories' },
                { label: 'About', href: '/about' },
                { label: 'Contact', href: '/contact' },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-4 py-3 text-lg font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="h-px bg-gray-100 my-2"></div>
              {[
                { label: 'Track Order', href: '/order-tracking' },
                { label: 'Wishlist', href: '/wishlist' },
                { label: 'My Account', href: '/account' },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-4 py-3 text-base font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-lg transition-colors"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="p-4 border-t border-gray-100">
              <p className="text-xs text-gray-500 text-center">
                &copy; {new Date().getFullYear()} {siteName}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}