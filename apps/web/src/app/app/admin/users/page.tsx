import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { listRegisteredAccounts } from '@/lib/services/admin-users';
import { UsersTable } from './users-table';

export const dynamic = 'force-dynamic';

export default async function AdminUsers() {
  const users = await listRegisteredAccounts();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Registered users"
        subtitle="Everyone who signed up with an email and password, including people who already registered. Passwords are stored as hashes and cannot be shown."
        actions={
          <>
            <Link href="/app/admin" className="btn-secondary text-xs">Operator</Link>
            <Link href="/app/admin/links" className="btn-secondary text-xs">Live links</Link>
          </>
        }
      />
      <UsersTable users={users} />
    </div>
  );
}
