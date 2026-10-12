import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ABANDON_MS, activeTablesToClose, type OpenTable } from './auto-repair';

const now = Date.parse('2026-10-12T17:00:00.000Z');

function table(partial: Partial<OpenTable> & Pick<OpenTable, 'id'>): OpenTable {
  return {
    userAId: 'jacky',
    userBId: 'guest',
    startedAt: new Date(now - 10 * 60_000),
    endsAt: new Date(now + 50 * 60_000),
    linkSeenAt: new Date(now - 10_000),
    ...partial,
  };
}

test('A live table is left open', () => {
  assert.deepEqual(activeTablesToClose([table({ id: 'live' })], now), []);
});

test('A finished hour and an abandoned table are closed', () => {
  const ids = activeTablesToClose([
    table({ id: 'over', endsAt: new Date(now - 1000) }),
    table({ id: 'empty', linkSeenAt: null, startedAt: new Date(now - ABANDON_MS - 1000) }),
    table({ id: 'live' }),
  ], now);
  assert.deepEqual(ids.sort(), ['empty', 'over']);
});

test('A new table is not treated as abandoned before anyone arrives', () => {
  assert.deepEqual(activeTablesToClose([
    table({ id: 'just-sat', startedAt: new Date(now - 30_000), linkSeenAt: null }),
  ], now), []);
});

test('The older of two open tables for the same person is closed', () => {
  const ids = activeTablesToClose([
    table({ id: 'older', startedAt: new Date(now - 20 * 60_000) }),
    table({ id: 'newer', userBId: 'other', startedAt: new Date(now - 5 * 60_000) }),
  ], now);
  assert.deepEqual(ids, ['older']);
});
