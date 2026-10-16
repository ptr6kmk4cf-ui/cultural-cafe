import assert from 'node:assert/strict';
import test from 'node:test';
import { bump, live, pool } from './table-lanes';

test('a late table job cannot overwrite a newer one', () => {
  const slot = { current: 0 };
  const first = bump(slot);
  const second = bump(slot);
  assert.equal(live(slot, first), false);
  assert.equal(live(slot, second), true);
});

test('independent jobs can run a few at a time', async () => {
  const seen: number[] = [];
  let inflight = 0;
  let peak = 0;
  await pool([1, 2, 3, 4, 5], 2, async (n) => {
    inflight += 1;
    peak = Math.max(peak, inflight);
    await new Promise((r) => setTimeout(r, 5));
    seen.push(n);
    inflight -= 1;
  });
  assert.equal(seen.length, 5);
  assert.ok(peak <= 2);
  assert.ok(peak >= 2);
});
