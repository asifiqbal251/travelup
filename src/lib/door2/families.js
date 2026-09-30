/** @typedef {import('./types.js').RouteFamily} RouteFamily */
/** @typedef {import('./types.js').RoutePackage} RoutePackage */
/** @typedef {import('./types.js').RoutePackageStop} RoutePackageStop */

import { orientConnection } from './bufferRuleset.js';
import { getPlace, selectRoutes } from './route.js';
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
// Servability is controlled by review status: a variant is "held" when any
// authored choice in it is 'pending_review' — one of its positions, or its
// direction. Held variants are compiled and checked like every other variant,
// but compileFamilies() only returns them when includePending is true.
//
// Directions (C3a). A family may declare `directions`: at most two, the first
// canonical (the authored backbone order), the second its mirror. The
// canonical direction compiles exactly as a family without directions would.
// The mirror is NOT compiled from the authoring: each compiled canonical
// variant is copied with its stop list reversed, so every inserted group
// reverses along with it. Positions are never re-resolved against a reversed
// backbone (C1-F4: doing that by hand put a spur on the wrong side of a
// mid-route stop). Variant ids carry the direction after '#':
// 'demo#a_to_c', 'demo#a_to_c+mid@ab'. A family without `directions` keeps
// its plain ids ('peru_classic', 'peru_classic+huaraz@after_lima_in').
// Code reads the direction from `directionId`, never by parsing the id.
// Each variant is named after its own direction (variantName), so a mirror
// never shares its canonical twin's name.
//
// MAX_VARIANTS_PER_FAMILY applies after the direction expansion, so a
// two-direction family has half the budget for optional combinations (12).
//
// Excursion menus (E3a). A family stop may carry an authored `excursionMenu`: same-day
// trips the traveller can add or remove (restructure.js previewAddExcursion /
// previewRemoveExcursion). A menu is data on the compiled stop, copied through
// verbatim (deep-copied in the mirror); it is NOT a variant dimension, so it never
// touches MAX_VARIANTS_PER_FAMILY, and its places stay out of `placeIds`. A stop
// without a menu compiles byte-identically to before (the key is omitted).
//
// Pure and deterministic: no randomness, no Date.now().

export const MAX_VARIANTS_PER_FAMILY = 24;
export const MAX_DIRECTIONS_PER_FAMILY = 2;

const REVIEW_STATUSES = ['approved', 'pending_review'];

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
  const reversible = family.directions !== undefined;
  if (reversible) {
    if (!Array.isArray(family.directions) || family.directions.length === 0) fail('directions_empty');
    if (family.directions.length > MAX_DIRECTIONS_PER_FAMILY) {
      fail('too_many_directions', { count: family.directions.length, max: MAX_DIRECTIONS_PER_FAMILY });
    }
    const directionIds = new Set();
    for (const dir of family.directions) {
      if (!dir?.id) fail('direction_without_id');
      if (directionIds.has(dir.id)) fail('duplicate_direction_id', { directionId: dir.id });
      directionIds.add(dir.id);
      if (!REVIEW_STATUSES.includes(dir.status)) fail('invalid_direction_status', { directionId: dir.id, status: dir.status });
    }
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
      checkPositionAnchor(family, opt, pos, reversible, fail);
      for (const key of pos.insert ?? []) {
        if (!family.stops[key]) fail('unknown_stop_key', { stopKey: key, where: `${opt.id}@${pos.id}` });
      }
      for (const key of Object.keys(pos.overrides ?? {})) {
        if (!family.stops[key]) fail('unknown_stop_key', { stopKey: key, where: `${opt.id}@${pos.id} overrides` });
      }
    }
  }
  checkSegmentOrders(family, fail);
  checkExcursionMenus(family, fail);
}

/**
 * Shape checks that need no data: statuses, ids unique in the family, no two
 * excursions (fixed or menu) at one stop sharing a place (their block ids would
 * collide), no menu on a pass-through, and no menu place equal to its own base.
 * Places, connections and schedulability are checked in checkVariantsSchedulable.
 */
