import { redirect } from 'next/navigation';

// Phone verification is not offered: this page used to be a mock-up.
export default function VerifyPhonePage() {
  redirect('/account');
}
