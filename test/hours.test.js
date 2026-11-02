import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  easterSunday,
  formatRanges,
  frenchHolidays,
  OpeningHoursError,
  parseOpeningHours,
  storeStatus,
  upcomingDays,
} from '../src/shops/hours.js';

const PARIS = 'Europe/Paris';
// 2026-10-30 is a Friday; Paris is UTC+1 from 2026-10-25 on.
const at = (iso) => new Date(iso);

test('parses days, ranges, lists, holidays and off', () => {
  const schedule = parseOpeningHours(
    'Mo-Sa 08:30-12:00,14:00-19:30; Su 09:00-12:30; We off; PH off',
  );
  assert.deepEqual(schedule.week[0], [
    [510, 720],
    [840, 1170],
  ]);
  assert.deepEqual(schedule.week[2], []);
  assert.deepEqual(schedule.week[6], [[540, 750]]);
  assert.deepEqual(schedule.holidays, []);
});

test('a later rule replaces the earlier ones for its days only', () => {
  const schedule = parseOpeningHours('Mo-Su 08:00-20:00; Su 09:00-12:00');
  assert.deepEqual(schedule.week[5], [[480, 1200]]);
  assert.deepEqual(schedule.week[6], [[540, 720]]);
  assert.equal(schedule.holidays, null);
});

test('wrapping ranges, 24/7, 24:00 and times alone are understood', () => {
  assert.deepEqual(
    parseOpeningHours('Sa-Mo 10:00-11:00').week.map((day) => day.length),
    [1, 0, 0, 0, 0, 1, 1],
  );
  assert.deepEqual(parseOpeningHours('24/7').week[3], [[0, 1440]]);
  assert.deepEqual(parseOpeningHours('Mo 20:00-24:00').week[0], [[1200, 1440]]);
  assert.deepEqual(parseOpeningHours('08:00-20:00').week[4], [[480, 1200]]);
});

test('mistakes are reported, with the part that is wrong', () => {
  assert.throws(() => parseOpeningHours(''), OpeningHoursError);
  assert.throws(() => parseOpeningHours('Lu-Sa 08:00-20:00'), /"lu-sa" is not a day/);
  assert.throws(() => parseOpeningHours('Mo 8h-20h'), /not a time/);
  assert.throws(() => parseOpeningHours('Mo 20:00-08:00'), /closing time must come after/);
  assert.throws(() => parseOpeningHours('Mo 25:00-26:00'), /not a time of day/);
});

test('Easter and the French public holidays', () => {
  assert.equal(easterSunday(2026).toISOString().slice(0, 10), '2026-04-05');
  assert.equal(easterSunday(2027).toISOString().slice(0, 10), '2027-03-28');
  const holidays = frenchHolidays(2026);
  assert.equal(holidays.size, 11);
  for (const day of ['2026-01-01', '2026-04-06', '2026-05-14', '2026-05-25', '2026-11-11']) {
    assert.ok(holidays.has(day), day);
  }
});

test('open now, closing today, on the French clock', () => {
  const schedule = parseOpeningHours('Mo-Sa 08:30-20:00; PH off');
  // 18:00 UTC = 19:00 in Paris.
  const status = storeStatus(schedule, at('2026-10-30T18:00:00Z'), PARIS);
  assert.equal(status.open, true);
  assert.equal(status.next.open, false);
  assert.equal(status.next.time, '20:00');
  assert.equal(status.next.inMinutes, 60);
  assert.equal(status.next.dayOffset, 0);
  assert.equal(formatRanges(status.today), '08:30-20:00');
});

test('closed on Sunday and on a public holiday: the next opening skips both', () => {
  const schedule = parseOpeningHours('Mo-Sa 08:30-20:00; PH off');
  // Saturday 2026-10-31 at 21:00 in Paris: closed on Sunday (All Saints' Day
  // too), open again on Monday 2026-11-02.
  const saturdayNight = storeStatus(schedule, at('2026-10-31T20:00:00Z'), PARIS);
  assert.equal(saturdayNight.open, false);
  assert.equal(saturdayNight.next.time, '08:30');
  assert.equal(saturdayNight.next.dayOffset, 2);
  // Tuesday 2026-11-10 evening: Wednesday 11 November is a holiday.
  const beforeArmistice = storeStatus(schedule, at('2026-11-10T20:00:00Z'), PARIS);
  assert.equal(beforeArmistice.next.dayOffset, 2);
  const armistice = storeStatus(schedule, at('2026-11-11T10:00:00Z'), PARIS);
  assert.equal(armistice.open, false);
  assert.deepEqual(armistice.today, []);
});

test('the next days: their date, their hours, the public holidays', () => {
  const schedule = parseOpeningHours('Mo-Sa 08:30-20:00; PH off');
  // Friday 2026-10-30 at 23:30 in Paris (22:30 UTC): the next day is Saturday
  // on the French clock, whatever the UTC date.
  const days = upcomingDays(schedule, at('2026-10-30T22:30:00Z'), PARIS, 3);
  assert.deepEqual(
    days.map((day) => [
      day.dayOffset,
      day.date.toISOString().slice(0, 10),
      day.holiday,
      formatRanges(day.ranges),
    ]),
    [
      [1, '2026-10-31', false, '08:30-20:00'],
      [2, '2026-11-01', true, ''],
      [3, '2026-11-02', false, '08:30-20:00'],
    ],
  );
  // A holiday the hours do not mention keeps the hours of its weekday.
  const plain = upcomingDays(
    parseOpeningHours('Mo-Su 09:00-12:00'),
    at('2026-10-31T10:00:00Z'),
    PARIS,
    1,
  );
  assert.equal(plain[0].holiday, true);
  assert.equal(formatRanges(plain[0].ranges), '09:00-12:00');
  assert.deepEqual(upcomingDays(schedule, at('2026-10-31T10:00:00Z'), PARIS, 0), []);
});

test('a lunch break is a closing, ranges across midnight merge', () => {
  const lunch = parseOpeningHours('Mo-Sa 08:30-12:00,14:00-19:00');
  const noon = storeStatus(lunch, at('2026-10-30T11:30:00Z'), PARIS); // 12:30
  assert.equal(noon.open, false);
  assert.equal(noon.next.time, '14:00');
  assert.equal(noon.next.inMinutes, 90);

  const night = parseOpeningHours('Fr 18:00-24:00; Sa 00:00-02:00');
  const friday = storeStatus(night, at('2026-10-30T22:00:00Z'), PARIS); // 23:00
  assert.equal(friday.open, true);
  assert.equal(friday.next.time, '02:00');
  assert.equal(friday.next.dayOffset, 1);
});

test('always open or never open: no next change', () => {
  assert.equal(storeStatus(parseOpeningHours('24/7'), new Date(), PARIS).next, null);
  const never = storeStatus(parseOpeningHours('Mo-Su off'), new Date(), PARIS);
  assert.equal(never.open, false);
  assert.equal(never.next, null);
});