function checkExcursionMenus(family, fail) {
  const menuIds = new Set();
  for (const [stopKey, def] of Object.entries(family.stops)) {
    if (def.excursionMenu === undefined) continue;
    if (!Array.isArray(def.excursionMenu)) fail('excursion_menu_invalid', { stopKey });
    if (def.excursionMenu.length > 0 && def.maxNights === 0) fail('excursion_menu_on_pass_through', { stopKey });
    const placeIds = new Set((def.excursions ?? []).map((ex) => ex.placeId));
    for (const menuItem of def.excursionMenu) {
      if (typeof menuItem?.id !== 'string' || menuItem.id === '') fail('excursion_without_id', { stopKey });
      if (menuIds.has(menuItem.id)) fail('duplicate_excursion_id', { stopKey, excursionId: menuItem.id });
      menuIds.add(menuItem.id);
      if (!REVIEW_STATUSES.includes(menuItem.status)) fail('invalid_excursion_status', { stopKey, excursionId: menuItem.id, status: menuItem.status });
      if (menuItem.placeId === def.placeId) fail('excursion_place_is_base', { stopKey, excursionId: menuItem.id, placeId: menuItem.placeId });
      if (placeIds.has(menuItem.placeId)) fail('duplicate_excursion_place', { stopKey, excursionId: menuItem.id, placeId: menuItem.placeId });
      placeIds.add(menuItem.placeId);
      if (!(menuItem.hoursOnSite > 0)) fail('invalid_excursion_hours', { stopKey, excursionId: menuItem.id, hoursOnSite: menuItem.hoursOnSite });
    }
  }
}

/**
 * A position is anchored by `after` (a stop key it follows) or by `between`
 * (two keys adjacent in the backbone, named in backbone order), never both.
 * A family with directions must use `between`: "after X" has no meaning once
 * the order can flip.
 */
function checkPositionAnchor(family, opt, pos, reversible, fail) {
  const where = { optionalId: opt.id, positionId: pos.id };
  const hasAfter = pos.after !== undefined;
  const hasBetween = pos.between !== undefined;
  if (hasAfter && hasBetween) fail('position_anchor_ambiguous', where);
  if (reversible && !hasBetween) fail('after_position_in_reversible_family', where);
  if (pos.segmentOrder !== undefined) {
    if (!hasBetween) fail('segment_order_without_between', where);
    if (!Number.isInteger(pos.segmentOrder)) fail('invalid_segment_order', { ...where, segmentOrder: pos.segmentOrder });
  }
  // `after` is resolved (and a missing key reported) at compile time, as before.
  if (!hasBetween) return;
  if (!Array.isArray(pos.between) || pos.between.length !== 2) fail('segment_not_adjacent', { ...where, between: pos.between });
  for (const key of pos.between) {
    if (!family.stops[key]) fail('unknown_stop_key', { stopKey: key, where: `${opt.id}@${pos.id} between` });
  }
  const [from, to] = pos.between;
  const i = family.backbone.indexOf(from);
  if (i < 0 || family.backbone[i + 1] !== to) fail('segment_not_adjacent', { ...where, between: [...pos.between] });
}

/**
 * Two positions that can be picked together (different optionals, not
 * exclusive) and share a `between` segment must both give a segmentOrder, and
 * different ones: their relative order is authored, never an accident of
 * declaration order.
 */
function checkSegmentOrders(family, fail) {
  const exclusive = (a, b) => (a.exclusiveWith ?? []).includes(b.id) || (b.exclusiveWith ?? []).includes(a.id);
  const inSegment = [];
  for (const opt of family.optional ?? []) {
    for (const pos of opt.positions) if (pos.between) inSegment.push({ opt, pos, segment: pos.between.join('|') });
  }
  for (let i = 0; i < inSegment.length; i++) {
    for (let j = i + 1; j < inSegment.length; j++) {
      const a = inSegment[i];
      const b = inSegment[j];
      if (a.segment !== b.segment || a.opt === b.opt || exclusive(a.opt, b.opt)) continue;
      const detail = { segment: [...a.pos.between], positions: [`${a.opt.id}@${a.pos.id}`, `${b.opt.id}@${b.pos.id}`] };
      if (a.pos.segmentOrder === undefined || b.pos.segmentOrder === undefined) fail('segment_order_missing', detail);
      if (a.pos.segmentOrder === b.pos.segmentOrder) fail('segment_order_duplicate', detail);
    }
  }
}

/**
 * Ordered stop keys for one choice of optionals, in the canonical direction.
 *
 * `between` picks go first: each segment's groups, lowest segmentOrder first
 * (nearest the segment's first stop), are placed directly before the
 * segment's second stop.
 *
 * `after` picks keep their original rule exactly: in declaration order, each
 * insert is spliced directly after its anchor. So two optionals anchored after
 * the same key land in REVERSE declaration order (the later splice goes in
 * front of the earlier one). That is an accident of splice, but Peru's
 * compiled output is pinned to this rule: don't "fix" it. Use `between` +
 * `segmentOrder` when the order of neighbouring optionals matters.
 */
