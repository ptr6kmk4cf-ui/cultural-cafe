import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dictationButtonKind,
  joinDictation,
  recorderMime,
  shouldPaintLiveTranscript,
  speechLocale,
  spokenLine,
  visibleLine,
} from './speech';

test('the mic and speaker use a real locale for the language you read', () => {
  assert.equal(speechLocale('en'), 'en-US');
  assert.equal(speechLocale('fr'), 'fr-FR');
  assert.equal(speechLocale('iw'), 'he-IL');
  assert.equal(speechLocale('nb'), 'nb-NO');
  assert.equal(speechLocale('zh'), 'zh-CN');
  assert.equal(speechLocale('pt-PT'), 'pt-PT');
  assert.equal(speechLocale('xx'), 'en-US');
});

test('their line is heard in your language, not in theirs', () => {
  const heard = spokenLine({
    mine: false,
    text: '¿Cómo es un domingo normal donde vives?',
    language: 'es',
    translation: 'What is a normal Sunday like where you live?',
    translationLang: 'en',
    myLanguage: 'en',
  });
  assert.equal(heard.text, 'What is a normal Sunday like where you live?');
  assert.equal(heard.lang, 'en');
});

test('your own line is heard as you said it', () => {
  const heard = spokenLine({
    mine: true,
    text: 'Le dimanche je marche le long du fleuve.',
    language: 'fr',
    translation: 'On Sunday I walk along the river.',
    translationLang: 'en',
    myLanguage: 'fr',
  });
  assert.equal(heard.text, 'Le dimanche je marche le long du fleuve.');
  assert.equal(heard.lang, 'fr');
});

test('a quoted guest line is heard without the old sentence in front', () => {
  assert.equal(visibleLine('“Old line.” — The bakery is still lit.'), 'The bakery is still lit.');
  assert.equal(joinDictation('On Sunday I walk', 'along the river.'), 'On Sunday I walk along the river.');
});

test('the recorder picks a mime this browser can actually write', () => {
  assert.equal(recorderMime((type) => type === 'audio/webm'), 'audio/webm');
  assert.equal(recorderMime((type) => type === 'audio/mp4'), 'audio/mp4');
  assert.equal(recorderMime(() => false), '');
});

test('a late live transcript does not overwrite a newer one', () => {
  assert.equal(shouldPaintLiveTranscript(2, 2, 'the night train'), true);
  assert.equal(shouldPaintLiveTranscript(1, 2, 'old line'), false);
  assert.equal(shouldPaintLiveTranscript(2, 2, ''), false);
});

test('Speak says Typing while you talk, then Stop when you go quiet', () => {
  assert.equal(dictationButtonKind(false, false, 0), 'typing');
  assert.equal(dictationButtonKind(false, true, 200), 'typing');
  assert.equal(dictationButtonKind(true, true, 2000), 'typing');
  assert.equal(dictationButtonKind(false, false, 2000), 'typing');
  assert.equal(dictationButtonKind(false, true, 2000), 'stop');
});
