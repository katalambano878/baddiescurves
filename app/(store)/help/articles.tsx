import type { ReactNode } from 'react';
import Link from 'next/link';

// The help centre only lists articles that are written. Add an entry here to
// publish a new one; anything not in this list is a 404.

export type HelpArticle = {
  id: string;
  title: string;
  category: string;
  content: ReactNode;
};

const h2 = 'text-2xl font-bold text-gray-900 mt-8 mb-3 first:mt-0';
const h3 = 'text-lg font-bold text-gray-900 mt-6 mb-2';
const p = 'text-gray-700 mb-4';
const ol = 'list-decimal pl-6 space-y-1 text-gray-700 mb-4';
const ul = 'list-disc pl-6 space-y-1 text-gray-700 mb-4';
const a = 'text-blue-700 hover:text-blue-900 font-semibold underline';

export const helpArticles: HelpArticle[] = [
  {
    id: '1',
    title: 'How do I track my order?',
    category: 'Orders & Delivery',
    content: (
      <>
        <h2 className={h2}>Tracking Your Order</h2>
        <p className={p}>There are three ways to check on your order:</p>

        <h3 className={h3}>Method 1: Track via Email</h3>
        <ol className={ol}>
          <li>Check your email for the order confirmation</li>
          <li>Click on the &quot;Track Your Order&quot; button in the email</li>
          <li>You&apos;ll be taken to the tracking page for that order</li>
        </ol>

        <h3 className={h3}>Method 2: Track on Website</h3>
        <ol className={ol}>
          <li>Go to the <Link href="/order-tracking" className={a}>Order Tracking</Link> page</li>
          <li>Enter your order number and email address</li>
          <li>Click &quot;Track Order&quot; to see your order status</li>
        </ol>

        <h3 className={h3}>Method 3: Track in Your Account</h3>
        <ol className={ol}>
          <li>Sign in to your account</li>
          <li>Go to &quot;Order History&quot;</li>
          <li>Click &quot;Track Order&quot; on any order</li>
        </ol>

        <h2 className={h2}>Understanding Tracking Statuses</h2>
        <ul className={ul}>
          <li><strong>Order Placed:</strong> We&apos;ve received your order</li>
          <li><strong>Payment:</strong> Your payment has been confirmed</li>
          <li><strong>Processing:</strong> We&apos;re preparing your items</li>
          <li><strong>Packaged:</strong> Your order has been packaged</li>
          <li><strong>Delivered:</strong> Your order has been delivered</li>
        </ul>

        <h2 className={h2}>Need More Help?</h2>
        <p className={p}>
          If you can&apos;t find your order or have questions about your delivery, please{' '}
          <Link href="/contact" className={a}>contact us</Link>.
        </p>
      </>
    ),
  },
  {
    id: '6',
    title: 'How do I return an item?',
    category: 'Returns & Refunds',
    content: (
      <>
        <h2 className={h2}>Our Return Process</h2>

        <h3 className={h3}>Step 1: Send a Return Request</h3>
        <ol className={ol}>
          <li>Go to the <Link href="/returns" className={a}>Returns Portal</Link></li>
          <li>Enter your order number, email and phone number</li>
          <li>Tell us which items you want to return</li>
          <li>Choose a return reason</li>
        </ol>

        <h3 className={h3}>Step 2: We Reply</h3>
        <p className={p}>After you send the request, we will reply by email or phone.</p>

        <h3 className={h3}>Step 3: Ship Your Return</h3>
        <p className={p}>Drop off your package at any authorized shipping location.</p>

        <h3 className={h3}>Step 4: Get Your Refund</h3>
        <p className={p}>Once we receive your return, we&apos;ll process it within 3-5 business days. Your refund will be issued to your original payment method.</p>

        <h2 className={h2}>Return Policy Details</h2>
        <ul className={ul}>
          <li>You have 30 days from delivery to start a return</li>
          <li>Items must be unused and in original packaging</li>
          <li>Return shipping is free for defective items</li>
          <li>Standard returns have a small shipping fee</li>
        </ul>

        <h2 className={h2}>Exchange Instead?</h2>
        <p className={p}>Looking for a different size or color? You can choose to exchange your item instead of returning it for a refund.</p>
      </>
    ),
  },
];

export function getHelpArticle(id: string): HelpArticle | undefined {
  return helpArticles.find((article) => article.id === id);
}
