import assert from 'node:assert/strict';
import test from 'node:test';
import { ui } from './ui';
import { localeFromAcceptLanguage } from './ui-locale';

test('the browser language picks a café language', () => {
  assert.equal(localeFromAcceptLanguage('fr-FR,fr;q=0.9,en;q=0.8'), 'fr');
  assert.equal(localeFromAcceptLanguage('en-US,en;q=0.9'), 'en');
  assert.equal(localeFromAcceptLanguage('nb-NO,nb;q=0.9'), 'no');
  assert.equal(localeFromAcceptLanguage('zh-Hans,zh;q=0.8'), 'zh');
  assert.equal(localeFromAcceptLanguage('xx-YY,*;q=0.1'), 'en');
  assert.equal(localeFromAcceptLanguage(null), 'en');
});

test('a missing translation stays in English and keeps names', () => {
  assert.equal(ui('zz', 'wantsToSit', { name: 'Lindiwe' }), 'Lindiwe wants to sit with you.');
  assert.equal(ui('en', 'copyLink'), 'Copy link');
  assert.equal(ui('fr', 'reportReason'), 'Reason: harassment, spam, scam, underage_concern, or other');
});
