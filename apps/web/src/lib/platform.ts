import { getPlatform, type PlatformCapabilities } from '@conversa/shared';
import { HttpError } from './http';

export function assertCapability(platformId: string, cap: keyof PlatformCapabilities) {
  const p = getPlatform(platformId);
  if (!p) throw new HttpError(403, 'This site is not a supported integration.', 'platform_unsupported');
  if (!p.capabilities[cap]) throw new HttpError(403, `"${cap}" is not authorised on ${p.name}.`, 'capability_denied');
  return p;
}
