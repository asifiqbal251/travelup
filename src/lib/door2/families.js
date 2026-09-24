/** @typedef {import('./types.js').RouteFamily} RouteFamily */
/** @typedef {import('./types.js').RoutePackage} RoutePackage */
/** @typedef {import('./types.js').RoutePackageStop} RoutePackageStop */

import { selectRoutes } from './route.js';
import { PackageAuthoringError, scheduleRoute } from './schedule.js';
import { validateSkeleton } from './validate.js';

// Route Families (design-door2-route-families v2, §3 + §0.1 A/F/G/I).
//
// A family is one backbone of stops plus optional stops, each with the
// positions it may take. Every allowed combination is compiled here, when the
// data is built, into an ordinary RoutePackage that route.js / schedule.js
// already understand. Nothing is composed while a traveller is using the app.
//
// Stop keys are family-scoped, so a stop keeps its identity (and so its block
// ids and content) across variants.
//
// Servability is controlled by position status: a variant with any
// 'pending_review' position is "held". Held variants are compiled and checked
// like every other variant, but compileFamilies() only returns them when
// includePending is true.
//
// Pure and deterministic: no randomness, no Date.now().

export const MAX_VARIANTS_PER_FAMILY = 24;

/** A family that can't be compiled or scheduled as authored. Thrown for the author, never shown to a traveller. */
export class FamilyAuthoringError extends Error {
  constructor(reason, detail = {}) {
    super(`Family authoring error: ${reason}`);
    this.name = 'FamilyAuthoringError';
    this.reason = reason;
    this.detail = { reason, ...detail };
  }
}

/**
 * Derives placeIds and visitRules from the stops (moved here unchanged from
 * pilotData.js so hand-written and compiled packages share one derivation).
 * @param {Omit<RoutePackage, 'placeIds'|'visitRules'|'reviewed'>} pkg
 * @returns {RoutePackage}
 */
export function routePackage(pkg) {
  const placeIds = [];
  for (const s of pkg.stops) {
    if (!placeIds.includes(s.placeId)) placeIds.push(s.placeId);
    for (const ex of s.excursions) {
      if (!placeIds.includes(ex.placeId)) placeIds.push(ex.placeId);
    }
  }
  return {
    ...pkg,
    placeIds,
    visitRules: {
      minNights: pkg.stops.reduce((sum, s) => sum + s.minNights, 0),
      maxNights: pkg.stops.reduce((sum, s) => sum + s.maxNights, 0),
      extensions: []
    },
    reviewed: false
  };
}

/**
 * Every allowed choice of optionals for a family, in a fixed order: backbone
 * first, then by number of optionals present, then by (optional index,
 * position index) in declaration order.
 * @returns {Array<Array<{optIndex: number, posIndex: number}>>}
 */
function enumerateCombos(family) {
  const optionals = family.optional ?? [];
  /** @type {Array<Array<{optIndex: number, posIndex: number}>>} */
  let combos = [[]];
  optionals.forEach((opt, optIndex) => {
    const next = [];
    for (const combo of combos) {
      next.push(combo);
      opt.positions.forEach((_, posIndex) => next.push([...combo, { optIndex, posIndex }]));
    }
    combos = next;
  });
  const exclusive = (a, b) =>
    (optionals[a].exclusiveWith ?? []).includes(optionals[b].id) || (optionals[b].exclusiveWith ?? []).includes(optionals[a].id);
  const allowed = combos.filter((combo) =>
    combo.every((x, i) => combo.every((y, j) => j <= i || !exclusive(x.optIndex, y.optIndex)))
  );
  const key = (combo) => combo.flatMap((c) => [c.optIndex, c.posIndex]);
  return allowed.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  });
}

