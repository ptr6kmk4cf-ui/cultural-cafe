import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupPastContacts } from './past-sit';
import { browseBlocksAlreadyMet } from './services/world';

test('A past contact can sit again, including a real person you already met', () => {
  assert.equal(browseBlocksAlreadyMet(false, true), false);
  assert.equal(browseBlocksAlreadyMet(true, true), false);
});

test('Spin still skips a real person you already sat with', () => {
  assert.equal(browseBlocksAlreadyMet(false, false), true);
  assert.equal(browseBlocksAlreadyMet(true, false), false);
});

test('Past contacts put people who are here now at the top', () => {
  const listed = groupPastContacts([
    { id: '1', status: 'ENDED', startedAt: '2026-10-17', peer: { id: 'ana', name: 'Ana', online: false } },
    { id: '2', status: 'ENDED', startedAt: '2026-10-16', peer: { id: 'priya', name: 'Priya', online: true } },
    { id: '3', status: 'ACTIVE', startedAt: '2026-10-17', peer: { id: 'open', name: 'Open', online: true } },
  ]);
  assert.equal(listed.map((c) => c.peer?.name).join(','), 'Priya,Ana');
  assert.equal(listed[0]?.peer?.online, true);
});
