/** @typedef {import('./types.js').RoutePlan} RoutePlan */
/** @typedef {import('./types.js').RoutePackage} RoutePackage */

// RoutePlan (design §2.1 + v2 fields): which places, in what order, for how
// many nights. One builder, shared by the planner (fresh builds) and the draft
// upgrader (v5 → v6), so the two can never disagree.
//
// Pure: no randomness, no Date.now().

/** Drops undefined values so the plan survives a JSON round-trip unchanged. */
function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/**
 * @param {Object} args
 * @param {RoutePackage} args.pkg      The compiled variant (or a hand-written package).
 * @param {Array<{key: string, placeId: string, nights: number, minNights: number, maxNights: number, isRequired: boolean, excursions: Object[]}>} args.stops
 * @param {string[]} args.connectionIds
 * @param {number} args.minDays
 * @param {'authored'|'composed'} [args.source]
 * @param {'auto'|'user'} [args.nightsSource]
 * @param {RoutePlan} [args.prior]    A previous plan whose selectionSource values are kept for stops/optionals still present.
 * @returns {RoutePlan}
 */
export function makeRoutePlan({ pkg, stops, connectionIds, minDays, source = 'authored', nightsSource = 'auto', prior }) {
  const optionalOfStop = new Map();
  for (const o of pkg.optionals ?? []) for (const key of o.stopKeys ?? []) optionalOfStop.set(key, o.optionalId);
  const priorStop = new Map((prior?.stops ?? []).map((s) => [s.key, s]));
  const priorOptional = new Map((prior?.optionals ?? []).map((o) => [o.optionalId, o]));

  const planStops = stops.map((s) => {
    const optionalId = optionalOfStop.get(s.key);
    const role = s.maxNights === 0 ? 'pass_through' : optionalId ? 'optional' : 'core';
    const fresh = s.isRequired ? 'required' : 'default';
    // A stop required at intake stays 'required'; otherwise a prior choice (e.g. 'user_added') is kept.
    const selectionSource = fresh === 'required' ? 'required' : priorStop.get(s.key)?.selectionSource ?? fresh;
    return compact({
      key: s.key,
      placeId: s.placeId,
      nights: s.nights,
      minNights: s.minNights,
      maxNights: s.maxNights,
      role,
      optionalId,
      selectionSource,
      isRequired: s.isRequired,
      excursions: (s.excursions ?? []).map((ex) => ({ ...ex }))
    });
  });

  const optionals = (pkg.optionals ?? []).map((o) => {
    const required = planStops.some((s) => s.optionalId === o.optionalId && s.selectionSource === 'required');
    const selectionSource = required ? 'required' : priorOptional.get(o.optionalId)?.selectionSource ?? 'default';
    return { optionalId: o.optionalId, positionId: o.positionId, selectionSource };
  });

  const maxDays = minDays + stops.reduce((sum, s) => sum + (s.maxNights - s.minNights), 0);
  return {
    familyId: pkg.familyId ?? pkg.id,
    variantId: pkg.variantId ?? pkg.id,
    source,
    stops: planStops,
    nightsSource,
    connectionIds: [...connectionIds],
    minDays,
    maxDays,
    optionals
  };
}
