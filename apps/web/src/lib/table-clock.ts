/**
 * One clock for a table round. Translation and answer production count toward
 * the same budget. Extra wait is only the time still left.
 */
export const SEND_DEBOUNCE_MS = 400;
/** Fake guest: show their bubble this long after Send, including translate + write. */
export const GUEST_ANSWER_MS = 1200;
/** Auto Answer: after their bubble is on screen. Hear does not add to this. */
export const AUTO_AFTER_BUBBLE_MS = 1200;

/** Milliseconds still owed on a budget. Already-spent work is not added on top. */
export function remainingWait(startedAt: number, budgetMs: number, now = Date.now()) {
  if (budgetMs <= 0) return 0;
  return Math.max(0, budgetMs - Math.max(0, now - startedAt));
}
