'use client';

import { createContext, useContext } from 'react';
import { uiFrom, type UiKey, type UiPack, type UiVars } from '@/lib/ui-copy';

const LocaleContext = createContext<{ lang: string; pack?: UiPack }>({ lang: 'en' });

export function UiLocale({ lang, pack, children }: { lang: string; pack?: UiPack; children: React.ReactNode }) {
  return <LocaleContext.Provider value={{ lang, pack }}>{children}</LocaleContext.Provider>;
}

export function useUi() {
  const { lang, pack } = useContext(LocaleContext);
  return {
    lang,
    t: (key: UiKey, vars?: UiVars) => uiFrom(pack, key, vars),
  };
}
