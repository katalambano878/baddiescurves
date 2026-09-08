import { redirect } from 'next/navigation';

/** Legacy route under store layout — send visitors to the standalone maintenance page. */
export default function LegacyMaintenanceRedirect() {
  redirect('/maintenance');
}
