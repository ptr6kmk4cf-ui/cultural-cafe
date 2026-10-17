import assert from 'node:assert/strict';
import test from 'node:test';
import { cafeGuestEmailForSit, cafeGuestRoster, cafeGuestSitKey } from './services/cafe-guests';
import { afterRegisterPath, loginHrefForSit, normalizeSitKey, openSitPath, registerHrefForSit } from './landing-sit';

test('a spun guest is a short seat key, not their display name', () => {
  assert.equal(normalizeSitKey('Ana'), 'ana');
  assert.equal(normalizeSitKey('../ines'), '');
  assert.equal(cafeGuestSitKey('guest.ana@culturalcafe.invalid'), 'ana');
  assert.equal(cafeGuestEmailForSit('Ana'), 'guest.ana@culturalcafe.invalid');
  assert.equal(cafeGuestEmailForSit('nobody'), '');
  const ana = cafeGuestRoster().find((guest) => guest.id === 'ana');
  assert.equal(ana?.name, 'Ana');
  assert.equal(ana?.city, 'Zagreb');
  assert.ok(cafeGuestRoster().every((guest) => guest.id && cafeGuestEmailForSit(guest.id)));
});

test('after you register from the wheel you go to that table', () => {
  assert.equal(registerHrefForSit('Ana'), '/register?sit=ana');
  assert.equal(openSitPath('ana'), '/app/world/open/ana');
  assert.equal(afterRegisterPath({ sit: 'ana' }), '/app/world/open/ana');
  assert.equal(afterRegisterPath({ sit: 'ana', invite: 'abcd2' }), '/app/world/open/ana');
  assert.equal(afterRegisterPath({ invite: 'abcd2' }), '/app/world?from=friend');
  assert.equal(afterRegisterPath({}), '/app?welcome=1');
  assert.equal(loginHrefForSit('pemba'), '/login?next=%2Fapp%2Fworld%2Fopen%2Fpemba');
});