function orderedStopKeys(family, picks, variantId) {
  const keys = [...family.backbone];
  const bySegment = new Map();
  for (const pick of picks) {
    if (!pick.pos.between) continue;
    const segment = pick.pos.between.join('|');
    if (!bySegment.has(segment)) bySegment.set(segment, []);
    bySegment.get(segment).push(pick);
  }
  for (const group of bySegment.values()) {
    group.sort((a, b) => (a.pos.segmentOrder ?? 0) - (b.pos.segmentOrder ?? 0));
    keys.splice(keys.indexOf(group[0].pos.between[1]), 0, ...group.flatMap(({ pos }) => pos.insert));
  }
  for (const { opt, pos } of picks) {
    if (pos.between) continue;
    const at = keys.indexOf(pos.after);
    if (at < 0) {
      throw new FamilyAuthoringError('after_key_missing', { familyId: family.id, variantId, optionalId: opt.id, positionId: pos.id, after: pos.after });
    }
    keys.splice(at + 1, 0, ...pos.insert);
  }
  return keys;
}

/**
 * The variant id for a family, a direction (null when the family has none)
 * and its picks in family declaration order. restructure.js rebuilds ids with
 * this too, so the two can never disagree.
 * @param {string} familyId
 * @param {string|null|undefined} directionId
 * @param {Array<{optionalId: string, positionId: string}>} picks
 */
export function familyVariantId(familyId, directionId, picks) {
  const base = directionId == null ? familyId : `${familyId}#${directionId}`;
  return picks.length === 0 ? base : `${base}+${picks.map((p) => `${p.optionalId}@${p.positionId}`).join('+')}`;
}

/**
 * A variant's traveller-facing name. A family with directions leads with the
 * direction's label, because on a corridor that is what tells the two apart
 * ('Toronto to Québec City, with Ottawa'). A family without directions keeps
 * its original rule: the family name, a single position's variantName, or
 * '<family name> with <labels>'.
 * @param {RouteFamily} family
 * @param {{label: string}|null} direction
 */
function variantName(family, direction, picks) {
  const labels = picks.map((p) => p.opt.label).join(' and ');
  if (direction) return picks.length === 0 ? direction.label : `${direction.label}, with ${labels}`;
  if (picks.length === 0) return family.name;
  return picks.length === 1 && picks[0].pos.variantName ? picks[0].pos.variantName : `${family.name} with ${labels}`;
}

/**
 * The reverse-direction twin of a compiled canonical variant: the same
 * package with its stops reversed (C1-F4). Nothing is re-resolved.
 */
function mirrorVariant(family, direction, { pkg: canonical, picks }) {
  const variantId = familyVariantId(family.id, direction.id, picks.map(({ opt, pos }) => ({ optionalId: opt.id, positionId: pos.id })));
  const pkg = routePackage({
    id: variantId,
    name: variantName(family, direction, picks),
    countryId: canonical.countryId,
    ...(canonical.assumptions !== undefined ? { assumptions: [...canonical.assumptions] } : {}),
    ...(canonical.preferredGatewayId ? { preferredGatewayId: canonical.preferredGatewayId } : {}),
    stops: [...canonical.stops].reverse().map((s) => ({
      ...s,
      excursions: s.excursions.map((ex) => ({ ...ex })),
      // A spread would share the canonical stop's menu with its mirror.
      ...(s.excursionMenu ? { excursionMenu: s.excursionMenu.map((m) => ({ ...m })) } : {})
    }))
  });
  return {
    ...pkg,
    familyId: family.id,
    variantId,
    directionId: direction.id,
    optionals: canonical.optionals.map((o) => ({ ...o, stopKeys: [...o.stopKeys] })),
    aliases: [...(family.aliases?.[variantId] ?? [])],
    held: picks.some(({ pos }) => pos.status === 'pending_review') || direction.status === 'pending_review'
  };
}

/**
 * @param {RouteFamily} family
 * @returns {RoutePackage[]} every variant, held ones included (marked held: true)
 */
