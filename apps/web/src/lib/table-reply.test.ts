import assert from 'node:assert/strict';
import { test } from 'node:test';
import { correctSpokenLine, draftEchoes, guestLineRepeats, guestLineUsable, isClosingLine, lastSpokenLine, lineWorthReading, replyAboutTheirLine, replyReads, staysOnTable } from './table-reply';

test('a stock thank-you does not count as reading the table', () => {
  const stock = 'Thank you for telling me that. What is a normal day like in Lyon, France?';
  const topic = 'What is “Surfing” like where you live?';
  const said = 'In Lyon the evening smells like bread from the bakery on the corner.';
  assert.equal(replyReads(stock, [said, topic]), false);
  assert.equal(replyReads('The bakery bread in the evening is the part I am answering. Surfing here is something else.', [said, topic]), true);
});

test('speech auto-corrects a near miss onto the table topic', () => {
  const surfing = 'What is “Surfing” like where you live?';
  const food = 'What food from your town would you want a visitor to try first?';
  assert.equal(correctSpokenLine('Serving is what we do on this coast.', surfing), 'Surfing is what we do on this coast.');
  assert.equal(correctSpokenLine('I walk down to the river on a free afternoon.', food), 'I walk down to the river on a free afternoon.');
  assert.equal(correctSpokenLine('The first thing a visitor should eat is grilled fish.', food), 'The first thing a visitor should eat is grilled fish.');
});

test('a line that leaves the table is not a stable answer', () => {
  const topic = 'What food from your town would you want a visitor to try first?';
  const latest = 'I walk down to the river on a free afternoon.';
  assert.equal(staysOnTable('Tram 28 climbs so slowly you hear every bend.', latest, topic), false);
  assert.equal(staysOnTable('I would walk that river path too.', latest, topic), true);
  assert.equal(staysOnTable('The first thing I would want a visitor to eat is grilled fish.', latest, topic), true);
});

test('the last sentence is the line to answer, not an older question in the same box', () => {
  assert.equal(
    lastSpokenLine('What food from your town would you want a visitor to try first? The tram in my city is quiet.'),
    'The tram in my city is quiet.',
  );
  assert.equal(lastSpokenLine('I walk down to the river.'), 'I walk down to the river.');
});

test('a guest goodbye is skipped so the draft answers the topic', () => {
  assert.equal(isClosingLine("Okay. Let's stop there. Take care of yourself."), true);
  const lines = [
    'Hello from Lyon. Evenings smell like fresh bread.',
    "Okay. Let's stop there. Take care of yourself.",
  ];
  assert.match(lineWorthReading(lines), /fresh bread/);
  const draft = replyAboutTheirLine({
    latest: lines[1],
    topic: 'What is “Surfing” like where you live?',
    place: 'Nice, France',
  });
  assert.equal(draft.includes('normal day'), false);
  assert.match(draft, /Surfing/);
});

test('a stiff or wrong-language guest line is not shown', () => {
  const already = ['On the corniche, neighbours say a word first and then a small wave.'];
  const sources = ['do neighbours greet each other with a word or just a wave?'];
  assert.equal(guestLineUsable('I am glad to hear that. Here we walk the corniche slowly.', 'en', [], sources), false);
  assert.equal(guestLineUsable('你好。在里斯本，电车在上坡时会发出吱吱声。', 'en', [], sources), false);
  assert.equal(guestLineUsable(already[0], 'en', already, sources), false);
  assert.equal(
    guestLineUsable('We say a word first, then a small wave. The sea is loud enough that nobody needs a big hello.', 'en', already, sources),
    true,
  );
});

test('a parrot of the last guest lines is rejected', () => {
  const loop = 'In Kathmandu, Garden is still the part I can describe. How is it where you live?';
  const already = [loop, `${loop} Tell me one more thing about it.`];
  const sources = ['The tea is strong in the morning.', 'What is “Garden” like where you live?'];
  assert.equal(guestLineRepeats(loop, already), true);
  assert.equal(guestLineRepeats(`${loop} Tell me one more thing about it.`, [loop]), true);
  assert.equal(guestLineUsable(loop, 'en', already, sources), false);
  assert.equal(guestLineUsable('Garden is still the part I can describe from Kathmandu. How is it where you live?', 'en', already, sources), false);
  assert.equal(
    guestLineUsable('Morning tea here is strong too. I drink it in the garden before the heat starts.', 'en', already, sources),
    true,
  );
});

test('a real answer names what they just said', () => {
  const latest = 'Evenings smell like fresh bread from the bakery.';
  const topic = 'What is “Surfing” like where you live?';
  const draft = replyAboutTheirLine({ latest, topic, place: 'Nice, France' });
  const again = replyAboutTheirLine({
    latest: 'In Copenhagen I bike until I deserve something warm. What makes you actually stop?',
    topic,
    place: 'Nice, France',
  });
  assert.match(draft, /bread|bakery/i);
  assert.match(again, /bike/i);
  assert.notEqual(draft, again);
  assert.doesNotMatch(draft, /you said|the part i am answering/i);
  assert.doesNotMatch(again, /the part i am answering/i);
  assert.equal(draft.includes(latest), false);
  assert.equal(draft.includes(topic), false);
  assert.equal(draftEchoes(`You said “${latest}”. ${topic}`, latest, topic), true);
  assert.equal(draftEchoes('Bakery is the part I am answering. How does the rest of that day go?', latest, topic), true);
});
