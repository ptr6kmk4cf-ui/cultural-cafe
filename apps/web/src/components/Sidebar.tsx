'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV = [
  { href: '/app', label: 'Home', icon: '⌂' },
  { href: '/app/world#profile', label: 'Your profile', icon: '☺' },
  { href: '/app/world#meet', label: 'Meet someone', icon: '☕' },
  { href: '/app/world#wheel', label: 'Spin', icon: '✺' },
  { href: '/app/world/map', label: 'Map', icon: '◎' },
  { href: '/app/conversations', label: 'Past contacts', icon: '✉' },
  { href: '/app/languages', label: 'Language', icon: 'A' },
  { href: '/app/photos', label: 'Photo', icon: '▣' },
  { href: '/app/privacy', label: 'Account', icon: '⚿' },
];

export function Sidebar({ user }: { user: { name: string; email: string; plan: string; role: string } }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [hash, setHash] = useState('');
  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [path]);
  const active = (href: string) => {
    const [base, fragment] = href.split('#');
    if (fragment === 'profile') return path === base && (hash === '#profile' || hash === '');
    if (fragment) return path === base && hash === `#${fragment}`;
    return href === '/app' ? path === '/app' : path.startsWith(href);
  };
  const current = path.startsWith('/app/admin/links')
    ? 'Live links'
    : path.startsWith('/app/world/map')
      ? 'Map'
      : path.startsWith('/app/world/')
        ? 'Café'
        : (NAV.find((n) => active(n.href))?.label ?? (path.startsWith('/app/admin') ? 'Admin' : 'Cultural Café'));

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex items-center gap-3 border-b border-white/5 bg-ink-900/95 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
        <button className="rounded-lg bg-white/5 px-3 py-2 text-white" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
          ☰
        </button>
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-amber-800 text-sm font-bold text-white">C</span>
        <span className="truncate text-sm font-semibold text-white">{current}</span>
      </header>
      {open && <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] transform flex-col border-r border-white/5 bg-ink-900 p-4 pt-[max(1rem,env(safe-area-inset-top))] transition md:sticky md:top-0 md:z-auto md:h-screen md:w-64 md:translate-x-0 md:bg-ink-900/95 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Link href="/app" onClick={() => setOpen(false)} className="mb-6 flex items-center gap-2 px-2 text-lg font-bold text-white">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-amber-800">C</span>
          Cultural Café
        </Link>
        <nav className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => {
                setOpen(false);
                const [base, fragment] = n.href.split('#');
                if (!fragment) return;
                setHash(`#${fragment}`);
                if (window.location.pathname === base) {
                  const el = document.getElementById(fragment);
                  if (el) {
                    const top = el.getBoundingClientRect().top + window.scrollY - 96;
                    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
                  }
                }
              }}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition md:py-2 ${active(n.href) ? 'bg-gradient-to-r from-brand-500/20 to-amber-700/10 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white'}`}
            >
              <span className="w-4 text-center text-xs opacity-80">{n.icon}</span>
              {n.label}
            </Link>
          ))}
          {user.role === 'ADMIN' && (
            <>
              <Link href="/app/admin" onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm md:py-2 ${path === '/app/admin' ? 'bg-white/10 text-white' : 'text-ink-300 hover:bg-white/5'}`}>
                <span className="w-4 text-center text-xs">⚙</span>Admin
              </Link>
              <Link href="/app/admin/links" onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm md:py-2 ${active('/app/admin/links') ? 'bg-white/10 text-white' : 'text-ink-300 hover:bg-white/5'}`}>
                <span className="w-4 text-center text-xs">↔</span>Live links
              </Link>
            </>
          )}
        </nav>
        <div className="mt-3 rounded-xl border border-white/5 bg-white/5 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-xs">
          <Link href="/app/privacy" onClick={() => setOpen(false)} className="block truncate font-semibold text-white hover:underline">
            {user.name}
          </Link>
          <p className="truncate text-ink-400">{user.email}</p>
          <div className="mt-2 flex items-center justify-between">
            <Link
              href="/app/subscription"
              onClick={() => setOpen(false)}
              className={`rounded-full px-2 py-0.5 hover:underline ${user.plan === 'PREMIUM' ? 'bg-brand-500/20 text-brand-200' : 'bg-white/10 text-ink-200'}`}
            >
              {user.plan}
            </Link>
            <button
              className="text-ink-300 hover:text-white"
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.href = '/';
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
