import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cafePromptFor, cafePromptFromPool } from '@conversa/shared';
import { icePayload, parseSignalBody, signalPhase } from '../world-signal';
import { cafeGuestEmails, guestFollowUp, guestSlots, hardcodedTableReply, isLooseCafeEmail, nextHardcodedTableLine, scriptedGuestTurn } from './cafe-guests';
import { INVITE_CODE_LENGTH, firstName, friendInviteMessage, friendJoinPath, isInviteCode, newInviteCode, normalizeInviteCode } from './world';

test('Old test accounts are not café people', () => {
  assert.equal(isLooseCafeEmail('mei.chengdu@culturalcafe.test'), true);
  assert.equal(isLooseCafeEmail('demo@conversa.local'), true);
  assert.equal(isLooseCafeEmail('guest.mei@culturalcafe.invalid'), false);
  assert.equal(isLooseCafeEmail('someone@gmail.com'), false);
});

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

test('Hassan answers the neighbour question instead of repeating himself', () => {
  const stock = 'I am glad to hear that. Here we walk the corniche slowly. What reminds you of home?';
  const user = 'The sound of waves along the Promenade in Nice is what reminds me of home too, Hassan. On your slow corniche walks, do neighbours greet each other with a word or just a wave?';
  const answer = scriptedGuestTurn('guest.hassan@culturalcafe.invalid', [
    { mine: false, text: 'يسعدني هذا. هنا نمشي على الكورنيش ببطء. ما الذي يذكرك ببيتك؟', translation: stock },
    { mine: true, text: user },
  ], 'en', 'How do neighbours greet each other where you live?');
  assert.match(answer?.translation ?? '', /word first/i);
  assert.match(answer?.translation ?? '', /small wave/i);
  assert.equal(answer?.translation?.includes(stock), false);
  assert.equal(/[\u4E00-\u9FFF]/.test(answer?.translation ?? ''), false);
  const again = scriptedGuestTurn('guest.hassan@culturalcafe.invalid', [
    { mine: false, text: 'x', translation: stock },
    { mine: true, text: user },
    { mine: false, text: answer?.text ?? '', translation: answer?.translation },
    { mine: true, text: 'And on a Sunday?' },
  ], 'en');
  assert.match(again?.translation ?? '', /Sunday/i);
  assert.notEqual(again?.translation, answer?.translation);
  assert.equal(again?.translation?.includes(stock), false);
});

test('A guest hello is the written English line, not a translation', () => {
  const hello = scriptedGuestTurn('guest.lena@culturalcafe.invalid', [], 'en');
  assert.match(hello?.translation ?? '', /tram/i);
  assert.equal(/[\u4E00-\u9FFF]/.test(hello?.translation ?? ''), false);
  assert.equal(/[\u4E00-\u9FFF]/.test(hello?.text ?? ''), false);
  const answer = scriptedGuestTurn('guest.lena@culturalcafe.invalid', [
    { mine: false, text: hello?.text ?? '' },
    { mine: true, text: 'The tram in my city is quiet.' },
  ], 'en');
  assert.match(answer?.translation ?? '', /Tram 28/);
  assert.equal(answer?.closed, false);
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

test('The café keeps one hundred hardcoded people', () => {
  assert.equal(guestSlots(0), 100);
  assert.equal(guestSlots(2), 100);
  assert.equal(guestSlots(9), 100);
  const emails = cafeGuestEmails();
  assert.equal(emails.length, 100);
  assert.equal(new Set(emails).size, emails.length);
  assert.ok(emails.every((email) => email.endsWith('@culturalcafe.invalid')));
  assert.ok(emails.includes('guest.mei@culturalcafe.invalid'));
  assert.ok(emails.includes('guest.hana@culturalcafe.invalid'));
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
