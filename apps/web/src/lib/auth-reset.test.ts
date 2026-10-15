import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resetMail, resetPath } from './auth-reset';

test('a password reset mail points at the token and does not invent an account', () => {
  const path = resetPath('abc+token');
  assert.equal(path, '/reset?token=abc%2Btoken');
  const mail = resetMail({ name: 'Nathaly', url: `https://culturalcafe.online${path}` });
  assert.match(mail.subject, /password/i);
  assert.match(mail.text, /Nathaly/);
  assert.match(mail.text, /culturalcafe.online\/reset\?token=/);
  assert.match(mail.text, /one hour/);
});
