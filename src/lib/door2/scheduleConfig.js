// Skeleton scheduler configuration.
// These are planning assumptions, not facts.

export const SCHEDULE_CONFIG = Object.freeze({
  dayStartHour: 9,             // legs from a base depart at this local time; full days open 09–21
  dayEndHour: 21,
  latestDepartureHour: 17,     // a pass-through connection may start only if local hour <= this
  groundLatestArrivalHour: 23, // a non-flight leg must arrive by this local hour, same local date
  longHaulThresholdHours: 8,   // computeUsableTimeLost >= this counts as long-haul
  longHaulArrivalMaxOpenHours: 4,
  minOpenBlockHours: 1.5
});
export const ENGINE_VERSION = 'door2-skeleton-0.1';
