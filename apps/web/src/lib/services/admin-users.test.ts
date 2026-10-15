import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registeredUserWhere, toRegisteredAccount } from './admin-users';

test('a registered account row is email and password, never a hash', () => {
  const row = toRegisteredAccount({
    id: 'u1',
    email: 'jacky899@hotmail.com',
    name: 'Jacky',
    role: 'ADMIN',
    plan: 'FREE',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
  });
  assert.equal(row.email, 'jacky899@hotmail.com');
  assert.equal(row.signIn, 'Email and password');
  assert.equal(row.registeredAt, '2026-10-01T10:00:00.000Z');
  assert.equal('password' in row, false);
  assert.equal('passwordHash' in row, false);
  assert.deepEqual(registeredUserWhere(), { synthetic: false });
});
