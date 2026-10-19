// Shared fixtures for the Q8 packet 1b identity tests.
//
// Two kinds of input live here, and they are never confused:
//
//   REAL PRODUCER OUTPUT — `buildFamily` drives the live `buildF6Trip` path with a frozen
//   clock and the fixed `connectionContext` passed exactly where the page passes it
//   (`Door2Plan.jsx:1854`). Omitting that context takes the F5 branch and would measure
//   the wrong code.
//
//   SYNTHETIC CONSTRUCTIONS — `synthTrip` and friends build adversarial shapes that
//   current pilot data does not produce. Every test that uses one says so in its name, so
//   a synthetic case is never read as measured producer behaviour.

import { buildF6Trip } from '../../../src/lib/door2/connectionBuild.js';
import { PILOT_DATA } from '../../../src/lib/door2/planner.js';
import { PILOT_CONTENT } from '../../../src/lib/door2/pilotContent.js';
import { initialiseIdentityForBuild } from '../../../src/lib/door2/identity.js';

export const FROZEN = '2026-10-18T12:00:00.000Z';

export const CONNECTION_CONTEXT = Object.freeze({
  schemaVersion: 1,
  sequenceId: 'q8-1b-identity-tests',
  generatedAt: FROZEN,
  estimatorRulesetVersion: 'flight-gc-v1',
  estimates: []
});

/** The producer options, with the context where the page passes it. */
export const BUILD_OPTIONS = Object.freeze({
  reviewPolicy: 'allow_drafts',
  content: PILOT_CONTENT,
  connectionContext: CONNECTION_CONTEXT
});

/** Preview options with the frozen generation time every evidence-bearing trip needs. */
export const PREVIEW_OPTIONS = Object.freeze({ generatedAt: FROZEN });

/**
 * D-A §6.2's supplied transition time, fixed so every run is identical. A committing
 * lifecycle transition REQUIRES one (R5), so any opted-in operation below that displaces,
 * orphans, retires or dismisses a placement passes this value; an operation that commits
 * no transition deliberately does not, which is what keeps the no-op case proved.
 */
export const TRANSITION_AT = '2026-10-18T19:30:00.000Z';

export const clone = (value) => JSON.parse(JSON.stringify(value));

export function spec(countryId, totalDays, requiredPlaceIds = []) {
  return {
    originPlaceId: 'vancouver',
    destination: { kind: 'country', id: countryId },
    travelMonth: 10,
    totalDays,
    travellerType: 'couple',
    interests: [],
    pace: 'balanced',
    budget: 'mid',
    routeTemplateId: null,
    stops: [],
    requiredPlaceIds,
    choices: { pinned: [], rejected: [], placed: [] }
  };
}

/** The same five families packet 1a's parity oracle and P1-D pin. */
export const FAMILY_SPECS = Object.freeze({
  'nyc-single-base': spec('US', 7),
  peru: spec('PE', 10),
  'japan-tokyo-single-base': spec('JP', 7),
  'japan-multi-stop': spec('JP', 10, ['kyoto']),
  'eastern-canada-reversible': spec('CA', 10)
});

/** Real producer output, or null when the family does not build. */
export function buildFamily(name) {
  const result = buildF6Trip(FAMILY_SPECS[name], PILOT_DATA, BUILD_OPTIONS);
  return result && result.ok === true && result.value && result.value.trip ? result.value.trip : null;
}

/**
 * A real producer trip carrying a complete, valid map — produced by the engine's own
 * fresh-build entry point, which packet 1b implements and calls from nowhere in
 * production. Tokens are supplied so the map is reproducible within a run.
 */
export function buildFamilyWithIdentity(name, { data = PILOT_DATA, tokens } = {}) {
  const trip = buildFamily(name);
  if (!trip) return null;
  const seeded = initialiseIdentityForBuild(trip, { data, tokens: tokens ?? countingTokens().env });
  if (!seeded.ok) throw new Error(`identityFixtures: ${name} could not be seeded: ${seeded.reason}`);
  return { ...trip, identity: seeded.identity };
}

/**
 * A deterministic token environment plus a call counter. `calls` is what T-A1, T-A2 and
 * T-P1 assert is still zero: a candidate generated is not an issuance committed, and the
 * token contract is about which refusals may generate candidates at all.
 */
export function countingTokens(prefix = 'tok') {
  const state = { calls: 0 };
  state.env = {
    crypto: {
      randomUUID: () => {
        state.calls += 1;
        return `${prefix}${state.calls}`;
      }
    }
  };
  return state;
}

/** A token source that returns one constant value, then (optionally) varies. */
export function constantTokens(value = 'same', varyAfter = Infinity) {
  const state = { calls: 0 };
  state.env = {
    crypto: {
      randomUUID: () => {
        state.calls += 1;
        return state.calls > varyAfter ? `${value}${state.calls}` : value;
      }
    }
  };
  return state;
}

