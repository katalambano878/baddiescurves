"use client";

import { useState } from 'react';
import Link from 'next/link';

export default function FAQsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const categories = [
    { id: 'all', name: 'All Questions', icon: 'ri-question-line' },
    { id: 'orders', name: 'Orders', icon: 'ri-shopping-bag-line' },
    { id: 'shipping', name: 'Shipping', icon: 'ri-truck-line' },
    { id: 'returns', name: 'Returns', icon: 'ri-arrow-go-back-line' },
    { id: 'payment', name: 'Payment', icon: 'ri-bank-card-line' },
    { id: 'account', name: 'Account', icon: 'ri-user-line' }
  ];

  const faqs = [
    {
      category: 'orders',
      question: 'How do I place an order?',
      answer: 'Browse our products, add items to your cart, proceed to checkout, provide your delivery address, select payment method, and confirm your order. You\'ll receive an email confirmation with your order details and tracking number.'
    },
    {
      category: 'orders',
      question: 'Can I modify or cancel my order?',
      answer: 'You can modify or cancel your order within 1 hour of placing it. Use the contact form on our website as soon as possible. Once an order is processed, modifications may not be possible.'
    },
    {
      category: 'orders',
      question: 'How do I track my order?',
      answer: 'After your order ships, you\'ll receive a tracking number via email and SMS. Visit our Order Tracking page and enter your order number and email address to see real-time updates on your delivery status.'
    },
    {
      category: 'orders',
      question: 'What if I receive the wrong item?',
      answer: 'We sincerely apologise if you receive the wrong item. Contact us within 48 hours with photos of the item received. We\'ll arrange for the correct item to be sent immediately and collect the wrong item at no cost to you.'
    },
    {
      category: 'shipping',
      question: 'What are your delivery times?',
      answer: 'All orders take 3 days to 1 week to process. USA orders ship via USPS Priority Mail. International orders typically arrive within 10–15 business days, or sooner with express shipping.'
    },
    {
      category: 'shipping',
      question: 'How much does shipping cost?',
      answer: 'Shipping rates are calculated at checkout based on your country or region. Ghana and international rates are managed separately so you always see the correct amount before you pay.'
    },
    {
      category: 'shipping',
      question: 'Do you ship outside Ghana?',
      answer: 'Yes. Ghana customers check out in GH₵ with Mobile Money (Moolre). USA and other international customers see USD prices, enter a full shipping address, and pay with PayPal.'
    },
    {
      category: 'shipping',
      question: 'What if nobody is home for delivery?',
      answer: 'For USA USPS deliveries, follow the carrier notice for redelivery or pickup. For other destinations, our delivery partner will attempt delivery and share collection instructions by SMS or email if needed.'
    },
    {
      category: 'returns',
      question: 'What is your return policy?',
      answer: 'BADDIECURVES accepts eligible returns within the United States for unused items in original packaging with tags. Returns are processed as store credit after inspection (typically 4–7 business days).'
    },
    {
      category: 'returns',
      question: 'Which items cannot be returned?',
      answer: 'For hygiene reasons, worn shapewear, waist trainers, post-op fajas, intimates, and items with odors, stains, sweat, or missing tags cannot be returned. Limited-edition pieces may only qualify for store credit toward another item.'
    },
    {
      category: 'returns',
      question: 'Who pays for return shipping?',
      answer: 'Customers are responsible for shipping fees to and from unless the return is due to our error or a verified defect. Follow the steps on our Returns page so we can identify your package.'
    },
    {
      category: 'returns',
      question: 'Can I exchange an item instead of returning it?',
      answer: 'Yes — if you need a different size or colour, start a return for store credit and repurchase the available option. Exact same-item exchanges depend on current stock.'
    },
    {
      category: 'payment',
      question: 'What payment methods do you accept?',
      answer: 'Ghana customers can pay with MTN, Vodafone, and AirtelTigo Mobile Money via Moolre. International customers pay securely in USD with PayPal.'
    },
    {
      category: 'payment',
      question: 'Is it safe to use my credit card on your site?',
      answer: 'Yes. Checkout uses SSL encryption. Ghana payments are processed by Moolre; international payments are handled by PayPal. We never store your full card details on our servers.'
    },
    {
      category: 'payment',
      question: 'Can I pay in instalments?',
      answer: 'Instalment options depend on your payment provider (for example PayPal Pay Later where available). At checkout, choose the method that fits you best.'
    },
    {
      category: 'payment',
      question: 'When will my payment be charged?',
      answer: 'Mobile Money and PayPal payments are charged when you complete checkout. If an item cannot be fulfilled, we will contact you and refund promptly.'
    },
    {
      category: 'payment',
      question: 'How do refunds work?',
      answer: 'Refunds are processed to your original payment method within 5-7 business days after we receive and inspect your return. For mobile money refunds, ensure you provide correct details. You\'ll receive confirmation via email.'
    },
    {
      category: 'account',
      question: 'Do I need an account to place an order?',
      answer: 'No, you can checkout as a guest. However, creating an account lets you track orders, save addresses, view purchase history, manage your wishlist, and receive exclusive offers. It only takes 30 seconds to sign up.'
    },
    {
      category: 'account',
      question: 'How do I reset my password?',
      answer: 'Click "Forgot Password" on the login page, enter your email address, and we\'ll send you a reset link. The link is valid for 1 hour. If you don\'t receive it, check your spam folder or contact support.'
    },
    {
      category: 'account',
      question: 'Can I have multiple delivery addresses?',
      answer: 'Yes! You can save multiple delivery addresses in your account. During checkout, simply select the address you want to use or add a new one. This is perfect for sending gifts or alternating between work and home.'
    },
    {
      category: 'account',
      question: 'How do I update my account information?',
      answer: 'Log in to your account and go to "Account Settings". You can update your name, email, phone number, password, and saved addresses. Changes are saved instantly and you\'ll receive a confirmation email.'
    },
    {
      category: 'account',
      question: 'What are loyalty points and how do they work?',
      answer: 'Earn 1 point for every GHS 10 spent. 100 points = GHS 10 discount on your next purchase. Points are automatically added to your account after each order. Check your points balance in your account dashboard.'
    }
  ];

  const filteredFAQs = faqs.filter(faq => {
    const matchesCategory = activeCategory === 'all' || faq.category === activeCategory;
    const matchesSearch = searchQuery === '' || 
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-gradient-to-br from-blue-50 via-white to-amber-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Frequently Asked Questions
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              Find quick answers to common questions about ordering, shipping, returns, payments, and more.
            </p>

            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for answers..."
                className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm shadow-lg"
              />
              <i className="ri-search-line absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-xl"></i>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-wrap gap-3 justify-center mb-12">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all whitespace-nowrap ${
                activeCategory === category.id
                  ? 'bg-blue-700 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <i className={`${category.icon} text-lg`}></i>
              {category.name}
            </button>
          ))}
        </div>

        {filteredFAQs.length > 0 ? (
          <div className="max-w-4xl mx-auto space-y-4">
            {filteredFAQs.map((faq, index) => (
              <details
                key={index}
                className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-lg transition-shadow"
              >
                <summary className="px-6 py-5 font-medium text-gray-900 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between">
                  <span className="flex-1 pr-4">{faq.question}</span>
                  <i className="ri-arrow-down-s-line text-xl text-gray-400"></i>
                </summary>
                <div className="px-6 pb-5 text-gray-600 leading-relaxed border-t border-gray-100 pt-4">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-search-line text-4xl text-gray-400"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No results found</h3>
            <p className="text-gray-600">
              Try adjusting your search or browse different categories
            </p>
          </div>
        )}
      </div>

      <div className="bg-gradient-to-br from-blue-700 to-blue-900 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="ri-customer-service-2-line text-3xl text-white"></i>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Still Have Questions?</h2>
          <p className="text-xl text-blue-100 mb-8 leading-relaxed">
            Our customer service team is ready to help. Contact us and we'll respond within 24 hours.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-white text-blue-700 px-8 py-4 rounded-full font-medium hover:bg-blue-50 transition-colors whitespace-nowrap"
            >
              <i className="ri-mail-line text-lg"></i>
              Contact Support
            </Link>
            <a
              href="https://wa.me/233242853166"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-full font-medium hover:bg-blue-500 transition-colors whitespace-nowrap"
            >
              <i className="ri-whatsapp-line text-lg"></i>
              Chat on WhatsApp
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Quick Links</h2>
          <p className="text-gray-600">Explore more helpful resources</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Link href="/shipping" className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-all cursor-pointer">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <i className="ri-truck-line text-2xl text-blue-700"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Shipping Policy</h3>
            <p className="text-gray-600 leading-relaxed">
              Learn about delivery times, costs, and tracking your orders
            </p>
          </Link>

          <Link href="/returns" className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-all cursor-pointer">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <i className="ri-arrow-go-back-line text-2xl text-blue-700"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Returns Policy</h3>
            <p className="text-gray-600 leading-relaxed">
              Understand our return process, timeframes, and refund policy
            </p>
          </Link>

          <Link href="/privacy" className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-all cursor-pointer">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <i className="ri-shield-check-line text-2xl text-blue-700"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Privacy & Security</h3>
            <p className="text-gray-600 leading-relaxed">
              See how we protect your personal information and data
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