function compileFamily(family) {
  checkFamilyShape(family);
  const optionals = family.optional ?? [];
  const combos = enumerateCombos(family);
  const [canonicalDir = null, mirrorDir = null] = family.directions ?? [];
  const count = combos.length * (mirrorDir ? 2 : 1);
  if (count > MAX_VARIANTS_PER_FAMILY) {
    throw new FamilyAuthoringError('too_many_variants', {
      familyId: family.id,
      count,
      max: MAX_VARIANTS_PER_FAMILY,
      message: `Family "${family.id}" compiles to ${count} variants (max ${MAX_VARIANTS_PER_FAMILY}).`
    });
  }

  const canonical = combos.map((combo) => {
    const picks = combo.map(({ optIndex, posIndex }) => ({ opt: optionals[optIndex], pos: optionals[optIndex].positions[posIndex] }));
    const variantId = familyVariantId(family.id, canonicalDir?.id, picks.map(({ opt, pos }) => ({ optionalId: opt.id, positionId: pos.id })));

    const keys = orderedStopKeys(family, picks, variantId);
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
        excursions: (def.excursions ?? []).map((ex) => ({ ...ex })),
        ...(def.excursionMenu?.length > 0 ? { excursionMenu: def.excursionMenu.map((m) => ({ ...m })) } : {})
      };
    });
    for (const s of stops) {
      // A position override can take a stop's maxNights to 0 in one variant only.
      if (s.excursionMenu && s.maxNights === 0) {
        throw new FamilyAuthoringError('excursion_menu_on_pass_through', { familyId: family.id, variantId, stopKey: s.id });
      }
      if (!(Number.isInteger(s.minNights) && Number.isInteger(s.maxNights) && s.minNights >= 0 && s.minNights <= s.maxNights)) {
        throw new FamilyAuthoringError('invalid_night_limits', { familyId: family.id, variantId, stopKey: s.id, minNights: s.minNights, maxNights: s.maxNights });
      }
    }

    const assumptions = [
      ...(family.assumptions ?? []),
      ...picks.flatMap(({ opt, pos }) => [...(opt.assumptions ?? []), ...(pos.assumptions ?? [])])
    ];
    const pkg = routePackage({
      id: variantId,
      name: variantName(family, canonicalDir, picks),
      countryId: family.countryId,
      ...(family.assumptions !== undefined || assumptions.length > 0 ? { assumptions } : {}),
      ...(family.preferredGatewayId ? { preferredGatewayId: family.preferredGatewayId } : {}),
      stops
    });
    return {
      picks,
      pkg: {
        ...pkg,
        familyId: family.id,
        variantId,
        ...(canonicalDir ? { directionId: canonicalDir.id } : {}),
        optionals: picks.map(({ opt, pos }) => ({ optionalId: opt.id, positionId: pos.id, stopKeys: [...pos.insert] })),
        aliases: [...(family.aliases?.[variantId] ?? [])],
        held: picks.some(({ pos }) => pos.status === 'pending_review') || canonicalDir?.status === 'pending_review'
      }
    };
  });

  // Catalogue order: every canonical variant, then every mirrored one. route.js
  // breaks ranking ties by this order, so the canonical direction is the default.
  const packages = [...canonical.map((c) => c.pkg), ...(mirrorDir ? canonical.map((c) => mirrorVariant(family, mirrorDir, c)) : [])];

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
      checkMenus(pkg, routeResult, spec, soloData, fail);
    } catch (err) {
      if (err instanceof FamilyAuthoringError) throw err;
      if (err instanceof PackageAuthoringError) fail(`package_authoring:${err.reason}`, { packageDetail: err.detail });
      fail('engine_error', { message: err.message });
    }
    const maxDays = minDays + pkg.stops.reduce((sum, s) => sum + (s.maxNights - s.minNights), 0);
    return { variantId: pkg.id, held: pkg.held === true, minDays, maxDays };
  });
}

/**
 * Every menu item, held ones included, must name a known place and a connection
 * that serves base <-> place both ways, and must be able to be selected: fixed
 * excursions plus that one item have to fit at the stop's maxNights (more nights
 * never un-fit an excursion, so if it does not fit there it never can).
 */
function checkMenus(pkg, routeResult, spec, data, fail) {
  pkg.stops.forEach((stop, i) => {
    for (const menuItem of stop.excursionMenu ?? []) {
      const where = { stopKey: stop.id, excursionId: menuItem.id };
      if (!getPlace(data.places, menuItem.placeId)) fail('excursion_unknown_place', { ...where, placeId: menuItem.placeId });
      const row = data.connections.find((c) => c.id === menuItem.connectionId);
      if (!row) fail('excursion_unknown_connection', { ...where, connectionId: menuItem.connectionId });
      if (!orientConnection(row, stop.placeId, menuItem.placeId) || !orientConnection(row, menuItem.placeId, stop.placeId)) {
        fail('excursion_connection_mismatch', { ...where, connectionId: row.id });
      }
      const probe = {
        ...routeResult,
        stops: routeResult.stops.map((s, j) =>
          j === i
            ? { ...s, nights: s.maxNights, minNights: s.maxNights, excursions: [...s.excursions, { placeId: menuItem.placeId, connectionId: menuItem.connectionId, hoursOnSite: menuItem.hoursOnSite }] }
            : s
        )
      };
      try {
        scheduleRoute(probe, { ...spec, totalDays: 1 }, data);
      } catch (err) {
        if (err instanceof PackageAuthoringError && err.reason === 'excursion_does_not_fit') {
          fail('excursion_never_fits', { ...where, maxNights: stop.maxNights });
        }
        throw err;
      }
    }
  });
}
