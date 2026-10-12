import { runAutoRepair } from './auto-repair';
import { db } from './db';

/**
 * When a task is finished, discard every row that existed only to carry that
 * task out. A row stays only when a later action still needs it.
 * Past contacts stay until that person is removed. Blocks, reports, saved
 * topics, contacts, messages, photos, and memories stay.
 */
const DISCARD_EVERY_MS = 60_000;
let lastDiscard = 0;

export async function dropFinishedInvite(id: string) {
  await db.worldInvite.deleteMany({ where: { id } });
}

/** Runs the auto-repair. Signed-in requests call this, so a stuck state does not wait for a person to notice it. */
export async function discardFinishedWork(force = false) {
  const nowMs = Date.now();
  if (!force && nowMs - lastDiscard < DISCARD_EVERY_MS) return;
  lastDiscard = nowMs;
  const repairs = await runAutoRepair(nowMs);
  if (repairs.length) console.info('[auto-repair]', repairs.join('; '));
}
