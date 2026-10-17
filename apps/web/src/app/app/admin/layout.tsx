import { requireAdminPage } from '@/lib/admin-page';

export const dynamic = 'force-dynamic';

/**
 * Every page under /app/admin reads other people's data on the server.
 * Only admins get past this point; everyone else sees a plain 404.
 * Pages that load data must also call requireAdminPage() themselves.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
