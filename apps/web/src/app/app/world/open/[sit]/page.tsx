import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { normalizeSitKey, openSitPath } from '@/lib/landing-sit';
import { sitWithLandingGuest } from '@/lib/services/world';

export const dynamic = 'force-dynamic';

export default async function OpenLandingTable({ params }: { params: Promise<{ sit: string }> }) {
  const { sit: raw } = await params;
  const sit = normalizeSitKey(raw);
  if (!sit) redirect('/app?welcome=1');
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(openSitPath(sit))}`);
  let table = '';
  try {
    const result = await sitWithLandingGuest(user, sit);
    table = result.conversation?.id || '';
  } catch {
    /* The seat could not open. Send them into the café instead of a dead table. */
  }
  if (table) redirect(`/app/world/${table}`);
  redirect('/app?welcome=1');
}
