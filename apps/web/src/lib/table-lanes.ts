/**
 * Café jobs wait on the network or the database. Node and the browser run
 * them together on the event loop (concurrent async, not OS threads).
 * A late result must not overwrite a newer click.
 */
export type TableLane = 'suggest' | 'translate' | 'send' | 'guest';

export function bump(slot: { current: number }) {
  slot.current += 1;
  return slot.current;
}

export function live(slot: { current: number }, gen: number) {
  return slot.current === gen;
}

/** Run independent work a few at a time. Order of completion does not matter. */
export async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  if (!items.length) return;
  const queue = items.slice();
  const workers = Array.from({ length: Math.min(Math.max(1, size), queue.length) }, async () => {
    for (;;) {
      const item = queue.shift();
      if (item === undefined) return;
      await fn(item);
    }
  });
  await Promise.all(workers);
}
