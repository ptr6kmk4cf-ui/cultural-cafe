import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { aiConfig } from '@/lib/ai/provider';
import { Sidebar } from '@/components/Sidebar';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const ai = aiConfig();
  const aiMissing = !ai.isMock && !ai.apiKey && ai.provider !== 'openai-compatible';
  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: user.name, email: user.email, plan: user.plan, role: user.role }} />
      <main className="min-w-0 flex-1 px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-[calc(4rem+env(safe-area-inset-top))] md:px-8 md:pt-6">
        {ai.isMock && (
          <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-100">
            <b>Mock AI mode</b> — AI_PROVIDER=mock returns canned “[Mock AI]” text for offline testing. Set a real AI provider key in <code>apps/web/.env</code> for genuine suggestions.
          </div>
        )}
        {aiMissing && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-100">
            <b>AI not configured</b> — set <code>AI_API_KEY</code> in <code>apps/web/.env</code>. AI features will return an error until then.
          </div>
        )}
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