// ---------------------------------------------------------------------------
// Synthetic shapes. Start times and durations are chosen so `classifySlot` really returns
// the named class, rather than the name being asserted by comment.

const SLOT_SHAPE = Object.freeze({
  full: ['09:00', 9],
  half: ['09:00', 4],
  evening: ['18:00', 2],
  short: ['14:00', 2]
});

/** One `op:` block with the scheduler's own id grammar. */
export function opBlock({ stopKey, dayOffset, ordinal = 1, slot = 'full', placeId = 'p_' + stopKey, contentId = null, locked = false, userEdited = false }) {
  const [startTime, durationHours] = SLOT_SHAPE[slot];
  const id = `op:${stopKey}:d${dayOffset}${ordinal > 1 ? `:${ordinal}` : ''}`;
  return {
    id,
    type: contentId == null ? 'open' : 'activity',
    startTime,
    durationHours,
    placeId,
    anchor: { stopId: stopKey, contentId },
    ...(contentId == null ? {} : { activity: { templateId: contentId, title: contentId } }),
    locked,
    userEdited
  };
}

/** One excursion site block, which mints for fixed and selected excursions alike. */
export function excursionSiteBlock({ stopKey, excursionPlaceId, contentId = null, locked = false, userEdited = false }) {
  return {
    id: `ex:${stopKey}:${excursionPlaceId}:site`,
    type: contentId == null ? 'open' : 'activity',
    startTime: '09:00',
    durationHours: 6,
    placeId: excursionPlaceId,
    anchor: { stopId: stopKey, contentId },
    ...(contentId == null ? {} : { activity: { templateId: contentId, title: contentId } }),
    locked,
    userEdited
  };
}

/**
 * A travel block, which mints nothing. `transport.arriveDayNumber` is what `fill.js`'s
 * `arrivalDaysByStop` reads to compute an offset (`fill.js:78`), and `synthTrip` fills it
 * in from the layout so the engine's own `blockContext` agrees with the parsed address.
 */
export function travelBlock(fromStopKey, toStopKey) {
  return {
    id: `tr:${fromStopKey}>${toStopKey}`,
    type: 'travel',
    startTime: '07:00',
    durationHours: 3,
    placeId: 'p_' + toStopKey,
    anchor: { stopId: toStopKey, contentId: 'conn_' + toStopKey },
    transport: { connectionId: 'conn_' + toStopKey, mode: 'train', arriveDayNumber: null }
  };
}

/** A rest filler, which mints nothing and whose anchor carries no stop at all. */
export function restBlock(dayNumber) {
  return {
    id: `rest:d${dayNumber}`,
    type: 'rest',
    startTime: '09:00',
    durationHours: 0,
    placeId: null,
    anchor: { stopId: null, contentId: null }
  };
}

/**
 * A synthetic trip. `days` is an array of block arrays; `stops` names the route plan's
 * stop keys, which is what decides `displaced` from `orphaned`.
 */
export function synthTrip({ days, stops, variantId = 'synth_variant', choices }) {
  const laidOut = days.map((blocks, i) => ({ dayNumber: i + 1, blocks: blocks.map((b) => clone(b)) }));
  // Each travel leg arrives on the first later day that holds a block at its own stop, so
  // `blockContext`'s offsets match the ids the layout declares. A leg with no such day
  // arrives on its own day.
  for (const day of laidOut) {
    for (const block of day.blocks) {
      if (block.type !== 'travel' || !block.id.startsWith('tr:')) continue;
      const stopId = block.anchor.stopId;
      const landing = laidOut.find((d) => d.dayNumber >= day.dayNumber && d.blocks.some((b) => b.type !== 'travel' && b.anchor?.stopId === stopId));
      block.transport = { ...block.transport, arriveDayNumber: landing ? landing.dayNumber : day.dayNumber };
    }
  }
  return {
    spec: { totalDays: laidOut.length, choices: choices ?? { pinned: [], rejected: [], placed: [] } },
    routePlan: { variantId, stops: stops.map((key) => ({ key, placeId: 'p_' + key, nights: 1 })), nightsSource: 'package' },
    days: laidOut,
    contentGaps: [],
    status: 'ok',
    warnings: []
  };
}

/** A map built by hand, for the validation and correspondence tests. */
export function map({ used, blocks, edits = {} }) {
  return { version: 1, used: [...used], blocks: clone(blocks), edits: clone(edits) };
}

/** A live `open` placement. */
export function livePlacement(stopKey, dayOffset, ordinal, slot) {
  return { stopKey, kind: 'open', address: { dayOffset, ordinal, slot }, state: 'live' };
}

/** A live excursion placement. */
export function liveExcursion(stopKey, excursionPlaceId, excursionId = null) {
  return { stopKey, kind: 'excursion', address: { excursionPlaceId }, state: 'live', excursionId };
}

export { PILOT_DATA, PILOT_CONTENT };
