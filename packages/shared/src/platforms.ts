/**
 * Registry of sites Conversa AI integrates with, and what each integration is
 * authorised to do. The server is the source of truth: it re-checks these
 * capabilities on every request, so a modified extension cannot grant itself
 * extra permissions.
 *
 * External dating sites are deliberately absent. A site may only be added here
 * once there is a written agreement / official API permitting the listed
 * capabilities. A Chrome permission does NOT override a site's terms of service.
 */
export interface PlatformCapabilities {
  /** Read profile cards / profile pages the user is viewing. */
  discovery: boolean;
  /** Read the open conversation thread. */
  readConversation: boolean;
  /** Insert text into the composer (user still clicks Send). */
  insertText: boolean;
  /** Attach a photo to the composer (user still clicks Send). */
  attachPhoto: boolean;
  /** Send without a human click (Autopilot). */
  autoSend: boolean;
}

export interface PlatformInfo {
  id: string;
  name: string;
  origins: string[];
  demo: boolean;
  verified: boolean;
  capabilities: PlatformCapabilities;
  notes: string;
}

export const PLATFORMS: Record<string, PlatformInfo> = {
  'conversa-demo': {
    id: 'conversa-demo',
    name: 'Conversa Demo Dating (local, fictional)',
    origins: ['http://localhost:4000', 'http://127.0.0.1:4000'],
    demo: true,
    verified: false,
    capabilities: {
      discovery: true,
      readConversation: true,
      insertText: true,
      attachPhoto: true,
      autoSend: true,
    },
    notes: 'Local demonstration site with fictional adult profiles. All capabilities enabled for testing.',
  },
};

export function platformForOrigin(origin: string): PlatformInfo | null {
  return Object.values(PLATFORMS).find((p) => p.origins.includes(origin)) ?? null;
}

export function getPlatform(id: string | null | undefined): PlatformInfo | null {
  return id ? PLATFORMS[id] ?? null : null;
}
