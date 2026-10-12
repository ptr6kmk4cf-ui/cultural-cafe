import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cafePromptFor, cafePromptFromPool } from '@conversa/shared';
import { icePayload, parseSignalBody, signalPhase } from '../world-signal';
import { cafeGuestEmails, guestFollowUp, guestSlots, hardcodedTableReply, nextHardcodedTableLine } from './cafe-guests';
import { INVITE_CODE_LENGTH, firstName, friendInviteMessage, friendJoinPath, isInviteCode, newInviteCode, normalizeInviteCode } from './world';

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

test('A saved topic can be found for a later table', () => {
  const ideas = [{ id: 'night', text: 'Night trains' }];
  assert.deepEqual(cafePromptFromPool('conv_abc', []), cafePromptFor('conv_abc'));
  const again = cafePromptFromPool('conv_abc', ideas);
  assert.deepEqual(again, cafePromptFromPool('conv_abc', ideas));
  let found = false;
  for (let i = 0; i < 40; i++) {
    if (cafePromptFromPool(`later_${i}`, ideas).question.includes('Night trains')) found = true;
  }
  assert.equal(found, true);
});

test('Friend invite codes are short and unambiguous', () => {
  const code = newInviteCode();
  assert.equal(code.length, INVITE_CODE_LENGTH);
  assert.equal(isInviteCode(code), true);
  assert.equal(isInviteCode('ABCDEFGH'), false);
  assert.equal(isInviteCode('short'), false);
  assert.equal(normalizeInviteCode(`  ${code.toUpperCase()}  `), code);
  assert.equal(normalizeInviteCode('not-a-code'), null);
  assert.equal(friendJoinPath(code), `/join/${code}`);
  assert.match(friendInviteMessage('https://culturalcafe.online/join/ab3dkmnp'), /Cultural Café/);
});

test('A café guest answers the last line and then changes topic', () => {
  const email = 'guest.lena@culturalcafe.invalid';
  const first = guestFollowUp(email, [], 'The tram in my city is loud.');
  const second = guestFollowUp(email, [first?.text ?? ''], 'We eat fish on Friday.');
  assert.equal(first?.english.includes('The tram in my city is loud.'), false);
  assert.equal(second?.english.includes('We eat fish on Friday.'), false);
  assert.match(first?.english ?? '', /Tram 28/);
  assert.match(second?.english ?? '', /grilled fish/);
  assert.notEqual(first?.text, second?.text);
  assert.notEqual(first?.english, second?.english);
  const said = [first?.text ?? '', second?.text ?? ''];
  let latest = 'The bakery opens early.';
  while (true) {
    const next = guestFollowUp(email, said, latest);
    if (!next) break;
    said.push(next.text);
    latest = 'Another ordinary day.';
  }
  assert.equal(guestFollowUp(email, said, latest), null);
});

test('Automatic answering at a guest table uses each hardcoded line once', () => {
  const first = hardcodedTableReply([], 'Evenings smell like bread.');
  const second = hardcodedTableReply([first ?? ''], 'We sit outside on Sunday.');
  assert.equal(first?.includes('Evenings smell like bread.'), false);
  assert.equal(second?.includes('We sit outside on Sunday.'), false);
  assert.match(first ?? '', /morning is the street waking up/);
  assert.match(second ?? '', /normal Sunday/);
  assert.notEqual(first, second);
  const said = [first ?? ''];
  while (nextHardcodedTableLine(said)) said.push(nextHardcodedTableLine(said) as string);
  assert.equal(hardcodedTableReply(said, 'Another line.'), null);
});

test('Café guests step aside as real people join', () => {
  assert.equal(guestSlots(0), 6);
  assert.equal(guestSlots(2), 4);
  assert.equal(guestSlots(6), 0);
  assert.equal(guestSlots(9), 0);
  assert.equal(guestSlots(-1), 6);
  const emails = cafeGuestEmails();
  assert.equal(emails.length, 6);
  assert.equal(new Set(emails).size, emails.length);
  assert.ok(emails.every((email) => email.endsWith('@culturalcafe.invalid')));
});

test('WebRTC signal payloads keep ICE candidates in one batch', () => {
  const payload = icePayload('try1', [
    { candidate: 'candidate:1 1 udp 1 1.1.1.1 9 typ host', sdpMid: '0', sdpMLineIndex: 0 },
    { candidate: 'candidate:2 1 udp 2 2.2.2.2 9 typ srflx', sdpMid: '0', sdpMLineIndex: 0 },
  ]);
  const body = parseSignalBody(payload);
  assert.equal(body?.attemptId, 'try1');
  assert.equal(body?.candidates.length, 2);
  const single = parseSignalBody(JSON.stringify({ attemptId: 'try1', candidate: { candidate: 'candidate:1 1 udp 1 1.1.1.1 9 typ host' } }));
  assert.equal(single?.candidates.length, 1);
  const restart = parseSignalBody(JSON.stringify({ attemptId: 'try1' }));
  assert.equal(restart?.attemptId, 'try1');
  assert.equal(restart?.candidates.length, 0);
  assert.equal(parseSignalBody('not-json'), null);
  assert.equal(signalPhase('offer', payload), 'connecting');
  assert.equal(signalPhase('restart', payload), 'restarting');
  assert.equal(signalPhase('state', JSON.stringify({ attemptId: 'try1', phase: 'open' })), 'open');
  assert.equal(signalPhase('ice', payload), null);
});
