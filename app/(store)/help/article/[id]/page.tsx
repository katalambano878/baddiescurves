import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getHelpArticle, helpArticles } from '../../articles';

export function generateStaticParams() {
  return helpArticles.map((article) => ({ id: article.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = getHelpArticle(id);
  return article ? { title: article.title } : {};
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = getHelpArticle(id);
  if (!article) notFound();

  const otherArticles = helpArticles.filter((other) => other.id !== article.id);

  return (
    <main className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <Link
          href="/help"
          className="inline-flex items-center text-blue-700 hover:text-blue-900 font-semibold mb-6 whitespace-nowrap"
        >
          <i className="ri-arrow-left-line mr-2"></i>
          Back to Help Center
        </Link>

        <div className="bg-white rounded-xl shadow-sm p-8 mb-6">
          <div className="mb-6 pb-6 border-b border-gray-200">
            <div className="flex items-center space-x-3 mb-4">
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold whitespace-nowrap">
                {article.category}
              </span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">{article.title}</h1>
          </div>

          <article className="max-w-none" style={{ lineHeight: '1.8' }}>
            {article.content}
          </article>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-8 mb-6 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Still need help?</h2>
          <p className="text-gray-600 mb-4">Send us a message and we will get back to you.</p>
          <Link
            href="/contact"
            className="inline-block bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
          >
            Contact Us
          </Link>
        </div>

        {otherArticles.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6">More Articles</h2>
            <div className="space-y-3">
              {otherArticles.map((other) => (
                <Link
                  key={other.id}
                  href={`/help/article/${other.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <i className="ri-file-text-line text-xl text-blue-700"></i>
                    <div>
                      <p className="font-semibold text-gray-900">{other.title}</p>
                      <p className="text-sm text-gray-600">{other.category}</p>
                    </div>
                  </div>
                  <i className="ri-arrow-right-s-line text-2xl text-gray-400"></i>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
