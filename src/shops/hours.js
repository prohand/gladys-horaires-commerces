// -----------------------------------------------------------------------------
// Opening hours of a store, computed locally.
//
// Shops publish no common API for their hours, so the user types them, in the
// OpenStreetMap `opening_hours` syntax — the one a shop's map page usually
// already carries, e.g. `Mo-Sa 08:30-20:00; Su 09:00-12:30; PH off`.
// The common subset is supported:
//
//   - days `Mo Tu We Th Fr Sa Su`, ranges (`Mo-Sa`) and lists (`Mo,We,Fr-Su`);
//   - `PH`, the French public holidays (computed here, Easter included);
//   - one or more time ranges per rule (`08:30-12:00,14:00-19:00`), or `off`;
//   - `24/7`;
//   - rules separated by `;`, a later rule replacing the earlier ones for the
//     days it names (the OpenStreetMap meaning).
//
// Times are read on the French clock (Europe/Paris), whatever the clock of the
// container: the stores are in France, the container runs in UTC.
// -----------------------------------------------------------------------------

const DAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
const DAY_MINUTES = 24 * 60;
/** How far ahead the next opening is looked for: a week and a day. */
const HORIZON_DAYS = 8;

/** A syntax error, with the part of the text that caused it. */
export class OpeningHoursError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OpeningHoursError';
  }
}

function parseTime(text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) {
    throw new OpeningHoursError(`"${text}" is not a time (HH:MM)`);
  }
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) {
    throw new OpeningHoursError(`"${text}" is not a time of day`);
  }
  return hours * 60 + minutes;
}

function parseTimes(text) {
  if (/^(off|closed)$/i.test(text)) {
    return [];
  }
  return text.split(',').map((range) => {
    const [start, end, extra] = range.split('-');
    if (end === undefined || extra !== undefined) {
      throw new OpeningHoursError(`"${range}" is not a time range (HH:MM-HH:MM)`);
    }
    const interval = [parseTime(start.trim()), parseTime(end.trim())];
    if (interval[1] <= interval[0]) {
      throw new OpeningHoursError(`"${range}": the closing time must come after the opening time`);
    }
    return interval;
  });
}

/** `Mo-Sa,PH` → { days: [0..5], holidays: true } */
function parseSelector(text) {
  const days = new Set();
  let holidays = false;
  for (const part of text.toLowerCase().split(',')) {
    if (part === 'ph') {
      holidays = true;
      continue;
    }
    const [from, to, extra] = part.split('-');
    const start = DAYS.indexOf(from);
    const end = to === undefined ? start : DAYS.indexOf(to);
    if (start === -1 || end === -1 || extra !== undefined) {
      throw new OpeningHoursError(`"${part}" is not a day (Mo, Tu, We, Th, Fr, Sa, Su or PH)`);
    }
    // A wrapping range (Sa-Mo) is valid OpenStreetMap.
    for (let day = start; ; day = (day + 1) % 7) {
      days.add(day);
      if (day === end) break;
    }
  }
  return { days: [...days], holidays };
}

/**
 * Parse an `opening_hours` text.
 * @param {string} text
 * @returns {{ week: Array<Array<[number, number]>>, holidays: Array<[number, number]> | null }}
 *   the minute ranges of each day (Monday first), and those of a public
 *   holiday (`null`: a holiday follows its day of the week)
 */
export function parseOpeningHours(text) {
  const week = DAYS.map(() => []);
  let holidays = null;
  const rules = String(text ?? '')
    .split(';')
    .map((rule) => rule.trim())
    .filter(Boolean);
  if (rules.length === 0) {
    throw new OpeningHoursError('No opening hours');
  }
  for (const rule of rules) {
    if (rule === '24/7') {
      week.forEach((_, day) => (week[day] = [[0, DAY_MINUTES]]));
      continue;
    }
    // "Mo-Sa 08:30-20:00", "PH off", or "08:00-20:00" alone (every day).
    const match = /^([A-Za-z,-]+)\s+(.+)$/.exec(rule);
    const selector = match ? parseSelector(match[1]) : { days: [0, 1, 2, 3, 4, 5, 6] };
    const intervals = parseTimes((match ? match[2] : rule).replace(/\s+/g, ''));
    for (const day of selector.days) {
      week[day] = intervals;
    }
    if (selector.holidays) {
      holidays = intervals;
    }
  }
  return { week, holidays };
}