function checkFamilyShape(family) {
  const fail = (reason, detail = {}) => {
    throw new FamilyAuthoringError(reason, { familyId: family.id, ...detail });
  };
  if (!family.id || !family.stops || !Array.isArray(family.backbone)) fail('family_incomplete');
  for (const key of family.backbone) {
    if (!family.stops[key]) fail('unknown_stop_key', { stopKey: key, where: 'backbone' });
  }
  const optionalIds = new Set();
  for (const opt of family.optional ?? []) {
    if (optionalIds.has(opt.id)) fail('duplicate_optional_id', { optionalId: opt.id });
    optionalIds.add(opt.id);
    const positionIds = new Set();
    if (!Array.isArray(opt.positions) || opt.positions.length === 0) fail('optional_without_positions', { optionalId: opt.id });
    for (const pos of opt.positions) {
      if (positionIds.has(pos.id)) fail('duplicate_position_id', { optionalId: opt.id, positionId: pos.id });
      positionIds.add(pos.id);
      if (pos.status !== 'approved' && pos.status !== 'pending_review') {
        fail('invalid_position_status', { optionalId: opt.id, positionId: pos.id, status: pos.status });
      }
      for (const key of pos.insert ?? []) {
        if (!family.stops[key]) fail('unknown_stop_key', { stopKey: key, where: `${opt.id}@${pos.id}` });
      }
      for (const key of Object.keys(pos.overrides ?? {})) {
        if (!family.stops[key]) fail('unknown_stop_key', { stopKey: key, where: `${opt.id}@${pos.id} overrides` });
      }
    }
  }
}

/**
 * @param {RouteFamily} family
 * @returns {RoutePackage[]} every variant, held ones included (marked held: true)
 */
function compileFamily(family) {
  checkFamilyShape(family);
  const optionals = family.optional ?? [];
  const combos = enumerateCombos(family);
  if (combos.length > MAX_VARIANTS_PER_FAMILY) {
    throw new FamilyAuthoringError('too_many_variants', {
      familyId: family.id,
      count: combos.length,
      max: MAX_VARIANTS_PER_FAMILY,
      message: `Family "${family.id}" compiles to ${combos.length} variants (max ${MAX_VARIANTS_PER_FAMILY}).`
    });
  }

  const packages = combos.map((combo) => {
    const picks = combo.map(({ optIndex, posIndex }) => ({ opt: optionals[optIndex], pos: optionals[optIndex].positions[posIndex] }));
    const variantId = picks.length === 0 ? family.id : `${family.id}+${picks.map((p) => `${p.opt.id}@${p.pos.id}`).join('+')}`;

    // Ordered stop keys: splice each position's insert after its `after` key.
    const keys = [...family.backbone];
    for (const { opt, pos } of picks) {
      const at = keys.indexOf(pos.after);
      if (at < 0) {
        throw new FamilyAuthoringError('after_key_missing', { familyId: family.id, variantId, optionalId: opt.id, positionId: pos.id, after: pos.after });
      }
      keys.splice(at + 1, 0, ...pos.insert);
    }
    const seen = new Set();
    for (const key of keys) {
      if (seen.has(key)) throw new FamilyAuthoringError('duplicate_stop_key', { familyId: family.id, variantId, stopKey: key });
      seen.add(key);
    }

    // Per-variant limits: position overrides apply to this variant only.
    const limits = {};
    for (const { pos } of picks) {
      for (const [key, o] of Object.entries(pos.overrides ?? {})) limits[key] = { ...(limits[key] ?? {}), ...o };
    }
    const stops = keys.map((key) => {
      const def = family.stops[key];
      return {
        id: key,
        placeId: def.placeId,
        minNights: limits[key]?.minNights ?? def.minNights,
        maxNights: limits[key]?.maxNights ?? def.maxNights,
        excursions: (def.excursions ?? []).map((ex) => ({ ...ex }))
      };
    });
    for (const s of stops) {
      if (!(Number.isInteger(s.minNights) && Number.isInteger(s.maxNights) && s.minNights >= 0 && s.minNights <= s.maxNights)) {
        throw new FamilyAuthoringError('invalid_night_limits', { familyId: family.id, variantId, stopKey: s.id, minNights: s.minNights, maxNights: s.maxNights });
      }
    }

    const assumptions = [
      ...(family.assumptions ?? []),
      ...picks.flatMap(({ opt, pos }) => [...(opt.assumptions ?? []), ...(pos.assumptions ?? [])])
    ];
    const name = picks.length === 0 ? family.name : picks.length === 1 && picks[0].pos.variantName ? picks[0].pos.variantName : `${family.name} with ${picks.map((p) => p.opt.label).join(' and ')}`;

    const pkg = routePackage({
      id: variantId,
      name,
      countryId: family.countryId,
      ...(family.assumptions !== undefined || assumptions.length > 0 ? { assumptions } : {}),
      ...(family.preferredGatewayId ? { preferredGatewayId: family.preferredGatewayId } : {}),
      stops
    });
    return {
      ...pkg,
      familyId: family.id,
      variantId,
      optionals: picks.map(({ opt, pos }) => ({ optionalId: opt.id, positionId: pos.id, stopKeys: [...pos.insert] })),
      aliases: [...(family.aliases?.[variantId] ?? [])],
      held: picks.some(({ pos }) => pos.status === 'pending_review')
    };
  });

  for (const variantId of Object.keys(family.aliases ?? {})) {
    if (!packages.some((p) => p.id === variantId)) {
      throw new FamilyAuthoringError('alias_for_unknown_variant', { familyId: family.id, variantId });
    }
  }
  return packages;
}

