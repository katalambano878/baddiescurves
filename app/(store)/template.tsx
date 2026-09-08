import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { getMaintenanceConfig } from '@/lib/maintenance';

/**
 * Server gate for the storefront. Middleware alone is unreliable here because
 * Edge self-fetch to /api/site/status can time out / deadlock inside Coolify,
 * which fail-opens and leaves the shop live while admin shows "on".
 */
export default async function StoreTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const config = await getMaintenanceConfig();
  if (config.enabled) {
    redirect('/maintenance');
  }
  return children;
}