/** Easter Sunday of a year (anonymous Gregorian algorithm), as a UTC date. */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** The eleven French public holidays of a year, as `YYYY-MM-DD`. */
export function frenchHolidays(year) {
  const easter = easterSunday(year).getTime();
  const afterEaster = (days) =>
    new Date(easter + days * DAY_MINUTES * 60_000).toISOString().slice(0, 10);
  const fixed = ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'];
  return new Set([
    ...fixed.map((day) => `${year}-${day}`),
    afterEaster(1), // Easter Monday
    afterEaster(39), // Ascension
    afterEaster(50), // Whit Monday
  ]);
}

/** Date and time of an instant on a given clock. */
export function localTime(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, Number(value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    minutes: parts.hour * 60 + parts.minute + parts.second / 60,
  };
}

/**
 * The day `offset` days after a local date: its date (midnight UTC, to be
 * formatted on the UTC clock), whether it is a public holiday, its ranges.
 */
function dayOf(schedule, { year, month, day }, offset) {
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  const holiday = frenchHolidays(date.getUTCFullYear()).has(date.toISOString().slice(0, 10));
  const ranges =
    holiday && schedule.holidays ? schedule.holidays : schedule.week[(date.getUTCDay() + 6) % 7];
  return { date, holiday, ranges };
}

/** The ranges of the day `offset` days after a local date. */
function rangesOf(schedule, local, offset) {
  return dayOf(schedule, local, offset).ranges;
}

/**
 * The hours of the `count` days after today, on the local clock.
 * @returns {Array<{ dayOffset: number, date: Date, holiday: boolean, ranges: Array<[number, number]> }>}
 */
export function upcomingDays(schedule, now, timeZone, count) {
  const local = localTime(now, timeZone);
  return Array.from({ length: count }, (_, index) => ({
    dayOffset: index + 1,
    ...dayOf(schedule, local, index + 1),
  }));
}

function formatClock(minutes) {
  const inDay = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hours = Math.floor(inDay / 60);
  return `${String(hours).padStart(2, '0')}:${String(inDay % 60).padStart(2, '0')}`;
}

/**
 * Whether the store is open at an instant, and when that changes.
 *
 * @param {ReturnType<typeof parseOpeningHours>} schedule
 * @param {Date} now
 * @param {string} timeZone
 * @returns {{
 *   open: boolean,
 *   next: { open: boolean, inMinutes: number, at: Date, time: string, dayOffset: number } | null,
 *   today: Array<[number, number]>
 * }} `next` is the next opening (when closed) or closing (when open), `null`
 *   when there is none within a week (always open, or never)
 */
export function storeStatus(schedule, now, timeZone) {
  const local = localTime(now, timeZone);
  // Every range of the coming days on one line, in minutes since today 00:00,
  // ranges that touch across midnight merged (open until 24:00, from 00:00).
  const timeline = [];
  for (let offset = 0; offset < HORIZON_DAYS; offset += 1) {
    for (const [start, end] of rangesOf(schedule, local, offset)) {
      const range = [offset * DAY_MINUTES + start, offset * DAY_MINUTES + end];
      const last = timeline.at(-1);
      if (last && range[0] <= last[1]) {
        last[1] = Math.max(last[1], range[1]);
      } else {
        timeline.push(range);
      }
    }
  }
  const horizon = HORIZON_DAYS * DAY_MINUTES;
  const current = timeline.find(([start, end]) => start <= local.minutes && local.minutes < end);
  // Open: the end of the current range. Closed: the start of the next one.
  const target = current
    ? current[1] < horizon
      ? current[1]
      : null
    : (timeline.find(([start]) => start > local.minutes)?.[0] ?? null);
  const next =
    target === null
      ? null
      : {
          open: !current,
          inMinutes: Math.ceil(target - local.minutes),
          // The clock may move once in the meantime (summer time): the
          // instant is off by an hour that night, the local time is not.
          at: new Date(now.getTime() + (target - local.minutes) * 60_000),
          time: formatClock(target),
          dayOffset: Math.floor(target / DAY_MINUTES),
        };
  return { open: Boolean(current), next, today: rangesOf(schedule, local, 0) };
}

/** `[[510, 1200]]` → `08:30-20:00`, for the messages and the widget. */
export function formatRanges(ranges) {
  return ranges
    .map(
      ([start, end]) => `${formatClock(start)}-${end === DAY_MINUTES ? '24:00' : formatClock(end)}`,
    )
    .join(', ');
}
