'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import PageHero from '@/components/PageHero';
import { useWishlist } from '@/context/WishlistContext';
import ProductCard, { mapProductToCard } from '@/components/ProductCard';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/lib/currency';

export default function WishlistPage() {
  usePageTitle('Wishlist');
  const { wishlist: wishlistItems, removeFromWishlist, refreshWishlist } = useWishlist();
  const { addToCart } = useCart();
  const { resolveAmount } = useCurrency();
  const [cartNotice, setCartNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // The wishlist is saved in this browser as a snapshot. Bring prices, stock
  // and photos up to date, and drop products the shop no longer sells.
  const idsKey = wishlistItems.map(item => item.id).sort().join(',');
  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;
    const ids = idsKey.split(',');
    (async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name), product_variants(*), product_images(url, position, alt_text)')
        .in('id', ids);
      if (cancelled || error || !data) return;
      const active = data.filter((product: any) => !product.status || product.status === 'active');
      const fresh = active.map((product: any) => mapProductToCard(product));
      const freshIds = new Set(fresh.map((item: { id: string }) => item.id));
      refreshWishlist(fresh, ids.filter(id => !freshIds.has(id)));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const addAllToCart = () => {
    // Products with sizes or colours need a choice on their own page first.
    const ready = wishlistItems.filter(item => item.inStock && !item.hasVariants);
    const needChoice = wishlistItems.filter(item => item.inStock && item.hasVariants).length;
    ready.forEach(item => {
      addToCart({
        id: item.id,
        name: item.name,
        price: resolveAmount(item.price, item.price_ghs),
        image: item.image,
        quantity: item.moq || 1,
        slug: item.slug || item.id,
        maxStock: Math.max(0, item.maxStock ?? 0),
        moq: item.moq || 1
      });
    });

    const parts: string[] = [];
    if (ready.length > 0) {
      parts.push(`Added ${ready.length} ${ready.length === 1 ? 'item' : 'items'} to your cart.`);
    }
    if (needChoice > 0) {
      parts.push(`${needChoice} ${needChoice === 1 ? 'item needs' : 'items need'} a size or colour: open ${needChoice === 1 ? 'it' : 'them'} to choose.`);
    }
    if (parts.length === 0) parts.push('Nothing on your wishlist is in stock right now.');
    setCartNotice(parts.join(' '));
  };

  const shareText = [
    'My BADDIECURVES wishlist:',
    ...wishlistItems.map(item => `${item.name} ${origin}/product/${item.slug || item.id}`)
  ].join('\n');

  const copyWishlist = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
      setCartNotice('Your browser blocked copying. Use WhatsApp or email to share instead.');
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <PageHero title="My Wishlist" backgroundImage="/page-hero-4.jpeg" />

      <section className="py-8 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <nav className="flex items-center space-x-2 text-sm mb-2">
                <Link href="/" className="text-gray-600 hover:text-blue-700 transition-colors">Home</Link>
                <i className="ri-arrow-right-s-line text-gray-400"></i>
                <span className="text-gray-900 font-medium">Wishlist</span>
              </nav>
              <p className="text-gray-600">
                {wishlistItems.length} {wishlistItems.length === 1 ? 'item' : 'items'} saved
              </p>
            </div>
            {wishlistItems.length > 0 && (
              <button
                onClick={addAllToCart}
                className="bg-gray-900 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                Add All to Cart
              </button>
            )}
          </div>
          {cartNotice && (
            <p role="status" className="mt-4 text-sm font-medium text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              {cartNotice}
            </p>
          )}
        </div>
      </section>

      {wishlistItems.length === 0 ? (
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
            <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 bg-gray-200 rounded-full">
              <i className="ri-heart-line text-5xl text-gray-400"></i>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Your wishlist is empty</h2>
            <p className="text-gray-600 mb-8 text-lg">Save your favourite items here to easily find them later</p>
            <Link href="/shop" className="inline-block bg-gray-900 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-semibold transition-colors whitespace-nowrap">
              Explore Products
            </Link>
          </div>
        </section>
      ) : (
        <section className="py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {wishlistItems.map((product) => (
                <div key={product.id} className="relative">
                  <ProductCard {...product} slug={product.slug || product.id} />
                  <button
                    onClick={() => removeFromWishlist(product.id)}
                    aria-label={`Remove ${product.name} from wishlist`}
                    className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center bg-white rounded-full shadow-md hover:bg-red-50 transition-colors z-30"
                  >
                    <i className="ri-close-line text-gray-700 text-xl"></i>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {wishlistItems.length > 0 && (
      <section className="py-24 relative bg-gray-50 overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="relative bg-white p-12 sm:p-20 rounded-[3rem] border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.03)] text-center overflow-hidden group transition-all duration-700 hover:shadow-[0_20px_60px_rgba(0,0,0,0.06)]">

            {/* Ambient Subtle Lighting */}
            <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-50/80 rounded-full blur-[100px] pointer-events-none group-hover:bg-blue-100/60 transition-colors duration-1000"></div>
            <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-gray-50 rounded-full blur-[100px] pointer-events-none group-hover:bg-indigo-50/50 transition-colors duration-1000"></div>

            {/* Inner Content */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 bg-gradient-to-br from-gray-50 to-white rounded-2xl flex items-center justify-center mb-8 border border-gray-100 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05)] group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-500">
                <i className="ri-share-forward-line text-2xl text-gray-700 group-hover:text-black transition-colors duration-500"></i>
              </div>

              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-gray-900 mb-4 tracking-tight drop-shadow-sm">Share Your Wishlist</h2>
              <p className="text-gray-500 mb-12 text-lg sm:text-xl font-light max-w-lg mx-auto leading-relaxed">Let friends and family know exactly what you love.</p>

              <div className="flex items-center justify-center gap-4 sm:gap-6">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Share your wishlist on WhatsApp"
                  className="group/btn relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)] hover:-translate-y-1 transition-all duration-300 active:scale-95"
                >
                  <i className="ri-whatsapp-fill text-xl sm:text-2xl transition-transform duration-300 group-hover/btn:scale-110"></i>
                </a>
                <a
                  href={`mailto:?subject=${encodeURIComponent('My BADDIECURVES wishlist')}&body=${encodeURIComponent(shareText)}`}
                  aria-label="Share your wishlist by email"
                  className="group/btn relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)] hover:-translate-y-1 transition-all duration-300 active:scale-95"
                >
                  <i className="ri-mail-fill text-xl sm:text-2xl transition-transform duration-300 group-hover/btn:scale-110"></i>
                </a>
                <button
                  type="button"
                  onClick={copyWishlist}
                  aria-label="Copy your wishlist"
                  className="group/btn relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)] hover:-translate-y-1 transition-all duration-300 active:scale-95"
                >
                  <i className={`${copied ? 'ri-check-line' : 'ri-file-copy-line'} text-xl sm:text-2xl transition-transform duration-300 group-hover/btn:scale-110`}></i>
                </button>
              </div>
              <p role="status" className="mt-4 h-5 text-sm text-gray-600">{copied ? 'Wishlist copied.' : ''}</p>
            </div>
          </div>
        </div>
      </section>
      )}
    </main>
  );
}
