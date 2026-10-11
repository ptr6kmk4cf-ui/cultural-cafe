import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstName } from './world';

test('World cards show a first name only', () => {
  assert.equal(firstName('Lucía Hernández'), 'Lucía');
  assert.equal(firstName('  Yuki  '), 'Yuki');
  assert.equal(firstName(''), 'Traveler');
});
