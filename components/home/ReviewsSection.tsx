'use client';
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import AnimatedSection, { AnimatedGrid } from '@/components/AnimatedSection';

type HomeReview = {
  id: string;
  rating: number;
  title: string;
  content: string;
  date: string;
  author: string;
  productName: string;
  productSlug: string | null;
  productImage: string;
};

function isApproved(status: string | null | undefined) {
  return String(status || '').toLowerCase() === 'approved';
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <i
          key={star}
          className={`${star <= rating ? 'ri-star-fill text-amber-500' : 'ri-star-line text-gray-300'} text-sm`}
        />
      ))}
    </div>
  );
}

/** Approved customer reviews — same rows moderated in Admin → Reviews. */
export default function ReviewsSection() {
  const [reviews, setReviews] = useState<HomeReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('reviews')
          .select(`
            id,
            rating,
            title,
            content,
            status,
            created_at,
            verified_purchase,
            products:product_id (
              name,
              slug,
              product_images (url)
            )
          `)
          .order('created_at', { ascending: false })
          .limit(24);

        if (cancelled) return;
        if (error) {
          console.warn('[ReviewsSection]', error.message);
          setReviews([]);
          return;
        }

        const approved = (data || [])
          .filter((r: any) => isApproved(r.status))
          .slice(0, 6)
          .map((r: any) => {
            const product = Array.isArray(r.products) ? r.products[0] : r.products;
            const images = product?.product_images;
            const imageUrl = Array.isArray(images) ? images[0]?.url : images?.url;
            return {
              id: r.id,
              rating: r.rating || 5,
              title: r.title || 'Customer review',
              content: r.content || '',
              date: r.created_at
                ? new Date(r.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : '',
              author: r.verified_purchase ? 'Verified buyer' : 'Customer',
              productName: product?.name || 'BADDIECURVES',
              productSlug: product?.slug || null,
              productImage: imageUrl || '/logo.png?v=5',
            } as HomeReview;
          });

        setReviews(approved);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="py-16 md:py-24 bg-stone-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-10">
          <div>
            <span className="inline-block py-1 px-4 rounded-full bg-white text-gray-500 font-semibold text-xs tracking-widest uppercase mb-4 border border-gray-200">
              Love Notes
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-gray-900 tracking-tight">
              Customer{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-blue-600 via-gray-800 to-indigo-600">
                Reviews
              </span>
            </h2>
            <p className="mt-3 text-gray-600 max-w-xl">
              Real feedback from shoppers — only reviews approved in admin appear here.
            </p>
          </div>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 self-start sm:self-auto bg-white text-gray-900 border border-gray-200 px-7 py-3 rounded-full text-sm font-semibold hover:border-gray-300 hover:shadow-sm transition-all"
          >
            Shop the looks <i className="ri-arrow-right-line" />
          </Link>
        </AnimatedSection>

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-56 rounded-[1.75rem] bg-white border border-gray-100 animate-pulse"
              />
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-gray-200 bg-white px-8 py-16 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-stone-50 border border-gray-100">
              <i className="ri-chat-smile-2-line text-xl text-gray-400" />
            </div>
            <p className="text-gray-600 max-w-md mx-auto">
              Approved reviews will show here. Moderate submissions in Admin → Reviews.
            </p>
          </div>
        ) : (
          <AnimatedGrid className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            {reviews.map((review) => {
              const CardInner = (
                <>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <Stars rating={review.rating} />
                    <span className="text-[11px] text-gray-400 whitespace-nowrap">{review.date}</span>
                  </div>
                  <h3 className="font-serif text-lg text-gray-900 mb-2 line-clamp-2">{review.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-4 mb-6">
                    {review.content || 'Great product experience with BADDIECURVES.'}
                  </p>
                  <div className="mt-auto flex items-center gap-3 pt-4 border-t border-gray-100">
                    <div className="relative h-11 w-11 overflow-hidden rounded-full bg-stone-50 border border-gray-100 shrink-0">
                      <Image
                        src={review.productImage}
                        alt={review.productName}
                        fill
                        className="object-cover"
                        sizes="44px"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{review.author}</p>
                      <p className="text-xs text-gray-500 truncate">{review.productName}</p>
                    </div>
                  </div>
                </>
              );

              const className =
                'group flex h-full flex-col rounded-[1.75rem] border border-gray-100 bg-white p-6 sm:p-7 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.12)] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.18)]';

              return review.productSlug ? (
                <Link key={review.id} href={`/product/${review.productSlug}`} className={className}>
                  {CardInner}
                </Link>
              ) : (
                <div key={review.id} className={className}>
                  {CardInner}
                </div>
              );
            })}
          </AnimatedGrid>
        )}
      </div>
    </section>
  );
}
