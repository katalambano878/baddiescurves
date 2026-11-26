import { redirect } from 'next/navigation';

// There is no ticket system: this page used to list invented tickets.
// Messages go through the contact form.
export default function SupportTicketsPage() {
  redirect('/contact');
}
