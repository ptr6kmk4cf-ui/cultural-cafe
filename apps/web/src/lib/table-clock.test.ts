import assert from 'node:assert/strict';
import test from 'node:test';
import { AUTO_AFTER_BUBBLE_MS, GUEST_ANSWER_MS, SEND_DEBOUNCE_MS, remainingWait } from './table-clock';

test('translation and writing count toward the guest budget', () => {
  assert.equal(SEND_DEBOUNCE_MS, 400);
  assert.equal(GUEST_ANSWER_MS, 1200);
  assert.equal(AUTO_AFTER_BUBBLE_MS, 1200);
  assert.equal(remainingWait(1000, 1200, 1000), 1200);
  assert.equal(remainingWait(1000, 1200, 1800), 400);
  assert.equal(remainingWait(1000, 1200, 2500), 0);
  assert.equal(remainingWait(1000, 1200, 4000), 0);
});
