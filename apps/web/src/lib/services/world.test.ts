import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cafePromptFor } from '@conversa/shared';
import { firstName } from './world';

test('World cards show a first name only', () => {
  assert.equal(firstName('Lucía Hernández'), 'Lucía');
  assert.equal(firstName('  Yuki  '), 'Yuki');
  assert.equal(firstName(''), 'Traveler');
});

test('A café conversation always gets the same table topic', () => {
  const a = cafePromptFor('conv_abc');
  const b = cafePromptFor('conv_abc');
  const c = cafePromptFor('conv_xyz');
  assert.equal(a.id, b.id);
  assert.ok(a.question.length > 10);
  assert.notEqual(a.id, c.id);
});
