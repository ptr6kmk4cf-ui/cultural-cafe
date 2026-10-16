import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cafePromptFor, cafePromptFromPool } from '@conversa/shared';
import { icePayload, parseSignalBody, signalPhase } from '../world-signal';
import { CROWD } from '../cafe-crowd';
import { VOICES } from '../cafe-voices';
import { guestLineRepeats } from '../table-reply';
import { cafeGuestEmails, guestFollowUp, guestSlots, guestWriterHistory, hardcodedTableReply, isLooseCafeEmail, nativeGuestText, nextHardcodedTableLine, scriptedGuestTurn } from './cafe-guests';
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

test('A café guest stays on the table topic instead of the next unused fact', () => {
  const topic = 'What food from your town would you want a visitor to try first?';
  const hello = scriptedGuestTurn('guest.lena@culturalcafe.invalid', [], 'en', topic);
  const answer = scriptedGuestTurn(
    'guest.lena@culturalcafe.invalid',
    [
      { mine: false, text: hello?.text ?? '', translation: hello?.translation },
      { mine: true, text: 'I walk down to the river on a free afternoon.' },
    ],
    'en',
    topic,
  );
  assert.match(answer?.translation ?? '', /fish|lemon|lunch|visitor|eat/i);
  assert.equal(/Tram 28|viewpoint|lights on/i.test(answer?.translation ?? ''), false);
});

test('A café guest answers the last sentence, not an older question still in the box', () => {
  const answer = scriptedGuestTurn(
    'guest.lena@culturalcafe.invalid',
    [
      { mine: false, text: 'Olá' },
      {
        mine: true,
        text: 'What food from your town would you want a visitor to try first? The tram in my city is quiet.',
      },
    ],
    'en',
    'What food from your town would you want a visitor to try first?',
  );
  assert.match(answer?.translation ?? '', /Tram 28/);
  assert.equal(/fish|brioche|visitor/i.test(answer?.translation ?? ''), false);
});

test('a guest line keeps their words as the original, not the English copy', () => {
  const hello = scriptedGuestTurn('guest.amina@culturalcafe.invalid', [], 'en');
  assert.match(hello?.text ?? '', /Habari|chai|mkate/);
  assert.match(hello?.translation ?? '', /Hello from Nairobi|tea and bread/i);
  assert.equal(hello?.language, 'sw');
  assert.equal(nativeGuestText('Mornings smell like tea.', 'Mornings smell like tea.', 'Habari asubuhi.'), 'Habari asubuhi.');
  assert.equal(nativeGuestText('Mornings smell like tea.', 'Asubuhi ina harufu ya chai.', 'Habari asubuhi.'), 'Asubuhi ina harufu ya chai.');
  assert.equal(
    nativeGuestText(
      'That sounds great. Tell me more about Sunday.',
      'That sounds delicious. Tell me more about Sunday.',
      'Habari asubuhi.',
      'sw',
    ),
    'Habari asubuhi.',
  );
  assert.equal(
    nativeGuestText(
      'In Kathmandu, Garden is still the part I can describe.',
      'मेरो ठाउँमा बगैचा अझै छ।',
      'Tea near a temple in Kathmandu is a slow hour I do not fill with plans.',
      'ne',
    ),
    'मेरो ठाउँमा बगैचा अझै छ।',
  );
});

test('the guest writes from their own words and the translation they can read', () => {
  const thread = guestWriterHistory([
    { mine: false, text: 'Habari jumapili.', translation: 'Hello on Sunday.' },
    { mine: true, text: 'On Sunday I walk by the river.', translation: 'Jumapili natembea kando ya mto.' },
  ]);
  assert.equal(thread[0].text, 'Habari jumapili.');
  assert.equal(thread[1].text, 'Jumapili natembea kando ya mto.');
});

test('the guest writer only keeps the guest language', () => {
  const thread = guestWriterHistory(
    [
      { mine: false, text: 'If I miss the market, the rest of the day feels borrowed.', translation: 'Ako propustim tržnicu, ostatak dana mi je posuđen.' },
      { mine: true, text: 'I buy too much fruit.', translation: 'Previše voća kao plan mi je super taktika za slobodno popodne.' },
      { mine: false, text: 'The bakery still smells like butter.', translation: null },
    ],
    'hr',
  );
  assert.equal(thread.length, 2);
  assert.match(thread[0].text, /tržnicu|posuđen/);
  assert.match(thread[1].text, /voća/);
});

