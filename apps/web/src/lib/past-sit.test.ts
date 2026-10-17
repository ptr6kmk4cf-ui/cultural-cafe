import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browseBlocksAlreadyMet } from './services/world';

test('A past contact can sit again, including a real person you already met', () => {
  assert.equal(browseBlocksAlreadyMet(false, true), false);
  assert.equal(browseBlocksAlreadyMet(true, true), false);
});

test('Spin still skips a real person you already sat with', () => {
  assert.equal(browseBlocksAlreadyMet(false, false), true);
  assert.equal(browseBlocksAlreadyMet(true, false), false);
});
