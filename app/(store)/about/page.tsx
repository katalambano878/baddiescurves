'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useCMS } from '@/context/CMSContext';
import PageHero from '@/components/PageHero';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function AboutPage() {
  usePageTitle('Our Story');
  const { getSetting } = useCMS();
  const [activeTab, setActiveTab] = useState('story');

  const siteName = getSetting('site_name') || "BADDIECURVES";

  const values = [
    {
      icon: 'ri-verified-badge-line',
      title: 'Verified Quality',
      description: 'Waist trainers, shapewear, post-op and activewear built to last. Every product is selected for durability and comfort so you look and feel your best.'
    },
    {
      icon: 'ri-money-dollar-circle-line',
      title: 'Fair Prices',
      description: 'Quality that fits your budget. We believe every woman deserves to feel confident without breaking the bank.'
    },
    {
      icon: 'ri-heart-line',
      title: 'For Every Body',
      description: 'Curves means every woman, regardless of body shape. We celebrate all bodies and help you embrace yours with style and confidence.'
    },
    {
      icon: 'ri-truck-line',
      title: 'Reliable Delivery',
      description: 'USA orders ship with USPS Priority. International delivery in 10–15 business days, or faster with express shipping.'
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <PageHero
        title="The Lady Behind The Vision"
        subtitle="Waist trainers, shapewear, post-op & activewear for every woman who wants to look and feel beautiful."
        backgroundImage="/page-hero-5.jpeg"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="flex justify-center mb-16 relative">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent -z-10"></div>
          <div className="inline-flex items-center justify-center p-1.5 bg-white/60 backdrop-blur-md rounded-full border border-gray-200 shadow-sm">
            <button
              onClick={() => setActiveTab('story')}
              className={`relative px-8 py-2.5 rounded-full text-sm sm:text-base font-medium transition-all duration-500 ${activeTab === 'story'
                ? 'bg-gray-900 text-white shadow-md'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/50'
                }`}
            >
              Our Story
            </button>
            <button
              onClick={() => setActiveTab('mission')}
              className={`relative px-8 py-2.5 rounded-full text-sm sm:text-base font-medium transition-all duration-500 ${activeTab === 'mission'
                ? 'bg-gray-900 text-white shadow-md'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/50'
                }`}
            >
              Our Mission
            </button>
          </div>
        </div>

        {activeTab === 'story' && (
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="order-2 lg:order-1">
              <span className="inline-block py-1.5 px-4 rounded-full bg-blue-50 text-blue-700 font-semibold text-xs tracking-widest uppercase mb-6 border border-blue-100/50">The Beginning</span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-8 tracking-tight">The Lady Behind The Vision</h2>
              <div className="space-y-6 text-lg text-gray-500 leading-relaxed font-light">
                <p>
                  <strong className="font-semibold text-gray-900">BADDIECURVES</strong> was created in January 2020 by Natasha. <strong className="font-semibold text-gray-900">Baddie</strong> represents a girl or woman who is fashionable, confident, and in with the latest trends. <strong className="font-semibold text-gray-900">Curves</strong> signifies every woman, regardless of your body shape.
                </p>
                <p>
                  As a mother to two beautiful kids, I believe that every woman needs to look and feel beautiful at all times — and having kids shouldn&apos;t stop you from doing just that. Confidence is key, and learning to love yourself and taking care of yourself should be a priority.
                </p>
                <p>
                  Women&apos;s bodies are extraordinary, and the best part of looking good is feeling good.
                </p>
              </div>
            </div>
            <div className="order-1 lg:order-2 relative group md:px-8">
              {/* About image */}
              <div className="aspect-[4/5] sm:aspect-square lg:aspect-[3/4] rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100/50 relative flex items-center justify-center border border-gray-200 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] transition-transform duration-1000 group-hover:scale-[1.02]">
                <Image
                  src="/about.png"
                  alt={`${siteName} about visual`}
                  fill
                  sizes="(min-width: 1024px) 480px, 70vw"
                  className="object-cover object-top"
                  priority
                />
              </div>

              {/* Decorative shadow blur element behind */}
              <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] h-[100%] bg-blue-100/60 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none"></div>
            </div>
          </div>
        )}

        {activeTab === 'mission' && (
          <div className="grid md:grid-cols-2 gap-8 lg:gap-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Card 1 */}
            <div className="group relative bg-white p-10 sm:p-14 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.03)] hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.08)] transition-all duration-1000 overflow-hidden ring-1 ring-gray-900/5 hover:ring-gray-900/10 hover:-translate-y-1">
              {/* Subtle God-Level Background Glow */}
              <div className="absolute top-0 right-0 -mr-20 -mt-20 w-72 h-72 bg-blue-50/60 rounded-full blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none z-0"></div>

              {/* Ultra-subtle watermark */}
              <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-[0.02] transform translate-x-8 -translate-y-8 group-hover:translate-x-2 group-hover:-translate-y-2 group-hover:scale-[1.1] transition-all duration-1000 ease-out pointer-events-none z-0">
                <i className="ri-store-2-fill text-[160px] text-gray-900 leading-none"></i>
              </div>

              <div className="relative z-10 w-16 h-16 bg-gradient-to-br from-gray-50 to-gray-50/50 group-hover:from-blue-50/50 group-hover:to-blue-100/50 rounded-2xl flex items-center justify-center mb-10 border border-gray-200/50 group-hover:border-blue-200/50 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] group-hover:shadow-[0_8px_30px_-4px_rgba(59,130,246,0.12)] group-hover:-translate-y-1 transition-all duration-700 ease-out">
                <i className="ri-store-2-line text-2xl text-gray-500 group-hover:text-blue-600 transition-colors duration-700"></i>
              </div>

              <div className="relative z-10">
                <h3 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-800 mb-5 tracking-tight group-hover:to-gray-600 transition-all duration-700">
                  Quality You Can Trust
                </h3>
                <p className="text-gray-500 text-[1.125rem] leading-[1.8] font-light group-hover:text-gray-600 transition-colors duration-700">
                  We focus on the most durable waist trainers, shapewear, post-op wear and activewear. Our goal is to give you pieces that support your body, boost your confidence and stand up to your lifestyle.
                </p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="group relative bg-white p-10 sm:p-14 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.03)] hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.08)] transition-all duration-1000 overflow-hidden ring-1 ring-gray-900/5 hover:ring-gray-900/10 hover:-translate-y-1">
              {/* Subtle God-Level Background Glow */}
              <div className="absolute top-0 right-0 -mr-20 -mt-20 w-72 h-72 bg-amber-50/60 rounded-full blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none z-0"></div>

              {/* Ultra-subtle watermark */}
              <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-[0.02] transform translate-x-8 -translate-y-8 group-hover:translate-x-2 group-hover:-translate-y-2 group-hover:scale-[1.1] transition-all duration-1000 ease-out pointer-events-none z-0">
                <i className="ri-hand-heart-fill text-[160px] text-gray-900 leading-none"></i>
              </div>

              <div className="relative z-10 w-16 h-16 bg-gradient-to-br from-gray-50 to-gray-50/50 group-hover:from-amber-50/50 group-hover:to-amber-100/50 rounded-2xl flex items-center justify-center mb-10 border border-gray-200/50 group-hover:border-amber-200/50 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] group-hover:shadow-[0_8px_30px_-4px_rgba(251,191,36,0.12)] group-hover:-translate-y-1 transition-all duration-700 ease-out">
                <i className="ri-hand-heart-line text-2xl text-gray-500 group-hover:text-amber-600 transition-colors duration-700"></i>
              </div>

              <div className="relative z-10">
                <h3 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-800 mb-5 tracking-tight group-hover:to-gray-600 transition-all duration-700">
                  Empowering Every Woman
                </h3>
                <p className="text-gray-500 text-[1.125rem] leading-[1.8] font-light group-hover:text-gray-600 transition-colors duration-700">
                  Whether you&apos;re postpartum, post-op, or simply want to feel your best every day, {siteName} is here to support you with quality shapewear, waist trainers and athleisure that help you look good and feel good.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Values Section */}
      <div className="relative bg-gradient-to-b from-[#FAFAFA] to-white py-24 lg:py-32 overflow-hidden border-t border-gray-100">
        {/* Ambient Glow Effects */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-50/50 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gray-100/50 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/3 pointer-events-none"></div>

        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-20 flex flex-col items-center">
            <span className="inline-block py-1.5 px-5 rounded-full bg-white text-gray-600 font-bold text-[11px] tracking-[0.25em] uppercase mb-6 border border-gray-200/60 shadow-[0_2px_15px_-4px_rgba(0,0,0,0.05)]">The Standard</span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-gray-900 mb-6 tracking-tight">Why Shop With Us?</h2>
            <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto font-light leading-relaxed">Trusted by women who want to look and feel their best — quality waist trainers, shapewear and athleisure for every curve.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 max-w-7xl mx-auto">
            {values.map((value, index) => (
              <div
                key={index}
                className="group relative bg-white p-8 xl:p-10 rounded-[2.5rem] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.03)] hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] transition-all duration-700 hover:-translate-y-2 overflow-hidden flex flex-col"
              >
                {/* Subtle Background Number */}
                <div className="absolute -top-12 -right-8 text-[180px] font-black text-gray-50 group-hover:text-[#FAFAFA] transition-colors duration-700 select-none pointer-events-none leading-none z-0">
                  {index + 1}
                </div>

                <div className="relative z-10 flex-col h-full flex">
                  <div className="w-16 h-16 bg-gradient-to-br from-white to-gray-50 rounded-2xl flex items-center justify-center mb-8 border border-gray-100 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05)] group-hover:scale-110 group-hover:-rotate-6 group-hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)] transition-all duration-500">
                    <i className={`${value.icon} text-2xl text-gray-700 group-hover:text-black transition-colors duration-500`}></i>
                  </div>

                  <h3 className="text-xl xl:text-2xl font-bold text-gray-900 mb-4 tracking-tight drop-shadow-sm">{value.title}</h3>
                  <p className="text-gray-500 text-[15px] xl:text-base leading-relaxed font-light mb-10">{value.description}</p>

                  {/* Expanding interaction bar */}
                  <div className="mt-auto">
                    <div className="w-8 h-1 bg-gray-200 rounded-full group-hover:bg-gray-900 transition-all duration-700 ease-out group-hover:w-full"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Premium CTA */}
      <div className="bg-white py-20 lg:py-32 px-4 sm:px-6 lg:px-8 flex justify-center">
        <div className="relative w-full max-w-6xl rounded-[3rem] overflow-hidden bg-gray-900 border border-gray-800 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] group">
          {/* Subtle elegant glow effects */}
          <div className="absolute top-0 right-0 -m-32 w-96 h-96 bg-blue-600/30 rounded-full blur-[100px] pointer-events-none group-hover:bg-blue-500/40 transition-colors duration-1000"></div>
          <div className="absolute bottom-0 left-0 -m-32 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px] pointer-events-none group-hover:bg-indigo-500/30 transition-colors duration-1000"></div>

          {/* Glass Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-50 pointer-events-none"></div>

          <div className="relative z-10 px-6 py-20 sm:p-24 text-center">
            <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-white/10 text-gray-300 font-medium text-xs tracking-widest uppercase mb-8 border border-white/10 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
              The Next Step
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-7xl font-black mb-6 text-white tracking-tight">
              Ready to feel <span className="text-transparent bg-clip-text bg-gradient-to-br from-blue-300 via-white to-blue-200">your best?</span>
            </h2>
            <p className="text-lg md:text-xl text-gray-400 mb-12 leading-relaxed max-w-2xl mx-auto font-light">
              Shop waist trainers, shapewear, post-op wear and athleisure that help you look good and feel good. Confidence starts here.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/shop"
                className="group/btn relative inline-flex items-center justify-center gap-3 w-full sm:w-auto px-10 py-4 rounded-full bg-white text-gray-900 font-bold text-lg transition-all duration-500 hover:scale-105 shadow-[0_0_0_4px_rgba(255,255,255,0.05)] hover:shadow-[0_0_0_8px_rgba(255,255,255,0.1)]"
              >
                <span>Start Shopping</span>
                <i className="ri-arrow-right-line transition-transform duration-500 group-hover/btn:translate-x-1"></i>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