/**
 * Compiles families into RoutePackages.
 * @param {RouteFamily[]} families
 * @param {{includePending?: boolean}} [options]
 * @returns {RoutePackage[]}
 */
export function compileFamilies(families, { includePending = false } = {}) {
  const all = families.flatMap(compileFamily);
  const names = new Map();
  for (const pkg of all) {
    for (const name of [pkg.id, ...pkg.aliases]) {
      if (names.has(name)) {
        throw new FamilyAuthoringError('duplicate_package_id', { id: name, variants: [names.get(name), pkg.id] });
      }
      names.set(name, pkg.id);
    }
  }
  return includePending ? all : all.filter((p) => !p.held);
}

/**
 * Checks that each variant can actually be routed and scheduled: runs it
 * through selectRoutes + scheduleRoute (+ validateSkeleton) at its own
 * minimum length, the same path the planner uses. Throws a
 * FamilyAuthoringError naming the first variant that fails.
 *
 * Connection review status is not checked here (allow_drafts): that is a
 * traveller-facing policy, not an authoring error.
 *
 * @param {RoutePackage[]} packages
 * @param {{places: Object|Map, connections: Object[]}} data
 * @param {{originPlaceId?: string}} [options]  Origin to route from (the pilot has one: Vancouver).
 * @returns {Array<{variantId: string, held: boolean, minDays: number, maxDays: number}>}
 */
export function checkVariantsSchedulable(packages, data, { originPlaceId = 'vancouver' } = {}) {
  return packages.map((pkg) => {
    const fail = (reason, detail = {}) => {
      throw new FamilyAuthoringError(reason, { variantId: pkg.id, familyId: pkg.familyId, ...detail });
    };
    const soloData = { ...data, routePackages: [pkg] };
    const spec = {
      originPlaceId,
      destination: { kind: 'country', id: pkg.countryId },
      travelMonth: 1,
      totalDays: 1,
      travellerType: 'couple',
      interests: [],
      pace: 'balanced',
      budget: 'mid',
      requiredPlaceIds: [],
      routeTemplateId: pkg.id,
      stops: [],
      choices: { pinned: [], rejected: [], placed: [] }
    };
    const routes = selectRoutes(spec, soloData, { reviewPolicy: 'allow_drafts' });
    if (!routes.ok) fail('route_not_selectable', { state: routes.state, routeDetail: routes.detail });
    const routeResult = routes.value.find((r) => r.routePackageId === pkg.id);
    if (!routeResult) fail('route_not_selectable', { state: 'not_returned' });

    let minDays;
    try {
      const probe = scheduleRoute(routeResult, spec, soloData);
      minDays = probe.ok ? 1 : probe.detail.minDays;
      const atMin = { ...spec, totalDays: minDays };
      const scheduled = scheduleRoute(routeResult, atMin, soloData);
      if (!scheduled.ok) fail('not_schedulable_at_min_days', { minDays, state: scheduled.state });
      const v = validateSkeleton(scheduled, routeResult, atMin, soloData, { reviewPolicy: 'allow_drafts' });
      if (!v.ok) fail('not_valid_at_min_days', { minDays, state: v.state });
    } catch (err) {
      if (err instanceof FamilyAuthoringError) throw err;
      if (err instanceof PackageAuthoringError) fail(`package_authoring:${err.reason}`, { packageDetail: err.detail });
      fail('engine_error', { message: err.message });
    }
    const maxDays = minDays + pkg.stops.reduce((sum, s) => sum + (s.maxNights - s.minNights), 0);
    return { variantId: pkg.id, held: pkg.held === true, minDays, maxDays };
  });
}
