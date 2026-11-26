import { redirect } from 'next/navigation';

// There is no ticket system: this page used to be a mock-up. Messages go
// through the contact form.
export default function SupportTicketPage() {
  redirect('/contact');
}
