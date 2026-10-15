/** Calendar date of birth. Stored as UTC midnight so the day never shifts with time zones. */

export function daysInMonth(year: number, month: number) {
  if (!year || !month) return 31;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isoBirthDate(year: number, month: number, day: number) {
  if (!year || !month || !day) return '';
  if (day > daysInMonth(year, month)) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseIsoBirthDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (isoBirthDate(year, month, day) !== value.trim()) return null;
  return { year, month, day };
}

/** Age from a date stored as UTC midnight of the calendar birthday. */
export function ageFromCalendarBirth(birth: Date, now = new Date()) {
  const year = birth.getUTCFullYear();
  const month = birth.getUTCMonth();
  const day = birth.getUTCDate();
  let age = now.getFullYear() - year;
  const monthDelta = now.getMonth() - month;
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < day)) age--;
  return age;
}
