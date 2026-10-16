import Link from 'next/link';
import { BrandMark } from '@/components/BrandMark';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-center">
      <div className="flex justify-center">
        <BrandMark />
      </div>
      <h1 className="mt-10 text-2xl font-bold text-white">This page is not in the café.</h1>
      <p className="mt-3 text-ink-300">The table or link you opened is gone. Come back to the room.</p>
      <Link href="/" className="btn-primary mt-8 inline-flex px-6 py-3">
        Cultural Café
      </Link>
    </main>
  );
}
