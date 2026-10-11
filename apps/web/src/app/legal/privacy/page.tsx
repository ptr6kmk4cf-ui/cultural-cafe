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
        <li>Your settings: personality, language and match preferences.</li>
        <li>Contacts you add or track, their conversation history and memories — encrypted at rest (AES-256-GCM).</li>
        <li>Shortlisted matches only. Profiles that are screened and not recommended are never stored.</li>
        <li>Photos you upload, with location and other metadata removed, in private storage.</li>
        <li>AI usage counters (feature, tokens) for quotas and billing — not message content.</li>
      </ul>
      <h2 className="text-lg font-semibold text-white">What we never do</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Collect your general browsing activity. The extension only runs on supported sites.</li>
        <li>Sell personal data, or use your conversations to train models.</li>
        <li>Infer sensitive characteristics (health, religion, ethnicity, orientation…) from profiles or photos.</li>
      </ul>
      <h2 className="text-lg font-semibold text-white">Third parties</h2>
      <p>Text (and, if you enable photo analysis, downscaled public profile photos) is sent to the configured AI provider to generate suggestions. Payments are processed by Stripe.</p>
      <h2 className="text-lg font-semibold text-white">Your rights</h2>
      <p>You can review, correct, export and delete your data at any time from Privacy &amp; Account, including per-contact memory export and full account deletion.</p>
      <h2 className="text-lg font-semibold text-white">People you talk to</h2>
      <p>Contacts&apos; messages are processed to help you reply. Use Cultural Café respectfully, honour requests to stop, and disclose AI assistance where the platform or local law requires it.</p>
    </main>
  );
}
