import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: user.name, email: user.email, plan: user.plan, role: user.role }} />
      <main className="min-w-0 flex-1 px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-[calc(4rem+env(safe-area-inset-top))] md:px-8 md:pt-6">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
