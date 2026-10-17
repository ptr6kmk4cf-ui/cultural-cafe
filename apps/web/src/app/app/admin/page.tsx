import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { requireAdminPage } from '@/lib/admin-page';
import { countOpenUrgentReports } from '@/lib/services/reports';
import { db } from '@/lib/db';
import { translationModel } from '@/lib/ai/provider';

export const dynamic = 'force-dynamic';

export default async function Admin() {
  await requireAdminPage();
  const [urgent, open] = await Promise.all([countOpenUrgentReports(), db.worldReport.count({ where: { status: 'open' } })]);
  const translation = translationModel();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Operator"
        subtitle="Registered accounts, open tables and reports."
        actions={
          <>
            <Link href="/app/admin/reports" className="btn-secondary text-xs">Reports</Link>
            <Link href="/app/admin/users" className="btn-secondary text-xs">Registered users</Link>
            <Link href="/app/admin/links" className="btn-secondary text-xs">Live links</Link>
          </>
        }
      />
      {urgent > 0 && (
        <Link href="/app/admin/reports" role="alert" data-urgent-alert className="block rounded-xl border border-red-500/40 bg-red-500/15 p-4 text-sm text-red-100 hover:bg-red-500/25">
          <p className="font-semibold text-white">{urgent} urgent report{urgent === 1 ? '' : 's'} waiting</p>
          <p>Harassment or someone who may be under 18. Open the reports page.</p>
        </Link>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/app/admin/reports" className="card block space-y-1 hover:bg-white/5">
          <p className="font-semibold text-white">Reports</p>
          <p className="text-sm text-ink-300">{open} open{urgent ? `, ${urgent} urgent` : ''}. What people reported from their tables.</p>
        </Link>
        <Link href="/app/admin/users" className="card block space-y-1 hover:bg-white/5">
          <p className="font-semibold text-white">Registered users</p>
          <p className="text-sm text-ink-300">Everyone who signed up with an email. Passwords stay hashed and are not shown.</p>
        </Link>
        <Link href="/app/admin/links" className="card block space-y-1 hover:bg-white/5">
          <p className="font-semibold text-white">Live links</p>
          <p className="text-sm text-ink-300">Open tables. Chat text is not kept here.</p>
        </Link>
      </div>
      <section className="card space-y-1 text-sm" data-translation-model={translation.model}>
        <p className="font-semibold text-white">Translation model</p>
        <p>
          <code>{translation.model}</code>{' '}
          <span className="text-ink-300">
            {translation.source === 'setting'
              ? '(from AI_TRANSLATION_MODEL)'
              : translation.source === 'invalid'
                ? `(AI_TRANSLATION_MODEL "${translation.rejected}" is not a Claude model id, so the default is used)`
                : '(default; set AI_TRANSLATION_MODEL to change it)'}
          </span>
        </p>
        <p className="text-xs text-ink-400">Everything else uses Claude Sonnet.</p>
      </section>
    </div>
  );
}
