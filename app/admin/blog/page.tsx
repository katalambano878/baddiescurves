'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  status: string | null;
  published_at: string | null;
  created_at: string | null;
}

const statusColors: Record<string, string> = {
  published: 'bg-blue-100 text-blue-700',
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-amber-100 text-amber-700'
};

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchPosts = async () => {
    setLoading(true);
    setLoadError(null);
    // Real rows from blog_posts only. There is no post editor in this admin yet.
    const { data, error } = await supabase
      .from('blog_posts')
      .select('id, title, slug, status, published_at, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      setLoadError(error.message || 'Could not load blog posts.');
      setPosts([]);
    } else {
      setPosts(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Blog Posts</h1>
        <p className="text-gray-600 mt-1">Posts saved for the store blog</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading blog posts...</div>
        ) : loadError ? (
          <div className="p-12 text-center space-y-4">
            <p className="text-red-600">Could not load blog posts: {loadError}</p>
            <button onClick={fetchPosts} className="text-blue-700 font-semibold hover:underline cursor-pointer">
              Try again
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="p-12 text-center">
            <i className="ri-article-line text-4xl text-gray-300"></i>
            <p className="mt-3 font-semibold text-gray-900">No blog posts yet</p>
            <p className="mt-1 text-sm text-gray-600 max-w-md mx-auto">
              Blog posting is not set up yet. Posts cannot be written or edited from this admin for now.
              When posts exist, they will be listed here.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Post</th>
                    <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
                    <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Published</th>
                    <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((post) => {
                    const status = String(post.status || 'draft').toLowerCase();
                    return (
                      <tr key={post.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-4 px-6">
                          <p className="font-semibold text-gray-900">{post.title}</p>
                          <p className="text-sm text-gray-500 mt-1">/{post.slug}</p>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap capitalize ${statusColors[status] || 'bg-gray-100 text-gray-700'}`}>
                            {status}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-sm text-gray-700 whitespace-nowrap">{formatDate(post.published_at)}</td>
                        <td className="py-4 px-4 text-sm text-gray-700 whitespace-nowrap">{formatDate(post.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-6 border-t border-gray-200">
              <p className="text-gray-600 text-sm">
                Showing {posts.length} {posts.length === 1 ? 'post' : 'posts'}. Posts cannot be edited from this admin yet.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
