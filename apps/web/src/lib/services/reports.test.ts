import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { attachedLineSchema, isUrgentReason, MAX_ATTACHED_LINES, normalizeAttachedLines, REPORT_REASONS, urgentAlertEmail } from './reports';

test('harassment and under-18 reports are urgent, the rest are not', () => {
  assert.deepEqual(REPORT_REASONS.filter(isUrgentReason), ['harassment', 'underage_concern']);
  assert.equal(isUrgentReason('spam'), false);
  assert.equal(isUrgentReason('nonsense'), false);
});

test('attached lines are trimmed, blanks dropped, and capped to the newest', () => {
  const parse = (v: unknown) => z.array(attachedLineSchema).parse(v);
  const lines = parse([
    { mine: false, text: '  hello  ', translation: ' hola ' },
    { mine: true, text: '   ' },
    { mine: true, text: 'x'.repeat(5000), translation: null, at: '2026-10-17T10:00:00Z' },
  ]);
  const kept = normalizeAttachedLines(lines);
  assert.equal(kept.length, 2);
  assert.equal(kept[0].text, 'hello');
  assert.equal(kept[0].translation, 'hola');
  assert.equal(kept[1].text.length, 2000);
  const many = normalizeAttachedLines(parse(Array.from({ length: 40 }, (_, i) => ({ mine: false, text: `l${i}` }))));
  assert.equal(many.length, MAX_ATTACHED_LINES);
  assert.equal(many.at(-1)?.text, 'l39');
});

test('the urgent alert email never carries chat text', () => {
  const mail = urgentAlertEmail('underage_concern', new Date('2026-10-17T10:00:00Z'));
  assert.match(mail.subject, /Urgent/);
  assert.match(mail.subject, /under 18/);
  assert.match(mail.text, /\/app\/admin\/reports/);
  assert.match(mail.text, /does not include any chat text/);
});
