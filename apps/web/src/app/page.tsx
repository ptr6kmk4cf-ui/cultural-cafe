import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LANGUAGES, languageName } from '@conversa/shared';
import { BrandMark } from '@/components/BrandMark';
import { LandingWheel } from '@/components/LandingWheel';
import { ageFromBirthDate, getCurrentUser } from '@/lib/auth';
import { cafeGuestRoster } from '@/lib/services/cafe-guests';

const SHOWCASE = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ar', 'ru', 'tr', 'pl', 'zh', 'ja', 'ko', 'hi', 'he', 'uk', 'vi', 'th', 'id'];

const LINE = 'Take a table with an adult in another country. You write in your own language.';

const FEATURES = [
  { t: 'A table, then it closes', d: 'A timed text chat. You get a starting question — a Sunday, a market, a food from their town. You can leave sooner.' },
  { t: 'Live translation', d: 'You type as you speak. They see it in their language. One tap shows the original if a line feels off.' },
  { t: 'Someone in another country', d: 'A first name, a city they typed, maybe a photo. Both of you tap accept before the first message.' },
  { t: 'Not dating', d: 'Adults 18+ only. No phone numbers or emails. Lines stay for this table so you can both read them, then they are deleted.' },
];

export default async function Landing() {
  if (await getCurrentUser()) redirect('/app');
  const wheelPeople = cafeGuestRoster().map((guest) => ({
    id: guest.id,
    name: guest.name,
    city: guest.city,
    country: guest.country,
    bio: guest.bio,
    languageLabel: languageName(guest.language),
    interests: guest.interests,
    age: ageFromBirthDate(new Date(guest.birth)),
    guest: true,
  }));
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
        <p className="chip mx-auto mb-6">Adults 18+ · Your language · Their language</p>
        <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
          {LINE}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-300">
          They read a live translation. You read theirs. This is a conversation about everyday life — not dating, not a language class.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/register" className="btn-primary px-6 py-3 text-base">Join the Café</Link>
          <Link href="/login" className="btn-secondary px-6 py-3 text-base">I have an account</Link>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {SHOWCASE.map((code) => LANGUAGES.find((l) => l.code === code)!).map((l) => (
            <Link key={l.code} href="/register" className="chip" dir={l.rtl ? 'rtl' : 'ltr'}>{l.nativeName}</Link>
          ))}
          <Link href="/register" className="chip">+{LANGUAGES.length - SHOWCASE.length} more languages</Link>
        </div>
      </section>

      <section className="card">
        <LandingWheel people={wheelPeople} />
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {FEATURES.map((f) => (
          <Link key={f.t} href="/register" className="card block transition hover:border-brand-500/40">
            <h3 className="font-semibold text-white">{f.t}</h3>
            <p className="mt-2 text-sm text-ink-300">{f.d}</p>
          </Link>
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
