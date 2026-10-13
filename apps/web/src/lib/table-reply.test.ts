import assert from 'node:assert/strict';
import { test } from 'node:test';
import { draftEchoes, guestLineUsable, isClosingLine, lineWorthReading, replyAboutTheirLine, replyReads } from './table-reply';

test('a stock thank-you does not count as reading the table', () => {
  const stock = 'Thank you for telling me that. What is a normal day like in Lyon, France?';
  const topic = 'What is “Surfing” like where you live?';
  const said = 'In Lyon the evening smells like bread from the bakery on the corner.';
  assert.equal(replyReads(stock, [said, topic]), false);
  assert.equal(replyReads('The bakery bread in the evening is the part I am answering. Surfing here is something else.', [said, topic]), true);
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
