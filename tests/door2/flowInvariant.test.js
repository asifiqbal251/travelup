// B13: held-variant invariant (ADR-002 §6). No pilot position is currently
// pending_review (both Huaraz positions are approved, verified 28 Sep), so —
// per the brief — this builds a minimal held scenario the same way
// families.test.js's RF1 does (clone the pilot families, mark one Huaraz
// position pending_review) and attempts every caller path against it.
//
// This is deliberately a lower-level, engine-only test (per the brief): it
// calls buildFilledTrip / previewX / listMoveOptions / selectRoutes
// directly rather than through the Door2Plan UI, because its purpose is to
// prove no *code path* can return a held variant, independent of whether the
// UI happens to expose a way to reach it today.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileFamilies } from '../../src/lib/door2/families.js';
import { PILOT_ROUTE_FAMILIES, PILOT_PLACES } from '../../src/lib/door2/pilotData.js';
import { PILOT_DATA, buildFilledTrip } from '../../src/lib/door2/planner.js';
import { selectRoutes } from '../../src/lib/door2/route.js';
import {
  previewAddOptional,
  previewMoveOptional,
  previewRemoveOptional,
  previewAdjustNights,
  previewChangeLength,
  listMoveOptions,
} from '../../src/lib/door2/restructure.js';

const HELD_POSITION = 'after_machu_picchu';
const HELD_VARIANT = 'peru_classic+huaraz@after_machu_picchu';

function heldFamilies() {
  const fams = structuredClone(PILOT_ROUTE_FAMILIES);
  fams.find((f) => f.id === 'peru_classic').optional[0].positions.find((p) => p.id === HELD_POSITION).status = 'pending_review';
  return fams;
}

function heldData() {
  return { ...PILOT_DATA, routePackages: compileFamilies(heldFamilies()) }; // approved-only, like PILOT_ROUTE_PACKAGES
}
function heldDataAll() {
  return { ...PILOT_DATA, routePackages: compileFamilies(heldFamilies(), { includePending: true }) };
}

const spec = (overrides = {}) => ({
  originPlaceId: 'vancouver',
  destination: { kind: 'country', id: 'PE' },
  travelMonth: 10,
  totalDays: 10,
  travellerType: 'couple',
  interests: [],
  pace: 'balanced',
  budget: 'mid',
  routeTemplateId: null,
  stops: [],
  requiredPlaceIds: [],
  choices: { pinned: [], rejected: [], placed: [] },
  ...overrides,
});

function tripWithHuarazAt(positionId, data = heldDataAll()) {
  return buildFilledTrip(spec({ totalDays: 16, routeTemplateId: `peru_classic+huaraz@${positionId}` }), data, { reviewPolicy: 'allow_drafts' });
}

test('B13a: buildFilledTrip never serves the held variant, even requested explicitly, once positions are pending', () => {
  // Default caller data (approved-only, like PILOT_DATA in production) doesn't have the held package
  // compiled in at all, so an explicit request for it falls back to ranking among what IS available
  // (route.js selectRoutes: an unmatched routeTemplateId just doesn't get bubbled to the front) rather
  // than erroring — the invariant to check is the *result*, not that this particular call refuses.
  const trip = buildFilledTrip(spec({ totalDays: 16, routeTemplateId: HELD_VARIANT }), heldData(), { reviewPolicy: 'allow_drafts' });
  assert.notEqual(trip.ok, false, 'a valid fallback route is built');
  assert.notEqual(trip.routePlan.variantId, HELD_VARIANT, 'never the held variant');

  // NOTE (reported as a finding, not fixed here — out of scope for this session):
  // this guard lives entirely in the DATA passed in (PILOT_DATA / PILOT_ROUTE_PACKAGES
  // is pre-filtered to approved-only), not independently inside selectRoutes/
  // buildFilledTrip. Confirmed: with `data.routePackages` built via
  // `compileFamilies(fams, { includePending: true })` — i.e. a caller that, unlike
  // every real Door2Plan.jsx call site, hands the held package in — an EXPLICIT
  // `routeTemplateId` request for it *is* honoured (route.js's "bubble the
  // requested template to the front" has no `.held` check). No production caller
  // does this today (Door2Plan.jsx only ever imports PILOT_DATA), so the invariant
  // holds in practice, but it is not defense-in-depth at this layer.
});

