"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useCMS } from '@/context/CMSContext';

function FooterSection({ title, children }: { title: string, children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-blue-800/50 lg:border-none last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-4 text-left lg:py-0 lg:cursor-default lg:mb-6"
      >
        <h4 className="font-bold text-lg text-white">{title}</h4>
        <i className={`ri-arrow-down-s-line text-blue-400 text-xl transition-transform duration-300 lg:hidden ${isOpen ? 'rotate-180' : ''}`}></i>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96 pb-6' : 'max-h-0 lg:max-h-full lg:overflow-visible'}`}>
        {children}
      </div>
    </div>
  );
}

export default function Footer() {
  const { getSetting } = useCMS();

  const siteName = getSetting('site_name') || "BADDIECURVES";
  const siteLogo = getSetting('site_logo') || '/logo.png?v=4';
  const siteTagline = getSetting('site_tagline') || '';
  const socialFacebook = getSetting('social_facebook') || '';
  const socialInstagram = getSetting('social_instagram') || '';
  const socialTwitter = getSetting('social_twitter') || '';
  const socialTiktok = getSetting('social_tiktok') || '';
  const socialSnapchat = getSetting('social_snapchat') || '';
  const socialYoutube = getSetting('social_youtube') || '';

  return (
    <footer className="relative mt-20 z-0">
      {/* Footer Background Shape */}
      <div className="absolute inset-0 bg-[#0A0F1D] rounded-t-[3rem] -z-10 overflow-hidden border-t border-white/5 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)]">
        {/* Subtle top ethereal glow */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent"></div>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none"></div>
      </div>

      <div className="text-white pt-24 pb-12">
        <div className="max-w-[1440px] mx-auto px-6 sm:px-8 lg:px-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-12 lg:gap-8">

            {/* Brand Column */}
            <div className="lg:col-span-4 space-y-8 pr-0 lg:pr-12">
              <Link href="/" className="inline-block group transition-all duration-500 hover:opacity-80">
                <Image src={siteLogo} alt={siteName} width={150} height={48} className="h-12 w-auto object-contain object-left opacity-90" unoptimized />
              </Link>

              <p className="text-gray-400 font-light leading-relaxed text-[15px] max-w-sm">
                Waist trainers, shapewear, post-op & activewear for every curve. Look good, feel good.
              </p>

              <div className="flex gap-4 pt-4">
                {[
                  { link: socialInstagram, icon: 'ri-instagram-line' },
                  { link: socialTiktok, icon: 'ri-tiktok-fill' },
                  { link: socialSnapchat, icon: 'ri-snapchat-fill' },
                  { link: socialYoutube, icon: 'ri-youtube-fill' },
                  { link: socialTwitter, icon: 'ri-twitter-x-fill' },
                  { link: socialFacebook, icon: 'ri-facebook-fill' }
                ].map((social, i) => social.link && (
                  <a
                    key={i}
                    href={social.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-11 h-11 bg-white/[0.03] border border-white/10 rounded-full flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20 hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
                  >
                    <i className={`${social.icon} text-lg`}></i>
                  </a>
                ))}
              </div>
            </div>

            {/* Links Sections - Spanning remaining columns */}
            <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-3 gap-10 lg:gap-16">
              <div className="space-y-8">
                <h4 className="font-serif text-xl font-bold text-gray-100 tracking-wide drop-shadow-sm">Shop</h4>
                <ul className="space-y-4 text-gray-400 text-[15px] font-light">
                  <li><Link href="/shop" className="relative group inline-block hover:text-white transition-colors duration-300">
                    All Products
                    <span className="absolute -bottom-1 left-0 w-0 h-px bg-white/40 transition-all duration-300 group-hover:w-full"></span>
                  </Link></li>
                  <li><Link href="/categories" className="relative group inline-block hover:text-white transition-colors duration-300">
                    Collections
                    <span className="absolute -bottom-1 left-0 w-0 h-px bg-white/40 transition-all duration-300 group-hover:w-full"></span>
                  </Link></li>
                  <li><Link href="/shop?sort=newest" className="relative group inline-block hover:text-white transition-colors duration-300">
                    New Arrivals
                    <span className="absolute -bottom-1 left-0 w-0 h-px bg-white/40 transition-all duration-300 group-hover:w-full"></span>
                  </Link></li>
                  <li><Link href="/shop?sort=bestsellers" className="relative group inline-block hover:text-white transition-colors duration-300">
                    Best Sellers
                    <span className="absolute -bottom-1 left-0 w-0 h-px bg-white/40 transition-all duration-300 group-hover:w-full"></span>
                  </Link></li>
                </ul>
              </div>

              <div className="space-y-8">
                <h4 className="font-serif text-xl font-bold text-gray-100 tracking-wide drop-shadow-sm">Support</h4>
                <ul className="space-y-4 text-gray-400 text-[15px] font-light">
                  <li><Link href="/contact" className="relative group inline-block hover:text-white transition-colors duration-300">
                    Contact Us
                    <span className="absolute -bottom-1 left-0 w-0 h-px bg-white/40 transition-all duration-300 group-hover:w-full"></span>
                  </Link></li>
                  <li><Link href="/order-tracking" className="relative group inline-block hover:text-white transition-colors duration-300">
                    Track Order
                    <span className="absolute -bottom-1 left-0 w-0 h-px bg-white/40 transition-all duration-300 group-hover:w-full"></span>
                  </Link></li>
                  <li><Link href="/shipping" className="relative group inline-block hover:text-white transition-colors duration-300">
                    Shipping & Delivery
                    <span className="absolute -bottom-1 left-0 w-0 h-px bg-white/40 transition-all duration-300 group-hover:w-full"></span>
                  </Link></li>
                  <li><Link href="/returns" className="relative group inline-block hover:text-white transition-colors duration-300">
                    Returns & Exchange
                    <span className="absolute -bottom-1 left-0 w-0 h-px bg-white/40 transition-all duration-300 group-hover:w-full"></span>
                  </Link></li>
                </ul>
              </div>

              <div className="space-y-8 col-span-2 md:col-span-1">
                <h4 className="font-serif text-xl font-bold text-gray-100 tracking-wide drop-shadow-sm">Company</h4>
                <ul className="space-y-4 text-gray-400 text-[15px] font-light">
                  <li><Link href="/about" className="relative group inline-block hover:text-white transition-colors duration-300">
                    Our Story
                    <span className="absolute -bottom-1 left-0 w-0 h-px bg-white/40 transition-all duration-300 group-hover:w-full"></span>
                  </Link></li>
                  <li><Link href="/privacy" className="relative group inline-block hover:text-white transition-colors duration-300">
                    Privacy Policy
                    <span className="absolute -bottom-1 left-0 w-0 h-px bg-white/40 transition-all duration-300 group-hover:w-full"></span>
                  </Link></li>
                  <li><Link href="/terms" className="relative group inline-block hover:text-white transition-colors duration-300">
                    Terms of Service
                    <span className="absolute -bottom-1 left-0 w-0 h-px bg-white/40 transition-all duration-300 group-hover:w-full"></span>
                  </Link></li>
                  <li><Link href="/admin" className="relative group inline-block hover:text-white transition-colors duration-300">
                    Admin Access
                    <span className="absolute -bottom-1 left-0 w-0 h-px bg-white/40 transition-all duration-300 group-hover:w-full"></span>
                  </Link></li>
                </ul>
              </div>
            </div>
          </div>

          {/* Footer Bottom Bar */}
          <div className="border-t border-white/5 mt-20 pt-10 flex flex-col md:flex-row justify-between items-center gap-6 text-[13px] text-gray-500 font-light tracking-wide">
            <p>&copy; {new Date().getFullYear()} {siteName}. All rights reserved.</p>
            <div className="flex gap-5 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
              <i className="ri-visa-line text-3xl"></i>
              <i className="ri-mastercard-line text-3xl"></i>
              <i className="ri-paypal-line text-3xl"></i>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
