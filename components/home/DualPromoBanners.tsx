'use client';

import Link from 'next/link';
import Image from 'next/image';
import AnimatedSection from '@/components/AnimatedSection';

const promos = [
  {
    badge: 'New arrivals',
    titleLead: 'Shapewear',
    titleAccent: 'Essentials',
    description: 'Bodysuits, fajas, and everyday smoothing pieces built for every curve.',
    href: '/shop?category=SHAPEWEAR',
    image: '/hero1.jpeg',
    theme: 'light' as const,
  },
  {
    badge: 'Core collection',
    titleLead: 'Waist',
    titleAccent: 'Trainers',
    description: 'Steelbone trainers and snatch wraps for lasting support and confidence.',
    href: '/shop?category=waist-trainers',
    image: '/hero2.jpeg',
    theme: 'dark' as const,
  },
];

export default function DualPromoBanners() {
  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-5 md:gap-8">
          {promos.map((promo, index) => {
            const isDark = promo.theme === 'dark';
            return (
              <AnimatedSection
                key={promo.href}
                delay={index * 120}
                className="h-full"
              >
                <Link
                  href={promo.href}
                  className={`group relative flex min-h-[280px] sm:min-h-[320px] overflow-hidden rounded-[2rem] border transition-all duration-700 hover:-translate-y-1 ${
                    isDark
                      ? 'bg-[#0A0F1D] border-white/10 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.45)]'
                      : 'bg-stone-50 border-gray-100 shadow-[0_16px_48px_-20px_rgba(0,0,0,0.12)]'
                  }`}
                >
                  <div className="relative z-10 flex flex-1 flex-col justify-center p-7 sm:p-10 pr-[42%] sm:pr-[45%]">
                    <span
                      className={`mb-4 inline-flex w-fit rounded-full px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] ${
                        isDark
                          ? 'bg-white/10 text-white/90 border border-white/15'
                          : 'bg-gray-900 text-white'
                      }`}
                    >
                      {promo.badge}
                    </span>
                    <h3
                      className={`text-3xl sm:text-4xl font-black tracking-tight leading-[1.15] mb-3 ${
                        isDark ? 'text-white' : 'text-gray-900'
                      }`}
                    >
                      {promo.titleLead}{' '}
                      <span
                        className={
                          isDark
                            ? 'text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-indigo-200'
                            : 'text-transparent bg-clip-text bg-gradient-to-br from-blue-600 via-gray-800 to-indigo-600'
                        }
                      >
                        {promo.titleAccent}
                      </span>
                    </h3>
                    <p
                      className={`text-sm sm:text-[15px] leading-relaxed mb-7 max-w-xs ${
                        isDark ? 'text-gray-400' : 'text-gray-600'
                      }`}
                    >
                      {promo.description}
                    </p>
                    <span
                      className={`inline-flex w-fit items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all duration-500 group-hover:gap-3 ${
                        isDark
                          ? 'bg-white text-gray-900 group-hover:bg-gray-100'
                          : 'bg-gray-900 text-white group-hover:bg-blue-800'
                      }`}
                    >
                      Shop Now
                      <i className="ri-arrow-right-line text-base" />
                    </span>
                  </div>

                  <div className="absolute inset-y-0 right-0 w-[48%] sm:w-[46%]">
                    <Image
                      src={promo.image}
                      alt={promo.titleLead}
                      fill
                      className="object-cover object-center transition-transform duration-1000 group-hover:scale-105"
                      sizes="(max-width: 768px) 50vw, 25vw"
                      quality={82}
                    />
                    <div
                      className={`absolute inset-0 ${
                        isDark
                          ? 'bg-gradient-to-l from-transparent via-[#0A0F1D]/20 to-[#0A0F1D]'
                          : 'bg-gradient-to-l from-transparent via-stone-50/30 to-stone-50'
                      }`}
                    />
                  </div>
                </Link>
              </AnimatedSection>
            );
          })}
        </div>
      </div>
    </section>
  );
}
