import Link from 'next/link';

export function BrandMark({ href = '/', compact = false }: { href?: string; compact?: boolean }) {
  const mark = (
    <span className="flex items-center gap-2 font-bold text-white">
      <span className={`grid place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-amber-800 text-white ${compact ? 'h-7 w-7 text-sm' : 'h-8 w-8 text-base'}`}>
        C
      </span>
      {!compact && <span className="text-lg">Cultural Café</span>}
    </span>
  );
  return href ? <Link href={href}>{mark}</Link> : mark;
}
