'use client';

import { useState } from 'react';
import Link from 'next/link';
import { helpArticles } from './articles';

export default function HelpCenterPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const query = searchQuery.trim().toLowerCase();
  const visibleArticles = query
    ? helpArticles.filter(
        (article) =>
          article.title.toLowerCase().includes(query) ||
          article.category.toLowerCase().includes(query)
      )
    : helpArticles;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-br from-blue-700 to-blue-900 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-4">How can we help you?</h1>
          <p className="text-blue-100 mb-8 text-lg">Search our help articles</p>

          <div className="relative max-w-2xl mx-auto">
            <label htmlFor="help-search" className="sr-only">Search help articles</label>
            <input
              id="help-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for articles..."
              className="w-full px-6 py-4 pl-14 rounded-xl text-gray-900 text-lg focus:outline-none focus:ring-4 focus:ring-blue-300"
            />
            <i className="ri-search-line absolute left-5 top-1/2 -translate-y-1/2 text-2xl text-gray-400"></i>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="bg-white rounded-xl shadow-sm p-8 mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Help Articles</h2>
          {visibleArticles.length > 0 ? (
            <div className="space-y-4">
              {visibleArticles.map((article) => (
                <Link
                  key={article.id}
                  href={`/help/article/${article.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className="flex items-center space-x-4 min-w-0">
                    <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-blue-100 text-blue-700 rounded-full">
                      <i className="ri-file-text-line text-xl"></i>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{article.title}</p>
                      <p className="text-sm text-gray-600">{article.category}</p>
                    </div>
                  </div>
                  <i className="ri-arrow-right-s-line text-2xl text-gray-400 flex-shrink-0"></i>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <i className="ri-file-search-line text-4xl text-gray-400 mb-2"></i>
              <p className="text-gray-900 font-semibold">No articles match &quot;{searchQuery.trim()}&quot;</p>
              <p className="text-sm text-gray-600 mt-1">
                Try different keywords, read our{' '}
                <Link href="/faqs" className="text-blue-700 hover:text-blue-900 font-semibold">FAQs</Link>, or{' '}
                <Link href="/contact" className="text-blue-700 hover:text-blue-900 font-semibold">send us a message</Link>.
              </p>
            </div>
          )}
          <p className="text-sm text-gray-600 mt-6">
            More answers are in our{' '}
            <Link href="/faqs" className="text-blue-700 hover:text-blue-900 font-semibold">FAQs</Link>.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Link
            href="/contact"
            className="bg-white rounded-xl shadow-sm p-6 hover:shadow-lg transition-all text-center"
          >
            <div className="w-16 h-16 flex items-center justify-center bg-blue-100 rounded-full mx-auto mb-4">
              <i className="ri-customer-service-2-line text-3xl text-blue-700"></i>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Contact Us</h3>
            <p className="text-gray-600 text-sm mb-4">Send a message to our team</p>
            <span className="text-blue-700 font-semibold whitespace-nowrap">Send a Message →</span>
          </Link>

          <Link
            href="/returns"
            className="bg-white rounded-xl shadow-sm p-6 hover:shadow-lg transition-all text-center"
          >
            <div className="w-16 h-16 flex items-center justify-center bg-purple-100 rounded-full mx-auto mb-4">
              <i className="ri-arrow-left-right-line text-3xl text-purple-700"></i>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Start a Return</h3>
            <p className="text-gray-600 text-sm mb-4">Return or exchange your item</p>
            <span className="text-purple-700 font-semibold whitespace-nowrap">Request a Return →</span>
          </Link>

          <Link
            href="/order-tracking"
            className="bg-white rounded-xl shadow-sm p-6 hover:shadow-lg transition-all text-center"
          >
            <div className="w-16 h-16 flex items-center justify-center bg-amber-100 rounded-full mx-auto mb-4">
              <i className="ri-map-pin-line text-3xl text-amber-700"></i>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Track Order</h3>
            <p className="text-gray-600 text-sm mb-4">Check your order status</p>
            <span className="text-amber-700 font-semibold whitespace-nowrap">Track Now →</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
