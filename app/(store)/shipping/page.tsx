import Link from 'next/link';

export default function ShippingPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="bg-gradient-to-br from-blue-50 via-white to-amber-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">Shipping Policy</h1>
            <p className="text-xl text-gray-600 leading-relaxed">
              How it works — processing times, USA & international delivery for BADDIECURVES.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="prose prose-lg max-w-none space-y-10">
          <section>
            <h2 className="text-3xl font-bold text-gray-900 mb-6">How It Works</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              All orders take <strong className="text-gray-900">3 days to 1 week</strong> to process.
            </p>
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start gap-2">
                <i className="ri-checkbox-circle-line text-blue-700 mt-1 flex-shrink-0"></i>
                <span><strong className="text-gray-900">USA orders</strong> are delivered with USPS Priority Mail.</span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-checkbox-circle-line text-blue-700 mt-1 flex-shrink-0"></i>
                <span><strong className="text-gray-900">International orders</strong> are typically delivered within <strong className="text-gray-900">10–15 business days</strong>, or less if you choose express shipping.</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Delivery Summary</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <i className="ri-time-line text-blue-700 text-lg"></i>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">Processing</h3>
                  <p className="text-gray-600 text-sm">3 days to 1 week</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <i className="ri-map-pin-line text-blue-700 text-lg"></i>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">USA</h3>
                  <p className="text-gray-600 text-sm">USPS Priority Mail</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <i className="ri-global-line text-blue-700 text-lg"></i>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">International</h3>
                  <p className="text-gray-600 text-sm">10–15 business days (or less with express)</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Need Help?</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              Questions about shipping or your order? Reach out — we&apos;re here to help.
            </p>
            <div className="bg-[#0A0F1D] rounded-2xl p-8 text-white border border-white/10">
              <p className="text-gray-300 mb-2"><strong className="text-white">Phone:</strong> 054 927 8135 / 059 609 3875</p>
              <p className="text-gray-300 mb-4"><strong className="text-white">Location:</strong> East Legon, Accra</p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 bg-white text-[#0A0F1D] px-6 py-3 rounded-full font-medium hover:bg-gray-100 transition-colors"
                >
                  Contact Us
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
