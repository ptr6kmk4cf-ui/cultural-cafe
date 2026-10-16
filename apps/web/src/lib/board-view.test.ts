import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  boardLineToShare,
  boardLineView,
  boardLinesFromElements,
  boardLinesToTranslate,
  restoreSharedElements,
  pruneBoardCaches,
  stampNewText,
  viewedElements,
  type BoardTextElement,
} from '@conversa/shared';

const mei = {
  id: 'sticky-1',
  authorId: 'mei',
  text: 'Le pain sort du four.',
  language: 'fr',
};

const jacky = { id: 'jacky', language: 'en' };
const meiReader = { id: 'mei', language: 'fr' };

test('the writer still sees their own words, even if a translation exists', () => {
  const view = boardLineView(mei, meiReader, 'The bread is coming out of the oven.');
  assert.equal(view.text, 'Le pain sort du four.');
  assert.equal(view.original, undefined);
});

test('the other person reads a translation and can still see the original', () => {
  const view = boardLineView(mei, jacky, 'The bread is coming out of the oven.');
  assert.equal(view.text, 'The bread is coming out of the oven.');
  assert.equal(view.language, 'en');
  assert.equal(view.original, 'Le pain sort du four.');
});

test('same language skips translation, and a missing translation leaves the original', () => {
  assert.equal(boardLineView(mei, { id: 'lea', language: 'fr' }, 'The bread is coming out of the oven.').text, 'Le pain sort du four.');
  assert.equal(boardLineView(mei, jacky, null).text, 'Le pain sort du four.');
});

test("only the other person's foreign lines are sent to the translator", () => {
  const lines = [
    mei,
    { id: 'mine', authorId: 'jacky', text: 'I like this drawing.', language: 'en' },
    { id: 'empty', authorId: 'mei', text: '   ', language: 'fr' },
  ];
  assert.deepEqual(
    boardLinesToTranslate(lines, jacky).map((line) => line.id),
    ['sticky-1'],
  );
});

test('what we share is the original, never a translated copy', () => {
  const view = boardLineView(mei, jacky, 'The bread is coming out of the oven.');
  assert.deepEqual(boardLineToShare(mei), { id: 'sticky-1', authorId: 'mei', text: 'Le pain sort du four.', language: 'fr' });
  assert.notEqual(view.text, boardLineToShare(mei).text);
});

test('viewed boxes swap only the other person\'s text, then restore before share', () => {
  const source = [
    { id: 'sticky-1', type: 'text', text: 'Le pain sort du four.', originalText: 'Le pain sort du four.', customData: { authorId: 'mei', language: 'fr' } },
    { id: 'mine', type: 'text', text: 'Hello', originalText: 'Hello', customData: { authorId: 'jacky', language: 'en' } },
  ];
  const viewed = viewedElements(source, jacky, { 'sticky-1': 'The bread is coming out of the oven.' });
  assert.equal(viewed[0]?.text, 'The bread is coming out of the oven.');
  assert.equal(viewed[0]?.originalText, 'Le pain sort du four.');
  assert.equal(viewed[1]?.text, 'Hello');
  const shared = restoreSharedElements(viewed, source);
  assert.equal(shared[0]?.text, 'Le pain sort du four.');
  assert.deepEqual(
    boardLinesFromElements(shared).map((line) => line.text),
    ['Le pain sort du four.', 'Hello'],
  );
});

test('a new text box is stamped with the person who wrote it', () => {
  const [stamped] = stampNewText<BoardTextElement>([{ id: 'n', type: 'text', text: 'Ciao' }], { id: 'jacky', language: 'en' });
  assert.equal(stamped?.customData?.authorId, 'jacky');
  assert.equal(stamped?.customData?.language, 'en');
});

test('old translation keys are dropped when a box leaves the board', () => {
  const translations = { 'sticky-1': 'The bread.', gone: 'old' };
  const from = { 'sticky-1': 'Le pain sort du four.', gone: 'x' };
  pruneBoardCaches(['sticky-1'], translations, from);
  assert.deepEqual(translations, { 'sticky-1': 'The bread.' });
  assert.deepEqual(from, { 'sticky-1': 'Le pain sort du four.' });
});
