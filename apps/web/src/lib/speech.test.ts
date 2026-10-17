import assert from 'node:assert/strict';
import test from 'node:test';
import {
  composeAfterSwitch,
  composePairFromEdit,
  composePairFromSwitch,
  fillComposeOther,
  placeAssistDraft,
  dictationButtonKind,
  isHearableLine,
  joinDictation,
  needsSpeakKeepAlive,
  lastHearable,
  lastHearableId,
  nextSpeechTryMs,
  shouldQueueSpeak,
  recorderMime,
  shouldPaintLiveTranscript,
  SPEAK_CHUNK_MAX,
  speechLocale,
  splitSpeakChunks,
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

test('switching to my language mid-table shows their translation, not a mix', () => {
  const theirs = spokenLine({
    mine: false,
    text: 'Jumapili hapa huanza na chai.',
    language: 'sw',
    translation: 'Sunday here starts with tea.',
    translationLang: 'en',
    myLanguage: 'en',
    inTheirLanguage: true,
  });
  const mine = spokenLine({
    mine: false,
    text: 'Jumapili hapa huanza na chai.',
    language: 'sw',
    translation: 'Sunday here starts with tea.',
    translationLang: 'en',
    myLanguage: 'en',
    inTheirLanguage: false,
  });
  assert.equal(theirs.text, 'Jumapili hapa huanza na chai.');
  assert.equal(mine.text, 'Sunday here starts with tea.');
});

test('an unsent suggest flips with my language and their language', () => {
  const suggested = composePairFromEdit(true, 'Jumapili yangu hapa Paris natembea kando ya mto.');
  const saved = composePairFromSwitch(suggested, true, suggested.their);
  const toMine = composeAfterSwitch(saved, false);
  assert.equal(toMine.needsTranslation, true);
  assert.match(toMine.text, /Jumapili/);
  const both = { ...saved, my: 'On Sunday in Paris I walk by the river.' };
  const flipped = composeAfterSwitch(both, false);
  assert.equal(flipped.needsTranslation, false);
  assert.match(flipped.text, /Paris I walk/);
  const back = composeAfterSwitch(both, true);
  assert.equal(back.needsTranslation, false);
  assert.match(back.text, /Jumapili/);
  const warmed = fillComposeOther(suggested, true, 'On Sunday in Paris I walk by the river.');
  assert.equal(composeAfterSwitch(warmed, false).needsTranslation, false);
});

test('when you choose their language, you hear and read the original', () => {
  const heard = spokenLine({
    mine: false,
    text: '¿Cómo es un domingo normal donde vives?',
    language: 'es',
    translation: 'What is a normal Sunday like where you live?',
    translationLang: 'en',
    myLanguage: 'en',
    inTheirLanguage: true,
  });
  assert.equal(heard.text, '¿Cómo es un domingo normal donde vives?');
  assert.equal(heard.lang, 'es');
});

test('their language shows their original, not the English copy', () => {
  const heard = spokenLine({
    mine: false,
    text: 'Ako propustim tržnicu, ostatak dana mi je posuđen.',
    language: 'hr',
    translation: 'If I miss the market, the rest of the day feels borrowed.',
    translationLang: 'en',
    myLanguage: 'en',
    theirLanguage: 'hr',
    inTheirLanguage: true,
  });
  assert.match(heard.text, /tržnicu|posuđen/);
  assert.equal(heard.lang, 'hr');
});

test('their language still shows a guest line when the catalog leaked English', () => {
  const heard = spokenLine({
    mine: false,
    text: 'If I miss the market, the rest of the day feels borrowed.',
    language: 'hr',
    translation: 'If I miss the market, the rest of the day feels borrowed.',
    translationLang: 'en',
    myLanguage: 'en',
    theirLanguage: 'hr',
    inTheirLanguage: true,
  });
  assert.match(heard.text, /market/);
  assert.equal(heard.lang, 'en');
});

test('my language does not show their original when a translation exists', () => {
  const heard = spokenLine({
    mine: false,
    text: 'Previše voća kao plan mi je super taktika za slobodno popodne. Imaš li ti neko mjesto gdje to voće pojedeš?',
    language: 'hr',
    translation: 'Too much fruit is my lazy afternoon plan. Do you have a place for that?',
    translationLang: 'en',
    myLanguage: 'en',
    theirLanguage: 'hr',
    inTheirLanguage: false,
  });
  assert.match(heard.text, /fruit/);
  assert.equal(heard.lang, 'en');
});

test('a guest line still shows when there is no translation yet', () => {
  const heard = spokenLine({
    mine: false,
    text: 'Previše voća kao plan mi je super taktika za slobodno popodne.',
    language: 'hr',
    translation: null,
    translationLang: null,
    myLanguage: 'en',
    theirLanguage: 'hr',
  });
  assert.match(heard.text, /voća/);
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

test('a late Suggest follows the view you have now', () => {
  const croatian = 'Previše voća kao plan mi je super taktika za slobodno popodne.';
  const same = placeAssistDraft({ draft: croatian, wroteTheirs: true, nowTheirs: true });
  assert.equal(same.needsFlip, false);
  assert.equal(same.display, croatian);
  const flipped = placeAssistDraft({ draft: croatian, wroteTheirs: true, nowTheirs: false });
  assert.equal(flipped.needsFlip, true);
  assert.equal(flipped.display, croatian);
  assert.equal(flipped.pair.their, croatian);
  assert.equal(flipped.pair.my, '');
});

test('your own line follows the view you chose', () => {
  const mine = {
    mine: true as const,
    text: 'If I miss the market, the rest of the day feels borrowed.',
    language: 'en',
    translation: 'Previše voća kao plan mi je super taktika za slobodno popodne. Imaš li ti neko mjesto gdje to voće pojedeš?',
    translationLang: 'hr',
    myLanguage: 'en',
    theirLanguage: 'hr',
  };
  const theirs = spokenLine({ ...mine, inTheirLanguage: true });
  const mineView = spokenLine({ ...mine, inTheirLanguage: false });
  assert.match(theirs.text, /voća/);
  assert.match(mineView.text, /market/);
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

test('Hear splits a long table line so later sentences still play', () => {
  const line =
    'Sunday starts with tea at the corner bakery. Then I walk by the river until the market opens. If I miss the fruit stall the rest of the day feels borrowed. In the evening we sit outside and talk until the lights come on.';
  const chunks = splitSpeakChunks(line);
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((chunk) => chunk.length <= SPEAK_CHUNK_MAX));
  assert.equal(chunks.join(' '), line);
  assert.equal(splitSpeakChunks('  ').length, 0);
  assert.deepEqual(splitSpeakChunks('Just one short line.'), ['Just one short line.']);
});

test('Hear starts a reply as soon as the previous line has left the speaker', () => {
  assert.equal(nextSpeechTryMs(false, 0), 0);
  assert.equal(nextSpeechTryMs(true, 0), 80);
  assert.equal(nextSpeechTryMs(true, 1100), 0);
});

test('Hear queues the next reply instead of cancelling Chrome mid-line', () => {
  assert.equal(shouldQueueSpeak('a', 'b', true), true);
  assert.equal(shouldQueueSpeak('a', 'b', true, true), false);
  assert.equal(shouldQueueSpeak('a', 'a', true), false);
  assert.equal(shouldQueueSpeak(null, 'b', true), false);
  assert.equal(shouldQueueSpeak('a', 'b', false), false);
});

test('Hear On reads their last line, not yours', () => {
  const lines = [
    { id: 'g1', mine: false },
    { id: 'me', mine: true },
    { id: 'local_1', mine: false },
  ];
  assert.equal(lastHearable(lines)?.id, 'g1');
  assert.equal(lastHearableId(lines), 'g1');
  assert.equal(lastHearableId([{ id: 'me', mine: true }]), '');
  assert.equal(isHearableLine(lines[0]), true);
  assert.equal(isHearableLine(lines[1]), false);
  assert.equal(isHearableLine({ id: 'g2' }), false);
});

test('Chrome needs a speaker keep-alive; iPhone does not', () => {
  assert.equal(needsSpeakKeepAlive('Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36'), true);
  assert.equal(needsSpeakKeepAlive('Mozilla/5.0 Edg/131.0.0.0'), true);
  assert.equal(needsSpeakKeepAlive('Mozilla/5.0 iPhone OS 18_0 like Mac OS X CriOS/131.0'), false);
  assert.equal(needsSpeakKeepAlive('Mozilla/5.0 Macintosh Intel Mac OS X Safari/19621'), false);
});

test('Speak says Typing while you talk, then Stop when you go quiet', () => {
  assert.equal(dictationButtonKind(false, false, 0), 'typing');
  assert.equal(dictationButtonKind(false, true, 200), 'typing');
  assert.equal(dictationButtonKind(true, true, 2000), 'typing');
  assert.equal(dictationButtonKind(false, false, 2000), 'typing');
  assert.equal(dictationButtonKind(false, true, 2000), 'stop');
});