test('the guest is not fed the same line twice as native and translation', () => {
  const thread = guestWriterHistory([
    { mine: false, text: 'Habari jumapili.', translation: 'Hello on Sunday.' },
    { mine: false, text: 'Hello on Sunday.', translation: 'Hello on Sunday.' },
    { mine: true, text: 'On Sunday I walk by the river.', translation: 'Jumapili natembea kando ya mto.' },
  ]);
  assert.equal(thread.length, 2);
  assert.equal(thread[0].text, 'Habari jumapili.');
  assert.equal(thread[1].text, 'Jumapili natembea kando ya mto.');
});

test('a café guest does not parrot the last stay-on-topic line', () => {
  const topic = 'What is “Garden” like where you live?';
  const loop = 'In Kathmandu, Garden is still the part I can describe. How is it where you live?';
  const lines = VOICES.pemba.lines;
  const history = [
    { mine: false, text: lines[0], translation: lines[0] },
    { mine: true, text: 'Hello from my garden.' },
    { mine: false, text: lines[1], translation: lines[1] },
    { mine: true, text: 'We sit outside with tea.' },
    { mine: false, text: lines[2], translation: lines[2] },
    { mine: true, text: 'The tea is strong in the morning.' },
    { mine: false, text: lines[3], translation: lines[3] },
    { mine: true, text: 'I leave the cup when it is empty.' },
    { mine: false, text: loop, translation: loop },
    { mine: true, text: 'The tea is strong in the morning.' },
    { mine: false, text: `${loop} Tell me one more thing about it.`, translation: `${loop} Tell me one more thing about it.` },
    { mine: true, text: 'We sit in the garden after breakfast.' },
  ];
  const next = scriptedGuestTurn('guest.pemba@culturalcafe.invalid', history, 'en', topic);
  const recent = [loop, `${loop} Tell me one more thing about it.`];
  assert.ok(next?.translation || next?.text);
  assert.notEqual(next?.text, loop);
  assert.notEqual(next?.translation, loop);
  assert.equal((next?.translation || '').includes(loop), false);
  assert.equal(guestLineRepeats(next?.translation || next?.text || '', recent), false);
  const again = scriptedGuestTurn(
    'guest.pemba@culturalcafe.invalid',
    [...history, { mine: false, text: next?.text ?? '', translation: next?.translation }, { mine: true, text: 'And after breakfast?' }],
    'en',
    topic,
  );
  assert.notEqual(again?.translation || again?.text, next?.translation || next?.text);
  assert.equal(guestLineRepeats(again?.translation || again?.text || '', [next?.translation || next?.text || '', ...recent]), false);
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

test('Each café guest has a personality and speaks from it', () => {
  const ids = CROWD.map((person) => person.id);
  assert.deepEqual([...ids].sort(), Object.keys(VOICES).sort());
  const personalities = Object.values(VOICES).map((voice) => voice.personality);
  assert.equal(new Set(personalities).size, personalities.length);
  const lines = Object.values(VOICES).flatMap((voice) => [...voice.lines]);
  assert.equal(new Set(lines).size, lines.length);
  for (const line of lines) {
    assert.equal(/ordinary day/i.test(line), false);
    assert.equal(/you mentioned/i.test(line), false);
  }
  const hana = scriptedGuestTurn('guest.hana@culturalcafe.invalid', [], 'en');
  const elena = scriptedGuestTurn('guest.elena@culturalcafe.invalid', [], 'en');
  assert.match(hana?.translation ?? '', /train|restaurant/i);
  assert.match(elena?.translation ?? '', /bread|bakery/i);
  assert.notEqual(hana?.translation, elena?.translation);
  const answer = scriptedGuestTurn('guest.hana@culturalcafe.invalid', [
    { mine: false, text: hana?.text ?? '', translation: hana?.translation },
    { mine: true, text: 'The train home is packed.' },
  ], 'en');
  assert.match(answer?.translation ?? '', /train/i);
  assert.equal(/ordinary day/i.test(answer?.translation ?? ''), false);
  const maya = scriptedGuestTurn('guest.maya@culturalcafe.invalid', [], 'en');
  assert.match(maya?.text ?? '', /bakery|subway/i);
  assert.equal(maya?.translation, null);
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
