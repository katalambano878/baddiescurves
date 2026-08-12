import Link from 'next/link';

export default function BlogPage() {
  const featuredPost = {
    id: '1',
    title: 'How to Choose the Right Waist Trainer for Your Body',
    excerpt: 'Learn how steelbone count, torso length, and compression level affect fit — so you can feel snatched and comfortable every day.',
    image: '/hero1.jpeg',
    category: 'Fit Guides',
    date: 'December 15, 2024',
    readTime: '8 min read',
    author: 'BADDIECURVES'
  };

  const posts = [
    {
      id: '2',
      title: 'Shapewear 101: Bodysuits, Fajas & Everyday Smoothing',
      excerpt: 'From thong bodysuits to stage fajas, here’s how to pick shapewear that supports your curves without sacrificing comfort.',
      image: '/hero2.jpeg',
      category: 'Shapewear',
      date: 'December 12, 2024',
      readTime: '6 min read',
      author: 'BADDIECURVES'
    },
    {
      id: '3',
      title: 'Post-Op Recovery Wear: What to Know Before You Buy',
      excerpt: 'A simple guide to post-op compression, staging, and how BADDIECURVES pieces support your healing journey.',
      image: '/hero3.jpeg',
      category: 'Post-Op',
      date: 'December 10, 2024',
      readTime: '7 min read',
      author: 'BADDIECURVES'
    },
    {
      id: '1',
      title: 'How to Choose the Right Waist Trainer for Your Body',
      excerpt: 'Steelbone count, torso length, and compression tips for a confident, lasting fit.',
      image: '/hero1.jpeg',
      category: 'Fit Guides',
      date: 'December 15, 2024',
      readTime: '8 min read',
      author: 'BADDIECURVES'
    }
  ];

  const categories = [
    { name: 'All Posts', count: 12, icon: 'ri-article-line' },
    { name: 'Fit Guides', count: 5, icon: 'ri-ruler-line' },
    { name: 'Shapewear', count: 4, icon: 'ri-t-shirt-line' },
    { name: 'Post-Op', count: 3, icon: 'ri-heart-pulse-line' },
    { name: 'Athleisure', count: 6, icon: 'ri-run-line' },
    { name: 'Care Tips', count: 2, icon: 'ri-hand-heart-line' }
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-gradient-to-br from-blue-50 via-white to-amber-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">Our Blog</h1>
            <p className="text-xl text-gray-600 leading-relaxed">
              Fit guides, shapewear tips, and confidence advice for waist trainers, post-op wear, and athleisure.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link href={`/blog/${featuredPost.id}`} className="block mb-16 hover:opacity-90 transition-opacity cursor-pointer">
          <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-shadow">
            <div className="grid md:grid-cols-2 gap-0">
              <div className="relative h-96 md:h-auto">
                <img
                  src={featuredPost.image}
                  alt={featuredPost.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-6 left-6">
                  <span className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-semibold">
                    {featuredPost.category}
                  </span>
                </div>
              </div>
              <div className="p-8 md:p-12 flex flex-col justify-center">
                <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                  <span>{featuredPost.date}</span>
                  <span>•</span>
                  <span>{featuredPost.readTime}</span>
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4">{featuredPost.title}</h2>
                <p className="text-gray-600 leading-relaxed mb-6">{featuredPost.excerpt}</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <i className="ri-user-smile-line text-blue-700"></i>
                  </div>
                  <span className="text-sm font-medium text-gray-700">{featuredPost.author}</span>
                </div>
              </div>
            </div>
          </div>
        </Link>

        <div className="grid lg:grid-cols-4 gap-12">
          <div className="lg:col-span-1">
            <h3 className="text-lg font-bold text-gray-900 mb-6">Categories</h3>
            <div className="space-y-2">
              {categories.map((cat) => (
                <button
                  key={cat.name}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                >
                  <span className="flex items-center gap-3 text-gray-700">
                    <i className={`${cat.icon} text-lg`}></i>
                    {cat.name}
                  </span>
                  <span className="text-sm text-gray-400">{cat.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="grid md:grid-cols-2 gap-8">
              {posts.map((post) => (
                <Link
                  key={`${post.id}-${post.title}`}
                  href={`/blog/${post.id}`}
                  className="group bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-xl transition-shadow"
                >
                  <div className="relative h-56 overflow-hidden">
                    <img
                      src={post.image}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-4 left-4">
                      <span className="bg-white/90 backdrop-blur text-gray-900 px-3 py-1 rounded-full text-xs font-semibold">
                        {post.category}
                      </span>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                      <span>{post.date}</span>
                      <span>•</span>
                      <span>{post.readTime}</span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-700 transition-colors">
                      {post.title}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed">{post.excerpt}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
