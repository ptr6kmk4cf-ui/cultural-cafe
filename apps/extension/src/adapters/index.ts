import { platformForOrigin } from '@conversa/shared';
import type { SiteAdapter } from './types';
import { demoAdapter } from './demo';

const ADAPTERS: Record<string, SiteAdapter> = {
  'conversa-demo': demoAdapter,
};

export function adapterForLocation(loc: Location = window.location): SiteAdapter | null {
  const platform = platformForOrigin(loc.origin);
  return platform ? ADAPTERS[platform.id] ?? null : null;
}
