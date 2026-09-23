/** @typedef {import('./types.js').Place} Place */

// Door 2 calendar convention
// --------------------------
// - Trip days are counted departure-day through home-arrival-day, inclusive.
//   "10 days" means Day 1 is the day the traveller leaves home and Day 10 is
//   the day they arrive home.
// - Day numbers follow the local calendar date where the traveller is. A block
//   belongs to the day on which it starts, in local time at its place. For
//   travel, that is the departure place. Crossing the date line is handled
//   naturally: Vancouver->Tokyo departs Day 1 and lands Day 2 local;
//   Tokyo->Vancouver departs Day 7 and lands Day 7 Vancouver time.
// - Engine time is an absolute timeline: hours since 00:00 on Day 1, in the
//   origin's local time.
//     localHours(abs, place) = abs + (place.utcOffsetHours - origin.utcOffsetHours)
//     dayNumber = floor(localHours / 24) + 1
// - A block is overnight when (start, start + duration] contains 02:00 of any
//   day. The scheduler marks a travel block overnight if that holds in either
//   the departure place's or the arrival place's local clock: the traveller is
//   in transit at 2 a.m. somewhere, so they sleep on the plane or bus.
// - Fixed UTC offsets only; DST is not modelled (known ≤1h error).

const OVERNIGHT_HOUR = 2;
// Guards floor() against float noise at exact day boundaries.
const EPSILON = 1e-9;

/**
 * @param {number} absHours  Hours since Day 1 00:00, origin local time.
 * @param {Place} place
 * @param {Place} origin
 */
export function localHours(absHours, place, origin) {
  return absHours + (place.utcOffsetHours - origin.utcOffsetHours);
}

/** Inverse of localHours. */
export function absFromLocalHours(local, place, origin) {
  return local - (place.utcOffsetHours - origin.utcOffsetHours);
}

/** @param {number} local  Hours since Day 1 00:00 in some place's local clock. */
export function dayNumberFromLocalHours(local) {
  return Math.floor((local + EPSILON) / 24) + 1;
}

/** Hour of day (0 ≤ h < 24) for a local-hours value. */
export function hourOfDay(local) {
  const day = dayNumberFromLocalHours(local);
  return Math.max(0, local - (day - 1) * 24);
}

/**
 * True when (startHourOfDay, startHourOfDay + durationHours] contains 02:00 of
 * any day (hours 2, 26, 50, ...).
 * @param {{startHourOfDay: number, durationHours: number}} block
 */
export function isOvernightBlock({ startHourOfDay, durationHours }) {
  const start = startHourOfDay;
  const end = startHourOfDay + durationHours;
  const k = start < OVERNIGHT_HOUR ? 0 : Math.floor((start - OVERNIGHT_HOUR) / 24) + 1;
  const firstTwoAm = OVERNIGHT_HOUR + 24 * k;
  return firstTwoAm > start && firstTwoAm <= end + EPSILON;
}

/**
 * "HH:MM", rounded to the nearest minute. Accepts local hours of any day and
 * formats the time of day.
 * @param {number} hoursLocal
 */
export function formatClock(hoursLocal) {
  const totalMinutes = Math.round(hoursLocal * 60);
  const minuteOfDay = ((totalMinutes % 1440) + 1440) % 1440;
  const hh = Math.floor(minuteOfDay / 60);
  const mm = minuteOfDay % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Parses "HH:MM" to hours. */
export function parseClock(hhmm) {
  const [hh, mm] = hhmm.split(':').map(Number);
  return hh + mm / 60;
}