test('B13b: selectRoutes (route alternatives) never lists the held variant', () => {
  const result = selectRoutes(spec({ totalDays: 16 }), heldData(), { reviewPolicy: 'allow_drafts' });
  assert.equal(result.ok, true);
  assert.equal(result.value.some((r) => r.routePackageId === HELD_VARIANT), false, 'held variant absent from route alternatives');
});

test('B13c: previewAddOptional refuses a direct request for the held position', () => {
  // Trip on the plain backbone (no Huaraz yet), using data where the held package still compiles (includePending) so
  // findRoutePackage can resolve it internally — proving the refusal is a real status check, not just a missing package.
  const trip = buildFilledTrip(spec({ totalDays: 16 }), heldDataAll(), { reviewPolicy: 'allow_drafts' });
  assert.notEqual(trip.ok, false);
  const result = previewAddOptional(trip, 'huaraz', HELD_POSITION, { data: heldDataAll(), families: heldFamilies() });
  assert.equal(result.ok, false, 'adding at the pending_review position is refused');
  assert.equal(result.why, 'not_available');
});

test('B13d: previewMoveOptional refuses moving to the held position; listMoveOptions never lists it', () => {
  const trip = tripWithHuarazAt('after_lima_in');
  const move = previewMoveOptional(trip, 'huaraz', HELD_POSITION, { data: heldDataAll(), families: heldFamilies() });
  assert.equal(move.ok, false, 'move to the pending_review position is refused');
  assert.equal(move.why, 'order_fixed');

  const { options } = listMoveOptions(trip, 'huaraz', { data: heldDataAll(), families: heldFamilies() });
  assert.equal(options.some((o) => o.positionId === HELD_POSITION), false, 'the held position is never offered as a move target');
});

test('B13e: previewRemoveOptional and previewAdjustNights/previewChangeLength cannot resolve to the held variant', () => {
  // previewRemoveOptional's own defensive `pkg.held` check (restructure.js ~line 430) guards the backbone
  // fallback path; with only one optional in this family, removing Huaraz always resolves to the plain
  // (non-held) backbone, so there is no data shape in the pilot family that exercises that branch as
  // "true" — noted here rather than faked. The two checks that DO matter are covered:
  const trip = buildFilledTrip(spec({ totalDays: 12, routeTemplateId: 'peru_classic+huaraz@after_lima_in' }), heldDataAll(), { reviewPolicy: 'allow_drafts' });
  const removed = previewRemoveOptional(trip, 'huaraz', { data: heldDataAll(), families: heldFamilies() });
  assert.equal(removed.ok, true, 'removing back to the plain backbone still works');
  assert.notEqual(removed.proposals[0].routePlan.variantId, HELD_VARIANT, 'never the held variant');

  // previewAdjustNights/previewChangeLength never pick a *different* routePackage — they redistribute
  // nights within the trip's current one — so a held variant is structurally unreachable through them.
  // (buildTripFromRoutePlan, which they call, works on the resolved routePlan object directly, not by
  // re-selecting a package from a family, so the held/approved status check doesn't apply to this path.)
  const nightsResult = previewAdjustNights(trip, trip.routePlan.stops.find((s) => s.placeId === 'cusco').key, 1, { data: heldDataAll(), families: heldFamilies() });
  assert.equal(nightsResult.ok, true);
  assert.equal(nightsResult.proposals[0].routePlan.variantId, trip.routePlan.variantId, 'previewAdjustNights keeps the same (already-approved) variant');

  const lengthResult = previewChangeLength(trip, trip.spec.totalDays + 1, { data: heldDataAll(), families: heldFamilies() });
  if (lengthResult.ok) {
    assert.notEqual(lengthResult.proposals[0].routePlan.variantId, HELD_VARIANT, 'previewChangeLength never lands on the held variant');
  }
});
