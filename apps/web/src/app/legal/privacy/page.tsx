import Link from 'next/link';

export default function Privacy() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-6 py-12 text-sm leading-relaxed text-ink-200">
      <Link href="/" className="text-brand-300">← Back</Link>
      <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
      <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100">
        PLACEHOLDER — this draft describes how the software behaves. It must be reviewed by a qualified lawyer and completed with your company details,
        legal bases, processors and retention periods before commercial launch.
      </p>
      <h2 className="text-lg font-semibold text-white">What we store</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Account data: email, name, date of birth (to confirm you are 18+), hashed password.</li>
        <li>Your café card: city, country, a few words, optional photo, language.</li>
        <li>Who met, when, and the table topic. Not the lines you wrote.</li>
        <li>Photos you upload, with location and other metadata removed.</li>
      </ul>
      <h2 className="text-lg font-semibold text-white">What we never do</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Keep café chat text or files you send each other. That stays on your device only if you choose it.</li>
        <li>Sell personal data, or use your conversations to train models.</li>
        <li>Infer sensitive characteristics from your card or photos.</li>
      </ul>
      <h2 className="text-lg font-semibold text-white">Third parties</h2>
      <p>A line is sent to the translator when you tap Send, then it goes to the other person’s phone. We do not keep a copy.</p>
      <h2 className="text-lg font-semibold text-white">Your rights</h2>
      <p>You can export and delete your account at any time from Account.</p>
      <h2 className="text-lg font-semibold text-white">People you talk to</h2>
      <p>Treat people in the Café with respect. Honour a request to stop. This is not dating.</p>
    </main>
  );
}
