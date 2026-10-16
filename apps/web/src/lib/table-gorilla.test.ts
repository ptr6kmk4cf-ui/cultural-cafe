import assert from 'node:assert/strict';
import test from 'node:test';
import { draftNeedsTranslation, outgoingLanguages, pickLineInLanguage } from './ai/lang';
import { guestWriterHistory } from './services/cafe-guests';
import {
  composeAfterSwitch,
  composePairFromEdit,
  composePairFromSwitch,
  emptyComposePair,
  fillComposeOther,
  placeAssistDraft,
  spokenLine,
} from './speech';
import { GUEST_ANSWER_MS, remainingWait } from './table-clock';
import { bump, live } from './table-lanes';
import { guestLineRepeats } from './table-reply';

const HR =
  'Previše voća kao plan mi je super taktika za slobodno popodne. Imaš li ti neko mjesto gdje to voće pojedeš?';
const EN = 'If I miss the market, the rest of the day feels borrowed. Where do you eat fruit?';

type Msg = {
  id: string;
  mine: boolean;
  text: string;
  language: string;
  translation: string | null;
  translationLang: string | null;
};

function view(m: Msg, inTheirs: boolean) {
  return spokenLine({
    ...m,
    myLanguage: 'en',
    theirLanguage: 'hr',
    inTheirLanguage: inTheirs,
  });
}

function send(raw: string, inTheirs: boolean, id: string): Msg {
  const out = outgoingLanguages(raw, 'en', 'hr');
  const translation =
    out.language === 'hr' ? EN : out.language === 'en' ? HR : null;
  return {
    id,
    mine: true,
    text: raw,
    language: out.language,
    translation,
    translationLang: translation ? out.translateTo : null,
  };
}

const HR_LINES = [
  HR,
  'Ako propustim tržnicu, ostatak dana mi je posuđen. Gdje ti jedeš voće?',
  'Kava dolazi na drugo mjesto, pijem je stojeći. Imaš li ti neko mjesto?',
];

function guest(id: string, i: number): Msg {
  const text = HR_LINES[i % HR_LINES.length];
  return {
    id,
    mine: false,
    text,
    language: 'hr',
    translation: EN,
    translationLang: 'en',
  };
}

function assertChosen(line: { text: string }, inTheirs: boolean) {
  if (!line.text) return;
  if (inTheirs) {
    assert.equal(pickLineInLanguage([line.text], 'en'), '', `my language leaked into theirs: ${line.text}`);
  } else {
    assert.equal(draftNeedsTranslation(line.text, 'en'), false, `their language leaked into mine: ${line.text}`);
  }
}

test('gorilla switching never mixes the unused language into the view', () => {
  let inTheirs = false;
  let pair = emptyComposePair();
  let box = '';
  const msgs: Msg[] = [];
  const guestSaid: string[] = [];
  let n = 0;
  let now = 1_000;
  const slot = { current: 0 };

  for (let step = 0; step < 80; step++) {
    const move = step % 7;
    if (move === 0 || move === 4) {
      const from = inTheirs;
      pair = composePairFromSwitch(pair, from, box);
      inTheirs = !inTheirs;
      const next = composeAfterSwitch(pair, inTheirs);
      if (!next.needsTranslation) box = next.text;
      else {
        const flipped = inTheirs ? HR : EN;
        pair = fillComposeOther(pair, from, flipped);
        box = flipped;
      }
      bump(slot);
    } else if (move === 1) {
      const wroteTheirs = inTheirs;
      const draft = wroteTheirs ? HR : EN;
      const late = step % 3 === 0;
      if (late) inTheirs = !inTheirs;
      const placed = placeAssistDraft({ draft, wroteTheirs, nowTheirs: inTheirs, pair });
      pair = placed.pair;
      if (placed.needsFlip) {
        const flipped = inTheirs ? HR : EN;
        pair = inTheirs ? { ...pair, their: flipped } : { ...pair, my: flipped };
        box = flipped;
      } else box = placed.display;
    } else if (move === 2) {
      const raw = inTheirs ? HR : EN;
      const token = bump(slot);
      const started = now;
      now += 300 + (step % 5) * 400;
      const left = remainingWait(started, GUEST_ANSWER_MS, now);
      now += left;
      if (!live(slot, token)) continue;
      msgs.push(send(raw, inTheirs, `me-${n++}`));
      const g = guest(`them-${n++}`, n);
      if (!guestLineRepeats(g.text, guestSaid)) guestSaid.push(g.text);
      msgs.push(g);
      pair = emptyComposePair();
      box = '';
    } else if (move === 3) {
      const thread = guestWriterHistory(
        msgs.map((m) => ({ mine: m.mine, text: m.text, translation: m.translation })),
        'hr',
      );
      for (const turn of thread) {
        assert.equal(draftNeedsTranslation(turn.text, 'hr'), false, `guest history mixed: ${turn.text}`);
      }
    } else {
      for (const m of msgs) assertChosen(view(m, inTheirs), inTheirs);
    }
  }

  assert.ok(msgs.length >= 8);
  for (const m of msgs) {
    assertChosen(view(m, false), false);
    assertChosen(view(m, true), true);
  }
});

test('gorilla taps do not stack wait on top of slow translation', () => {
  let now = 0;
  for (const work of [200, 800, 1200, 2500, 4000]) {
    const started = now;
    now += work;
    const extra = remainingWait(started, GUEST_ANSWER_MS, now);
    now += extra;
    if (work < GUEST_ANSWER_MS) assert.equal(now - started, GUEST_ANSWER_MS);
    else {
      assert.equal(extra, 0);
      assert.equal(now - started, work);
    }
  }
});

test('a late Suggest cannot land in the unused language', () => {
  const placed = placeAssistDraft({ draft: HR, wroteTheirs: true, nowTheirs: false });
  assert.equal(placed.pair.their, HR);
  assert.equal(placed.needsFlip, true);
  const shown = spokenLine({
    mine: true,
    text: EN,
    language: 'en',
    translation: HR,
    translationLang: 'hr',
    myLanguage: 'en',
    theirLanguage: 'hr',
    inTheirLanguage: false,
  });
  assertChosen(shown, false);
});

test('compose from edit forgets the other view so gorilla typing cannot mix', () => {
  const pair = composePairFromEdit(true, HR);
  assert.equal(pair.my, '');
  assert.equal(pair.their, HR);
  const typed = composePairFromEdit(false, EN);
  assert.equal(typed.their, '');
});
