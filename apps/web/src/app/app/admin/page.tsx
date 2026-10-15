import Link from 'next/link';
import { PageHeader } from '@/components/ui';

export default function Admin() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Operator"
        subtitle="Registered accounts and open tables."
        actions={
          <>
            <Link href="/app/admin/users" className="btn-secondary text-xs">Registered users</Link>
            <Link href="/app/admin/links" className="btn-secondary text-xs">Live links</Link>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/app/admin/users" className="card block space-y-1 hover:bg-white/5">
          <p className="font-semibold text-white">Registered users</p>
          <p className="text-sm text-ink-300">Everyone who signed up with an email. Passwords stay hashed and are not shown.</p>
        </Link>
        <Link href="/app/admin/links" className="card block space-y-1 hover:bg-white/5">
          <p className="font-semibold text-white">Live links</p>
          <p className="text-sm text-ink-300">Open tables. Chat text is not kept here.</p>
        </Link>
      </div>
    </div>
  );
}
