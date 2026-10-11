import type { MatchRecommendation, ProfileInput } from '@conversa/shared';
import type { SiteAdapter } from '../adapters/types';
import { sleep } from '../adapters/dom';
import { api } from '../lib/messages';

type ActResult =
  | { action: 'send'; text: string; contactId: string; remainingToday?: number }
  | { action: 'skip' | 'blocked' | 'escalate' | 'stopped'; reason: string; contactId?: string; suggestion?: string };

export type LogFn = (line: string, tone?: 'ok' | 'warn' | 'err' | 'info') => void;

/**
 * Drives Autopilot on the current tab. Every step asks the server first
 * (`/api/autopilot/act`), which enforces authorisation, limits, consent and
 * escalation rules. `stop()` halts immediately, including between insert and send.
 */
export class AutopilotRunner {
  running = false;
  private handled = new Map<string, string>();

  constructor(
    private adapter: SiteAdapter,
    private log: LogFn,
    private onStateChange: (running: boolean) => void,
  ) {}

  stop(reason = 'Stopped') {
    if (!this.running) return;
    this.running = false;
    this.onStateChange(false);
    this.log(`■ ${reason}`, 'warn');
  }

  private start() {
    this.running = true;
    this.onStateChange(true);
  }

  /** Global blocks (plan, emergency stop, off, daily limit) end the run; per-contact blocks don't. */
  private isGlobalBlock(r: ActResult) {
    return r.action === 'blocked' && !r.contactId;
  }

  private async sendCurrent(text: string, delayMs: number) {
    if (!this.adapter.insertText(text)) throw new Error('Could not find the message box');
    await sleep(delayMs);
    if (!this.running) {
      this.log('Stopped before sending — message left in the box, not sent.', 'warn');
      return false;
    }
    return this.adapter.clickSend();
  }

  async runReplies() {
    if (this.adapter.pageKind() !== 'messages') return this.log('Open the Messages page to auto-reply.', 'err');
    this.start();
    this.log('▶ Auto-reply started. Watching for new messages…', 'info');
    while (this.running) {
      const unread = this.adapter.listThreads().filter((t) => t.unread);
      for (const t of unread) {
        if (!this.running) break;
        if (!(await this.adapter.openThread(t.threadId))) continue;
        const snap = this.adapter.readThread();
        const last = snap?.messages.at(-1);
        if (!snap || !last || last.direction !== 'IN' || this.handled.get(t.threadId) === last.externalId) continue;
        this.handled.set(t.threadId, last.externalId);
        let r: ActResult;
        try {
          r = await api<ActResult>('/api/autopilot/act', { kind: 'reply', platform: this.adapter.platformId, snapshot: snap });
        } catch (e) {
          this.log(`Error: ${(e as Error).message}`, 'err');
          continue;
        }
        if (!this.running) break;
        if (r.action === 'send') {
          const sent = await this.sendCurrent(r.text, 1500);
          if (sent) this.log(`✓ Replied to ${snap.contactName}: “${r.text.slice(0, 60)}${r.text.length > 60 ? '…' : ''}”`, 'ok');
        } else {
          this.log(`${r.action === 'escalate' ? '⚑ Needs you' : r.action === 'stopped' ? '✋ Stopped' : '–'} ${snap.contactName}: ${r.reason}`, r.action === 'escalate' || r.action === 'stopped' ? 'warn' : 'info');
          if (this.isGlobalBlock(r)) this.stop(r.reason);
        }
        await sleep(1200);
      }
      for (let i = 0; i < 25 && this.running; i++) await sleep(200);
    }
  }

  async runFirstContacts(profiles: ProfileInput[], recs: MatchRecommendation[]) {
    if (this.adapter.pageKind() !== 'discover') return this.log('Open the Discover page to send first messages.', 'err');
    this.start();
    this.log(`▶ First-contact run for ${recs.length} shortlisted match(es).`, 'info');
    for (const rec of recs) {
      if (!this.running) break;
      const profile = profiles.find((p) => p.externalId === rec.externalId);
      if (!profile) continue;
      let r: ActResult;
      try {
        r = await api<ActResult>('/api/autopilot/act', { kind: 'first_contact', platform: this.adapter.platformId, profile: { ...profile, photos: [] } });
      } catch (e) {
        this.log(`Error: ${(e as Error).message}`, 'err');
        continue;
      }
      if (!this.running) break;
      if (r.action === 'send') {
        this.adapter.openComposer(rec.externalId);
        await sleep(400);
        if (await this.sendCurrent(r.text, 1500)) this.log(`✓ Opened with ${rec.name}: “${r.text.slice(0, 60)}…”`, 'ok');
        await sleep(1500);
      } else {
        this.log(`– ${rec.name}: ${r.reason}`, r.action === 'escalate' ? 'warn' : 'info');
        if (this.isGlobalBlock(r)) {
          this.stop(r.reason);
          break;
        }
      }
    }
    if (this.running) {
      this.running = false;
      this.onStateChange(false);
      this.log('First-contact run finished.', 'info');
    }
  }
}
