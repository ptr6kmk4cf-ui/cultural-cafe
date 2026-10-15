import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ageFromCalendarBirth, daysInMonth, isoBirthDate, parseIsoBirthDate } from './birth-date';

test('day month year become one calendar date, and 31 February is refused', () => {
  assert.equal(isoBirthDate(1990, 3, 14), '1990-03-14');
  assert.equal(isoBirthDate(1990, 2, 31), '');
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2025, 2), 28);
  assert.deepEqual(parseIsoBirthDate('1990-03-14'), { year: 1990, month: 3, day: 14 });
  assert.equal(parseIsoBirthDate('1990-02-31'), null);
});

test('age uses the calendar birthday, not a shifted local day', () => {
  const birth = new Date('1990-03-14T00:00:00Z');
  assert.equal(ageFromCalendarBirth(birth, new Date(2026, 2, 13)), 35);
  assert.equal(ageFromCalendarBirth(birth, new Date(2026, 2, 14)), 36);
});
