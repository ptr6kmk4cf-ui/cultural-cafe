import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { requireAdminPage } from '@/lib/admin-page';
import { listReports } from '@/lib/services/reports';
import { ReportsList } from './reports-list';

export const dynamic = 'force-dynamic';

export default async function AdminReports() {
  await requireAdminPage();
  const reports = await listReports();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="What people reported from their tables. Harassment and under-18 reports are urgent and sort first. Attached lines come from the reporter's own screen; the server never had the chat."
        actions={
          <>
            <Link href="/app/admin" className="btn-secondary text-xs">Operator</Link>
            <Link href="/app/admin/users" className="btn-secondary text-xs">Registered users</Link>
          </>
        }
      />
      <ReportsList initial={reports} />
    </div>
  );
}
