'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import ProductCard, { type ColorVariant, getColorHex } from '@/components/ProductCard';
import ProductCardSkeleton from '@/components/skeletons/ProductCardSkeleton';
import AnimatedSection, { AnimatedGrid } from '@/components/AnimatedSection';
import NewsletterSection from '@/components/NewsletterSection';
import { useCMS } from '@/context/CMSContext';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function Home() {
  usePageTitle('');
  const { getSetting } = useCMS();
  const siteName = getSetting('site_name') || "BADDIECURVES";
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const logSupabaseError = (context: string, error: any) => {
    // In Next.js dev, console.error in client can trigger the overlay.
    // Use warn and print structured fields so errors are actually readable.
    console.warn(`[Home] ${context}`, {
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      code: error?.code,
      name: error?.name,
    });
  };

  // Config State - Managed in Code
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % 3);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const config: {
    hero: {
      headline: string;
      subheadline: string;
      primaryButtonText: string;
      primaryButtonLink: string;
      secondaryButtonText: string;
      secondaryButtonLink: string;
      backgroundImage?: string;
    };
  } = {
    hero: {
      headline: 'Waist Trainers, Shapewear, Post-Op & Athleisure — Look Good, Feel Good',
      subheadline: 'Quality waist trainers, shapewear and activewear for every woman. Confidence starts here.',
      primaryButtonText: 'Shop Collections',
      primaryButtonLink: '/shop',
      secondaryButtonText: 'Our Story',
      secondaryButtonLink: '/about',
      // backgroundImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=2070&auto=format&fit=crop' // Optional override
    },
  };

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch featured products directly from Supabase
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('*, product_variants(*), product_images(*)')
          .eq('status', 'active')
          .eq('featured', true)
          .order('created_at', { ascending: false })
          .limit(8);

        if (productsError) {
          logSupabaseError('Failed to fetch featured products', productsError);
          setFeaturedProducts([]);
        } else {
          setFeaturedProducts(productsData || []);
        }

        // Fetch featured categories (featured is stored in metadata JSONB)
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('categories')
          .select('id, name, slug, image_url, metadata')
          .eq('status', 'active')
          .order('name');

        if (categoriesError) {
          logSupabaseError('Failed to fetch categories', categoriesError);
          setCategories([]);
        } else {
          // Filter by metadata.featured = true on client side
          const featuredCategories = (categoriesData || []).filter(
            (cat: any) => cat.metadata?.featured === true
          );
          setCategories(featuredCategories);
        }
      } catch (error) {
        logSupabaseError('Unexpected fetchData failure', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);


  const getHeroImage = () => {
    if (config.hero.backgroundImage) return config.hero.backgroundImage;
    return "/hero1.jpeg";
  };

  return (
    <main className="flex-col items-center justify-between min-h-screen">
      {/* Hero Section - God Level Design */}
      <section className="relative w-full h-[85vh] md:h-[95vh] overflow-hidden bg-black">

        {/* Progress Bar */}
        <div className="absolute top-0 left-0 right-0 z-30 h-1 bg-white/10">
          <div
            key={currentSlide}
            className="h-full bg-white/80 animate-progress origin-left"
            style={{ animationDuration: '3000ms' }}
          ></div>
        </div>

        {/* Background Slider + Per-Slide Content */}
        {[
          {
            image: '/hero1.jpeg',
            tag: 'Waist Trainers & Shapewear',
            heading: <>Look Good, <br /><span className="italic font-light text-emerald-200">Feel Good</span></>,
            subtext: 'Quality waist trainers, shapewear, post-op wear and athleisure for every woman. Confidence starts here.',
            cta: { text: 'Shop Now', href: '/shop' },
            cta2: { text: 'View Categories', href: '/categories' },
            position: 'object-center'
          },
          {
            image: '/hero2.jpeg',
            tag: 'Athleisure & Activewear',
            heading: <>Every <br /><span className="italic font-light text-rose-200">Curve</span></>,
            subtext: 'From waist trainers to shapewear and activewear — durable, comfortable pieces that help you feel your best.',
            cta: { text: 'Shop Collection', href: '/shop' },
            cta2: { text: 'Our Story', href: '/about' },
            position: 'object-top'
          },
          {
            image: '/hero3.jpeg',
            tag: 'BADDIECURVES',
            heading: <>Confidence <br /><span className="italic font-light text-amber-200">Starts Here</span></>,
            subtext: 'Created for every woman. Waist trainers, shapewear, post-op and athleisure that support you — in style.',
            cta: { text: 'View Offers', href: '/shop?on_sale=true' },
            cta2: null,
            position: 'object-center'
          },
        ].map((slide, index) => (
          <div
            key={index}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${index === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
          >
            {/* Background Image with Ken Burns Effect */}
            <div className={`absolute inset-0 ${index === currentSlide ? 'animate-ken-burns' : ''}`}>
              <Image
                src={slide.image}
                alt={`Hero Banner ${index + 1}`}
                fill
                className={`object-cover ${slide.position}`}
                priority={index === 0}
                sizes="100vw"
                quality={82}
              />
            </div>

            {/* Premium Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>

            {/* Slide Content */}
            <div className="absolute inset-0 flex flex-col justify-center items-center text-center px-6 md:px-16 max-w-7xl mx-auto h-full mt-[-20px]">
              <div className="max-w-4xl flex flex-col items-center">
                <div
                  className={`overflow-hidden transition-all duration-700 delay-100 ${index === currentSlide ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                >
                  <span className="inline-block py-1 px-4 mb-6 text-white/90 text-sm md:text-base tracking-[0.3em] uppercase font-semibold border border-white/20 rounded-full backdrop-blur-md bg-white/5">
                    {slide.tag}
                  </span>
                </div>

                <div className={`transition-all duration-700 delay-200 ${index === currentSlide ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                  <h1 className="text-5xl sm:text-6xl md:text-8xl font-serif text-white mb-6 leading-[1.1] drop-shadow-2xl">
                    {slide.heading}
                  </h1>
                </div>

                <div className={`transition-all duration-700 delay-300 ${index === currentSlide ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                  <p className="text-lg md:text-2xl text-gray-200 max-w-2xl mx-auto mb-10 font-light leading-relaxed">
                    {slide.subtext}
                  </p>
                </div>

                <div className={`flex flex-col sm:flex-row items-center justify-center gap-6 transition-all duration-700 delay-400 ${index === currentSlide ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                  <Link
                    href={slide.cta.href}
                    className="group relative px-10 py-4 bg-white text-gray-950 rounded-full font-medium text-lg overflow-hidden transition-all hover:shadow-[0_0_20px_rgba(255,255,255,0.5)] hover:bg-gray-100 hover:scale-105"
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      {slide.cta.text} <i className="ri-arrow-right-line transition-transform group-hover:translate-x-1"></i>
                    </span>
                  </Link>
                  {slide.cta2 && (
                    <Link
                      href={slide.cta2.href}
                      className="group px-10 py-4 bg-white/10 border border-white/30 text-white rounded-full font-medium text-lg backdrop-blur-md hover:bg-white/20 hover:border-white/50 transition-all hover:scale-105"
                    >
                      {slide.cta2.text}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Slide Indicators */}
        <div className="absolute bottom-10 sm:bottom-12 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-3 rounded-full bg-black/10 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)] overflow-hidden">
          {/* Extremely subtle interior shine */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>

          {[0, 1, 2].map((i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`relative h-[3px] rounded-full transition-all duration-700 ease-out ${currentSlide === i
                ? 'w-10 bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)]'
                : 'w-2.5 bg-white/30 hover:bg-white/70 hover:w-5'
                }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>

        {/* Decoration */}
        <div className="absolute bottom-10 right-6 md:right-16 z-20 hidden md:block">
          <div className="text-white/40 text-sm font-light tracking-widest vertical-text transform rotate-180" style={{ writingMode: 'vertical-rl' }}>
            EST. 2026 — {siteName.toUpperCase()}
          </div>
        </div>

      </section>

      {/* Categories Section */}
      {/* Categories Section */}
      <section className="py-20 md:py-32 bg-gray-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <AnimatedSection className="flex flex-col md:flex-row items-center md:items-end justify-between mb-16 gap-6 text-center md:text-left">
            <div>
              <span className="inline-block py-1 px-4 rounded-full bg-gray-100 text-gray-500 font-semibold text-xs tracking-widest uppercase mb-4 border border-gray-200">Collections</span>
              <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-gray-900 tracking-tight">Shop by <span className="text-transparent bg-clip-text bg-gradient-to-br from-blue-600 via-gray-800 to-indigo-600">Category</span></h2>
            </div>
            <Link href="/categories" className="group hidden md:flex items-center gap-2 bg-white px-8 py-3.5 rounded-full text-gray-900 font-bold text-sm transition-all duration-500 shadow-sm border border-gray-200 hover:shadow-md hover:border-gray-300">
              Explore All <i className="ri-arrow-right-up-line transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"></i>
            </Link>
          </AnimatedSection>

          <AnimatedGrid className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 lg:gap-10">
            {categories.map((category) => (
              <Link href={`/shop?category=${category.slug}`} key={category.id} className="group cursor-pointer block relative outline-none">
                <div className="aspect-[4/5] rounded-[2rem] overflow-hidden relative bg-white border border-gray-100 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] transition-all duration-1000 transform group-hover:-translate-y-2">

                  {/* Image scaling and styling */}
                  <div className="absolute inset-0 bg-gray-50"></div>
                  <Image
                    src={category.image || category.image_url || 'https://via.placeholder.com/600x800?text=' + encodeURIComponent(category.name)}
                    alt={category.name}
                    fill
                    className="object-cover object-center transition-all duration-[1500ms] group-hover:scale-105 opacity-90 group-hover:opacity-100 mix-blend-multiply"
                    sizes="(max-width: 768px) 50vw, 25vw"
                    quality={85}
                    loading="lazy"
                  />

                  {/* Subtle vignette/gradient over entire frame to fix harsh edges */}
                  <div className="absolute inset-x-0 bottom-0 h-4/5 bg-gradient-to-t from-gray-900/90 via-gray-900/20 to-transparent transition-opacity duration-1000 opacity-70 group-hover:opacity-85 pointer-events-none"></div>

                  {/* Outer glow structural frame */}
                  <div className="absolute inset-0 rounded-[2rem] border-[1.5px] border-white/20 transition-colors duration-1000 group-hover:border-white/40 pointer-events-none"></div>

                  {/* Content Container */}
                  <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 flex flex-col justify-end overflow-hidden z-10">
                    <div className="transform transition-transform duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:-translate-y-1">
                      <h3 className="font-sans font-extrabold text-white text-2xl sm:text-3xl tracking-tight mb-2 drop-shadow-md">
                        {category.name}
                      </h3>
                      <div className="h-0 overflow-hidden opacity-0 group-hover:h-8 group-hover:opacity-100 transition-all duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] delay-75">
                        <span className="inline-flex items-center text-white/80 text-sm font-medium tracking-wide">
                          <span className="relative overflow-hidden group/btn2">
                            Browse Collection
                            <div className="absolute bottom-0 left-0 w-full h-[1px] bg-white transform -translate-x-[101%] group-hover/btn2:translate-x-0 transition-transform duration-500"></div>
                          </span>
                          <i className="ri-arrow-right-line ml-2 transform transition-transform duration-500 group-hover:translate-x-1"></i>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </AnimatedGrid>

          <div className="mt-12 flex justify-center md:hidden">
            <Link href="/categories" className="group flex items-center justify-center gap-2 bg-gray-900 text-white w-full px-8 py-4 rounded-xl font-bold text-sm transition-all duration-500 shadow-md">
              Explore All <i className="ri-arrow-right-up-line transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"></i>
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-16 md:py-24 bg-stone-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-gray-900 mb-4">Featured Products</h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">Top picks from our latest arrivals</p>
          </AnimatedSection>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 md:gap-8">
              {[...Array(4)].map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <AnimatedGrid className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 lg:gap-8">
              {featuredProducts.map((product) => {
                const variants = product.product_variants || [];
                const hasVariants = variants.length > 0;
                const minVariantPrice = hasVariants ? Math.min(...variants.map((v: any) => v.price || product.price)) : undefined;
                const totalVariantStock = hasVariants ? variants.reduce((sum: number, v: any) => sum + (v.quantity || 0), 0) : 0;
                const effectiveStock = hasVariants ? totalVariantStock : product.quantity;

                // Extract unique colors from option2
                const colorVariants: ColorVariant[] = [];
                const seenColors = new Set<string>();
                for (const v of variants) {
                  const colorName = (v as any).option2;
                  if (colorName && !seenColors.has(colorName.toLowerCase().trim())) {
                    const hex = getColorHex(colorName);
                    if (hex) {
                      seenColors.add(colorName.toLowerCase().trim());
                      colorVariants.push({ name: colorName.trim(), hex });
                    }
                  }
                }

                return (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    slug={product.slug}
                    name={product.name}
                    price={product.price}
                    originalPrice={product.compare_at_price}
                    image={product.product_images?.[0]?.url || 'https://via.placeholder.com/400x500'}
                    rating={product.rating_avg || 5}
                    reviewCount={product.review_count || 0}
                    badge={product.featured ? 'Featured' : undefined}
                    inStock={effectiveStock > 0}
                    maxStock={effectiveStock || 50}
                    moq={product.moq || 1}
                    hasVariants={hasVariants}
                    minVariantPrice={minVariantPrice}
                    colorVariants={colorVariants}
                  />
                );
              })}
            </AnimatedGrid>
          )}

          <div className="text-center mt-16">
            <Link
              href="/shop"
              className="inline-flex items-center justify-center bg-gray-900 text-white px-10 py-4 rounded-full font-medium hover:bg-blue-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-1 btn-animate"
            >
              View All Products
            </Link>
          </div>
        </div>
      </section>

      {/* Newsletter - Homepage Only */}
      <NewsletterSection />

    </main>
  );
}
