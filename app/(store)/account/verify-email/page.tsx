import { redirect } from 'next/navigation';

// Email verification is not offered: this page used to be a mock-up.
export default function VerifyEmailPage() {
  redirect('/account');
}
