import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="bg-gradient-to-br from-blue-50 via-white to-amber-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">Privacy Policy</h1>
            <p className="text-xl text-gray-600 leading-relaxed">
              Because We Care — how your personal information is collected, used, and shared when you visit or make a purchase from BADDIECURVES.
            </p>
            <p className="text-sm text-gray-500 mt-4">Last updated: March 2026</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="prose prose-lg max-w-none">
          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Personal Information We Collect</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              When you visit the BADDIECURVES ONLINE STORE, we automatically collect certain information about your device, including information about your web browser, IP address, time zone, and some of the cookies that are installed on your device. Additionally, as you browse the Site, we collect information about the individual web pages or products that you view, what websites or search terms referred you to the Site, and information about how you interact with the Site. We refer to this automatically-collected information as &quot;Device Information&quot;.
            </p>

            <h3 className="text-xl font-bold text-gray-900 mb-4 mt-8">We Collect Device Information Using The Following Technologies:</h3>
            <ul className="space-y-2 text-gray-600 mb-6">
              <li className="flex items-start gap-2">
                <i className="ri-checkbox-circle-line text-blue-700 mt-1"></i>
                <span><strong>Cookies</strong> — Data files placed on your device or computer that often include an anonymous unique identifier. For more information about cookies, and how to disable cookies, visit <a href="http://www.allaboutcookies.org" target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">http://www.allaboutcookies.org</a>.</span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-checkbox-circle-line text-blue-700 mt-1"></i>
                <span><strong>Log files</strong> — Track actions occurring on the Site, and collect data including your IP address, browser type, Internet service provider, referring/exit pages, and date/time stamps.</span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-checkbox-circle-line text-blue-700 mt-1"></i>
                <span><strong>Web beacons</strong>, <strong>tags</strong>, and <strong>pixels</strong> — Electronic files used to record information about how you browse the Site.</span>
              </li>
            </ul>

            <p className="text-gray-600 leading-relaxed mb-4">
              Additionally when you make a purchase or attempt to make a purchase through the Site, we collect certain information from you, including your name, billing address, shipping address, payment information (including credit card numbers &amp; PayPal), email address, and phone number. We refer to this information as &quot;Order Information&quot;.
            </p>
            <p className="text-gray-600 leading-relaxed">
              When we talk about &quot;Personal Information&quot; in this Privacy Policy, we are talking both about Device Information and Order Information.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">How Do We Use Your Personal Information?</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              We use the Order Information that we collect generally to fulfill any orders placed through the Site (including processing your payment information, arranging for shipping, and providing you with invoices and/or order confirmations). Additionally, we use this Order Information to:
            </p>
            <ul className="space-y-2 text-gray-600 mb-6">
              <li className="flex items-start gap-2">
                <i className="ri-arrow-right-s-line text-blue-700 mt-1"></i>
                <span>Communicate with you;</span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-arrow-right-s-line text-blue-700 mt-1"></i>
                <span>Screen our orders for potential risk or fraud; and</span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-arrow-right-s-line text-blue-700 mt-1"></i>
                <span>When in line with the preferences you have shared with us, provide you with information or advertising relating to our products or services.</span>
              </li>
            </ul>
            <p className="text-gray-600 leading-relaxed">
              We use the Device Information that we collect to help us screen for potential risk and fraud (in particular, your IP address), and more generally to improve and optimize our Site (for example, by generating analytics about how our customers browse and interact with the Site, and to assess the success of our marketing and advertising campaigns).
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Sharing Your Personal Information</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              We share your Personal Information with third parties to help us use your Personal Information, as described above. For example, we use Shopify to power our online store — you can read more about how Shopify uses your Personal Information here: <a href="https://www.shopify.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">https://www.shopify.com/legal/privacy</a>. We also use Google Analytics to help us understand how our customers use the Site — you can read more about how Google uses your Personal Information here: <a href="https://www.google.com/intl/en/policies/privacy/" target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">https://www.google.com/intl/en/policies/privacy/</a>. You can also opt-out of Google Analytics here: <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">https://tools.google.com/dlpage/gaoptout</a>.
            </p>
            <p className="text-gray-600 leading-relaxed">
              Finally, we may also share your Personal Information to comply with applicable laws and regulations, to respond to a subpoena, search warrant or other lawful request for information we receive, or to otherwise protect our rights.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Behavioral Advertising</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              As described above, we use your Personal Information to provide you with targeted advertisements or marketing communications we believe may be of interest to you. For more information about how targeted advertising works, you can visit the Network Advertising Initiative&apos;s (&quot;NAI&quot;) educational page at <a href="http://www.networkadvertising.org/understanding-online-advertising/how-does-it-work" target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">http://www.networkadvertising.org/understanding-online-advertising/how-does-it-work</a>.
            </p>
            <p className="text-gray-600 leading-relaxed mb-4">
              You can opt out of targeted advertising by using the links below:
            </p>
            <ul className="space-y-2 text-gray-600">
              <li><a href="https://www.facebook.com/settings/?tab=ads" target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">Facebook</a></li>
              <li><a href="https://www.google.com/settings/ads/anonymous" target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">Google</a></li>
              <li><a href="https://advertise.bingads.microsoft.com/en-us/resources/policies/personalized-ads" target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">Bing</a></li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Do Not Track</h2>
            <p className="text-gray-600 leading-relaxed">
              Please note that we do not alter our Site&apos;s data collection and use practices when we see a Do Not Track signal from your browser.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Your Rights</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              If you are a European resident, you have the right to access personal information we hold about you and to ask that your personal information be corrected, updated, or deleted. If you would like to exercise this right, please contact us through the contact information below.
            </p>
            <p className="text-gray-600 leading-relaxed">
              Additionally, if you are a European resident we note that we are processing your information in order to fulfill contracts we might have with you (for example if you make an order through the Site), or otherwise to pursue our legitimate business interests listed above. Additionally, please note that your information will be transferred outside of Europe, including to Canada and the United States.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Data Retention</h2>
            <p className="text-gray-600 leading-relaxed">
              When you place an order through the Site, we will maintain your Order Information for our records unless and until you ask us to delete this information.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Changes</h2>
            <p className="text-gray-600 leading-relaxed">
              We may update this privacy policy from time to time in order to reflect, for example, changes to our practices or for other operational, legal or regulatory reasons.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Contact Us</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              For more information about our privacy practices, if you have questions, or if you would like to make a complaint, please contact us by e-mail at <a href="mailto:baddiecurves@gmail.com" className="text-blue-700 hover:underline font-medium">baddiecurves@gmail.com</a>.
            </p>
            <p className="text-gray-600 leading-relaxed">
              <Link href="/contact" className="text-blue-700 hover:underline font-medium">Contact page</Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
