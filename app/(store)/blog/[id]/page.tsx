import Link from 'next/link';
import { sanitizeHtml } from '@/lib/sanitize';

export async function generateStaticParams() {
  return [{ id: '1' }, { id: '2' }, { id: '3' }];
}

export default async function BlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const posts: Record<string, any> = {
    '1': {
      title: 'How to Choose the Right Waist Trainer for Your Body',
      image: '/hero1.jpeg',
      category: 'Fit Guides',
      date: 'December 15, 2024',
      readTime: '8 min read',
      author: 'BADDIECURVES',
      content: `
        <p>The right waist trainer should feel supportive — not punishing. At BADDIECURVES we stock steelbone trainers, snatch wraps, and compression cinchers designed for different torso lengths and goals.</p>
        <h2>Start with your goal</h2>
        <p>Everyday smoothing, workout support, and dramatic cinching need different levels of compression. Beginners often do better with a snatch wrap or lighter trainer before moving into higher steelbone counts.</p>
        <h2>Check torso length</h2>
        <p>Short-torso and long-torso options (like our 25 steelbone short torso styles) sit differently at the underbust and hip. Measure from underbust to hip and compare with the size guide on each product.</p>
        <h2>Steelbone count &amp; build</h2>
        <ul>
          <li><strong>Lower count:</strong> more flexible for daily wear</li>
          <li><strong>Higher count (25–29):</strong> firmer structure and stronger cinch</li>
          <li><strong>Curved / underbust shapes:</strong> follow your natural waist line for comfort</li>
        </ul>
        <h2>How to wear it</h2>
        <p>Put your trainer on over a thin layer when possible, tighten gradually, and avoid extreme all-day compression when you are new to waist training. Comfort and consistency beat forcing the smallest hook row on day one.</p>
        <h2>Shop with confidence</h2>
        <p>Browse our <a href="/shop?category=waist-trainers">Waist Trainers</a> collection, or message us if you need help matching a style to your measurements.</p>
      `
    },
    '2': {
      title: 'Shapewear 101: Bodysuits, Fajas & Everyday Smoothing',
      image: '/hero2.jpeg',
      category: 'Shapewear',
      date: 'December 12, 2024',
      readTime: '6 min read',
      author: 'BADDIECURVES',
      content: `
        <p>Shapewear is not one-size-fits-all. Bodysuits, BBL shorts, thong shapers, and compression fajas each solve a different styling need.</p>
        <h2>Bodysuits</h2>
        <p>Sleeveless, low-back, thong, and smoothing bodysuits create a clean line under dresses and everyday outfits. Look for adjustable straps and hook-and-eye or zipper closures that match how easy you want dressing to be.</p>
        <h2>Targeted shapers</h2>
        <ul>
          <li><strong>FUPA / tummy control:</strong> focused midsection smooth</li>
          <li><strong>Hip &amp; butt padded shapers:</strong> added curve and lift</li>
          <li><strong>High-waist shorts:</strong> great under skirts, jeans, and athleisure</li>
        </ul>
        <h2>Stage fajas</h2>
        <p>Stage 1–3 fajas offer progressive compression. Choose based on your recovery timeline or how firm you want everyday support to feel — and always follow your provider’s guidance after surgery.</p>
        <h2>Fit tips</h2>
        <p>Use the size chart, note stretch fabric vs firm panels, and remember that the right size should smooth without cutting into your skin. Explore our <a href="/shop?category=SHAPEWEAR">Shapewear</a> collection to compare styles.</p>
      `
    },
    '3': {
      title: 'Post-Op Recovery Wear: What to Know Before You Buy',
      image: '/hero3.jpeg',
      category: 'Post-Op',
      date: 'December 10, 2024',
      readTime: '7 min read',
      author: 'BADDIECURVES',
      content: `
        <p>Post-op compression pieces are built for support during healing. BADDIECURVES carries stage fajas and compression styles meant to work with your recovery plan — not replace medical advice.</p>
        <h2>Why staging matters</h2>
        <p>Early stages are usually gentler; later stages add firmer compression as your body is ready. Products labeled Stage 1, Stage 2, or Stage 2/3 help you match where you are in recovery.</p>
        <h2>What to look for</h2>
        <ul>
          <li>Steelbone or panel support that holds without sharp pressure points</li>
          <li>Closures you can manage when mobility is limited (hooks, zippers)</li>
          <li>Coverage that matches your procedure area</li>
          <li>Fabric that can be worn for longer periods as advised</li>
        </ul>
        <h2>Care &amp; comfort</h2>
        <p>Follow wash instructions, keep a second piece rotating if you wear compression daily, and stop use and contact your provider if you notice pain, numbness, or poor circulation.</p>
        <h2>Shop the collection</h2>
        <p>Start with our <a href="/shop?category=post-op">Post Op</a> and shapewear fajas, and reach out via the <a href="/contact">Contact</a> page if you need help choosing a stage.</p>
      `
    }
  };

  const post = posts[id] || posts['1'];

  const relatedPosts = [
    {
      id: id === '1' ? '2' : '1',
      title: id === '1'
        ? 'Shapewear 101: Bodysuits, Fajas & Everyday Smoothing'
        : 'How to Choose the Right Waist Trainer for Your Body',
      image: id === '1' ? '/hero2.jpeg' : '/hero1.jpeg',
      category: id === '1' ? 'Shapewear' : 'Fit Guides'
    },
    {
      id: id === '3' ? '1' : '3',
      title: id === '3'
        ? 'How to Choose the Right Waist Trainer for Your Body'
        : 'Post-Op Recovery Wear: What to Know Before You Buy',
      image: id === '3' ? '/hero1.jpeg' : '/hero3.jpeg',
      category: id === '3' ? 'Fit Guides' : 'Post-Op'
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="relative h-96 bg-gray-900">
        <img
          src={post.image}
          alt={post.title}
          className="w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <span className="inline-block bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium mb-4">
              {post.category}
            </span>
            <h1 className="text-5xl font-bold text-white mb-6">{post.title}</h1>
            <div className="flex items-center justify-center gap-6 text-blue-100">
              <span className="flex items-center gap-2">
                <i className="ri-user-line"></i>
                {post.author}
              </span>
              <span className="flex items-center gap-2">
                <i className="ri-calendar-line"></i>
                {post.date}
              </span>
              <span className="flex items-center gap-2">
                <i className="ri-time-line"></i>
                {post.readTime}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <article className="prose prose-lg max-w-none">
          <div
            className="text-gray-600 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }}
            style={{
              fontSize: '1.125rem',
              lineHeight: '1.8'
            }}
          />
        </article>

        <div className="mt-12 pt-12 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-2">Written by</p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <i className="ri-user-line text-blue-700 text-xl"></i>
                </div>
                <div>
                  <p className="font-bold text-gray-900">{post.author}</p>
                  <p className="text-sm text-gray-500">Shapewear &amp; Fit Tips</p>
                </div>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-3">Share this article</p>
              <div className="flex gap-3">
                <button className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-blue-100 transition-colors cursor-pointer">
                  <i className="ri-facebook-fill text-gray-600"></i>
                </button>
                <button className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-blue-100 transition-colors cursor-pointer">
                  <i className="ri-twitter-fill text-gray-600"></i>
                </button>
                <button className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-blue-100 transition-colors cursor-pointer">
                  <i className="ri-whatsapp-line text-gray-600"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Related Articles</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {relatedPosts.map((relatedPost) => (
              <Link
                key={relatedPost.id}
                href={`/blog/${relatedPost.id}`}
                className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-lg transition-all cursor-pointer"
              >
                <div className="relative h-48">
                  <img
                    src={relatedPost.image}
                    alt={relatedPost.title}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute top-4 left-4 bg-blue-700 text-white px-3 py-1 rounded-full text-xs font-medium">
                    {relatedPost.category}
                  </span>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 leading-tight">
                    {relatedPost.title}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-16 bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl p-12 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to shop your curves?</h2>
          <p className="text-blue-100 mb-8 text-lg">
            Explore waist trainers, shapewear, post-op wear and athleisure built for confidence.
          </p>
          <Link
            href="/shop"
            className="inline-flex bg-white text-blue-700 px-8 py-4 rounded-full font-medium hover:bg-blue-50 transition-colors"
          >
            Shop Now
          </Link>
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-blue-700 font-medium hover:gap-3 transition-all"
          >
            <i className="ri-arrow-left-line"></i>
            Back to Blog
          </Link>
        </div>
      </div>
    </div>
  );
}
