import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LANGUAGES } from '@conversa/shared';
import { BrandMark } from '@/components/BrandMark';
import { getCurrentUser } from '@/lib/auth';

const SHOWCASE = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ar', 'ru', 'tr', 'pl', 'zh', 'ja', 'ko', 'hi', 'he', 'uk', 'vi', 'th', 'id'];

const FEATURES = [
  { t: 'The Café', d: 'Sit down with someone from another place for one hour. Write in your language — they read it in theirs. Both people accept before anything is said.' },
  { t: 'Live translation', d: 'Each person writes as they speak. Captions appear in the other language. The original is one tap away when a line feels off.' },
  { t: 'A pleasant surprise', d: 'Meet someone now, or pick a face. The person can be a surprise. Safety is not: adults only, mutual accept, block and report.' },
  { t: 'You stay in control', d: 'No phone numbers, emails or locations are shared by default. The chat is a direct link between your two browsers and is not stored.' },
  { t: 'Reply assistant', d: 'When you want help writing — in the café or on a dating site — drafts stay in your voice. You press send.' },
  { t: `${LANGUAGES.length} languages`, d: 'Pick the languages you use. Auto-detect, translate & reply, including right-to-left Arabic, Hebrew, Persian and Urdu.' },
  { t: 'Private photos', d: 'Your approved photos, suggested only when you ask. Location metadata stripped. Private photos never go into the café.' },
  { t: 'Dating tools, if you want them', d: 'Screen profiles, write openers, keep memory. A side tool for sites you already use — not the product.' },
];

export default async function Landing() {
  if (await getCurrentUser()) redirect('/app');
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <nav className="flex items-center justify-between">
        <BrandMark />
        <div className="flex gap-2">
          <Link href="/login" className="btn-ghost">Sign in</Link>
          <Link href="/register" className="btn-primary">Get started</Link>
        </div>
      </nav>

      <section className="py-20 text-center">
        <p className="chip mx-auto mb-6">For adults 18+ · Meet across cultures · Write in your own language</p>
        <h1 className="mx-auto max-w-3xl text-5xl font-extrabold leading-tight tracking-tight text-white">
          Become a tourist in <span className="bg-gradient-to-r from-brand-300 to-amber-200 bg-clip-text text-transparent">someone else’s everyday life</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-300">
          Cultural Café is a short, translated conversation with a person from another place. You keep your language. They keep theirs. An hour later, you have seen a little of how they live.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/register" className="btn-primary px-6 py-3 text-base">Join the Café</Link>
          <Link href="/login" className="btn-secondary px-6 py-3 text-base">I have an account</Link>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {SHOWCASE.map((code) => LANGUAGES.find((l) => l.code === code)!).map((l) => (
            <span key={l.code} className="chip" dir={l.rtl ? 'rtl' : 'ltr'}>{l.nativeName}</span>
          ))}
          <span className="chip">+{LANGUAGES.length - SHOWCASE.length} more languages</span>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.t} className="card">
            <h3 className="font-semibold text-white">{f.t}</h3>
            <p className="mt-2 text-sm text-ink-300">{f.d}</p>
          </div>
        ))}
      </section>

      <footer className="mt-16 flex flex-wrap justify-between gap-4 border-t border-white/5 pt-6 text-xs text-ink-400">
        <span>© {new Date().getFullYear()} Cultural Café</span>
        <div className="flex gap-4">
          <Link href="/legal/privacy">Privacy policy</Link>
          <Link href="/legal/terms">Terms</Link>
        </div>
      </footer>
    </main>
  );
}
