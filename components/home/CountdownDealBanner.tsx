'use client';
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import AnimatedSection from '@/components/AnimatedSection';

/** Rolling 7-day window from a fixed anchor so SSR/client stay aligned within a week. */
const SALE_ANCHOR = new Date('2026-08-26T12:00:00Z').getTime();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function getEndTime(now = Date.now()) {
  const elapsed = Math.max(0, now - SALE_ANCHOR);
  const cycles = Math.floor(elapsed / WEEK_MS);
  return SALE_ANCHOR + (cycles + 1) * WEEK_MS;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export default function CountdownDealBanner() {
  const [parts, setParts] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const tick = () => {
      const distance = getEndTime() - Date.now();
      if (distance <= 0) {
        setParts({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      setParts({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const units = [
    { label: 'Days', value: parts.days },
    { label: 'Hours', value: parts.hours },
    { label: 'Minutes', value: parts.minutes },
    { label: 'Seconds', value: parts.seconds },
  ];

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection>
          <div className="relative overflow-hidden rounded-[2.5rem] bg-[#0A0F1D] border border-white/10 shadow-[0_24px_80px_-30px_rgba(0,0,0,0.5)]">
            <div className="absolute top-0 left-0 w-64 h-64 bg-blue-600/20 rounded-full blur-[100px] -translate-x-1/3 -translate-y-1/3 pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-72 h-72 bg-indigo-600/15 rounded-full blur-[110px] translate-x-1/4 translate-y-1/4 pointer-events-none" />

            <div className="relative grid lg:grid-cols-[1fr_1.4fr_1fr] items-stretch min-h-[420px]">
              <div className="relative hidden lg:block min-h-[420px]">
                <Image
                  src="/hero2.jpeg"
                  alt="BADDIECURVES shapewear"
                  fill
                  className="object-cover object-center"
                  sizes="25vw"
                  quality={82}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0A0F1D]/80" />
              </div>

              <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 py-14 sm:px-10 sm:py-16">
                <span className="inline-flex items-center gap-2 mb-5 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  Limited Drop
                </span>
                <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tight mb-3 leading-[1.1]">
                  Snatched{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-white to-indigo-200">
                    Savings
                  </span>
                </h2>
                <p className="text-gray-400 text-base sm:text-lg mb-10 max-w-md font-light">
                  Limited-time favourites on waist trainers, shapewear &amp; athleisure — shop before the drop resets.
                </p>

                <div className="flex items-center justify-center gap-2 sm:gap-4 mb-10">
                  {units.map((unit, i) => (
                    <div key={unit.label} className="flex items-center gap-2 sm:gap-4">
                      <div className="min-w-[4.25rem] sm:min-w-[5rem] rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-md px-3 py-3 sm:py-4">
                        <div className="text-2xl sm:text-4xl font-bold text-white tabular-nums leading-none">
                          {pad(unit.value)}
                        </div>
                        <div className="mt-1.5 text-[9px] sm:text-[10px] uppercase tracking-[0.18em] text-gray-400 font-medium">
                          {unit.label}
                        </div>
                      </div>
                      {i < units.length - 1 && (
                        <span className="text-white/30 text-xl sm:text-2xl font-light pb-5">:</span>
                      )}
                    </div>
                  ))}
                </div>

                <Link
                  href="/shop"
                  className="inline-flex items-center gap-2 rounded-full bg-white text-gray-900 px-8 py-3.5 text-sm font-bold hover:bg-gray-100 transition-all hover:scale-105 shadow-lg"
                >
                  Shop Now <i className="ri-arrow-right-line" />
                </Link>
              </div>

              <div className="relative hidden lg:block min-h-[420px]">
                <Image
                  src="/hero3.jpeg"
                  alt="BADDIECURVES athleisure"
                  fill
                  className="object-cover object-center"
                  sizes="25vw"
                  quality={82}
                />
                <div className="absolute inset-0 bg-gradient-to-l from-transparent to-[#0A0F1D]/80" />
              </div>

              {/* Mobile side imagery strip */}
              <div className="lg:hidden grid grid-cols-2 gap-0 border-t border-white/10">
                <div className="relative aspect-[4/5]">
                  <Image src="/hero2.jpeg" alt="" fill className="object-cover" sizes="50vw" quality={75} />
                </div>
                <div className="relative aspect-[4/5]">
                  <Image src="/hero3.jpeg" alt="" fill className="object-cover" sizes="50vw" quality={75} />
                </div>
              </div>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
