import Link from 'next/link';
import { redirect } from 'next/navigation';
import { languageName } from '@conversa/shared';
import { BrandMark } from '@/components/BrandMark';
import { LandingWheel } from '@/components/LandingWheel';
import { ageFromBirthDate, getCurrentUser } from '@/lib/auth';
import { cafeGuestRoster } from '@/lib/services/cafe-guests';

const LINE = 'Take a table with an adult in another country. You write in your own language.';

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

      <section className="py-12 text-center">
        <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
          {LINE}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-300">
          They read a live translation. You read theirs. Adults 18+ only.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/register" className="btn-primary px-6 py-3 text-base">Join the Café</Link>
          <Link href="/login" className="btn-secondary px-6 py-3 text-base">I have an account</Link>
        </div>
      </section>

      <section className="card">
        <LandingWheel people={wheelPeople} />
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
