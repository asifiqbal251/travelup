import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { FamilyAuthoringError, checkVariantsSchedulable, compileFamilies } from '../../src/lib/door2/families.js';
import { tripFingerprint } from '../../src/lib/door2/fingerprint.js';
import { PILOT_DATA, buildFilledTrip, resolveExcursions } from '../../src/lib/door2/planner.js';
import * as R from '../../src/lib/door2/restructure.js';
import { swapActivity, undo } from '../../src/lib/door2/edit.js';
import { buildRouteResult } from '../../src/lib/door2/route.js';
import { PackageAuthoringError, scheduleRoute } from '../../src/lib/door2/schedule.js';
import { validateExcursionSelections } from '../../src/lib/door2/validate.js';
import { hubFamily, lineFamily, soloFamily, synBundle, synFamilies, synSpec } from './helpers/syntheticHub.js';

// E3a: traveller-selectable same-day excursions, engine only. Everything runs on
// the synthetic bundle (tests/door2/helpers/syntheticHub.js, its header explains
// the hand-checked hours); only A17/A18 look at the pilot data, to pin Peru.

const B = synBundle(compileFamilies);
const OPTS = B.options;

const HUB = 'syn_hub';
const SPUR = 'syn_hub+spur@after_base';
const SOLO = 'syn_solo';
const FWD = 'syn_line#fwd';
const REV = 'syn_line#rev';

function build(variantId, totalDays, bundle = B, extra = {}) {
  const trip = buildFilledTrip(synSpec(totalDays, { routeTemplateId: variantId, ...extra }), bundle.data, { content: bundle.content });
  assert.ok(trip.routePlan, `built ${variantId}/${totalDays}: ${JSON.stringify(trip.detail ?? trip.state)}`);
  return trip;
}

function apply(trip, proposal) {
  const applied = R.applyProposal(trip, proposal);
  assert.equal(applied.ok, true, JSON.stringify(applied));
  return applied.trip;
}

/** Add an excursion through the public preview/apply path, asserting it succeeds. */
function add(trip, stopKey, excursionId, options = OPTS) {
  const r = R.previewAddExcursion(trip, stopKey, excursionId, options);
  assert.equal(r.ok, true, `add ${excursionId}: ${JSON.stringify(r)}`);
  return apply(trip, r.proposals[0]);
}

function remove(trip, stopKey, excursionId, options = OPTS) {
  const r = R.previewRemoveExcursion(trip, stopKey, excursionId, options);
  assert.equal(r.ok, true, `remove ${excursionId}: ${JSON.stringify(r)}`);
  return apply(trip, r.proposals[0]);
}

const stripHistory = (trip) => ({ ...trip, history: [] });
const clone = (x) => structuredClone(x);
const selections = (trip) =>
  Object.fromEntries(trip.routePlan.stops.filter((s) => s.selectedExcursionIds).map((s) => [s.key, s.selectedExcursionIds]));
const nightsOf = (trip) => Object.fromEntries(trip.routePlan.stops.map((s) => [s.key, s.nights]));
const blocks = (trip) => trip.days.flatMap((d) => d.blocks.map((b) => ({ ...b, dayNumber: d.dayNumber })));
const siteBlocks = (trip) => blocks(trip).filter((b) => /^ex:.*:site$/.test(b.id));
const siteIds = (trip) => siteBlocks(trip).map((b) => b.id);
const exBlockIds = (trip) => blocks(trip).filter((b) => b.id.startsWith('ex:')).map((b) => b.id);
const planStop = (trip, key) => trip.routePlan.stops.find((s) => s.key === key);

// ---------------------------------------------------------------------------

test('A1: adding one excursion puts three ex: blocks on the earliest day it fits and changes neither nights nor length', () => {
  const trip = build(HUB, 4);
  assert.equal(siteBlocks(trip).length, 0, 'a fresh trip has no excursion blocks');
  assert.equal(planStop(trip, 'lx_base').selectedExcursionIds, undefined, 'nothing is preselected');

  const r = R.previewAddExcursion(trip, 'lx_base', 'sintra', OPTS);
  assert.equal(r.ok, true);
  assert.equal(r.proposals.length, 1);
  const p = r.proposals[0];
  assert.equal(p.id, 'excursion:add:lx_base:sintra');
  assert.equal(p.kind, 'add_excursion');
  assert.equal(p.label, 'Add a day trip to Sintra');
  assert.equal(p.baseFingerprint, tripFingerprint(trip));
  assert.deepEqual(p.trip.history, []);
  assert.deepEqual(p.diff.excursionsAdded, [{ stopKey: 'lx_base', excursionId: 'sintra', placeId: 'syn_sintra' }]);
  assert.equal(p.diff.excursionsRemoved, undefined, 'omitted when empty');
  assert.deepEqual(p.diff.nights, []);
  assert.deepEqual(p.diff.totalDays, { from: 4, to: 4 });
  assert.deepEqual([p.diff.placesAdded, p.diff.placesRemoved, p.diff.newTravelDay], [[], [], false]);

  assert.deepEqual(nightsOf(p.trip), nightsOf(trip));
  assert.equal(p.trip.spec.totalDays, 4);
  assert.deepEqual(selections(p.trip), { lx_base: ['sintra'] });
  assert.deepEqual(p.routePlan, p.trip.routePlan);
  assert.deepEqual(planStop(p.trip, 'lx_base').excursions, [], 'plan excursions stay fixed-only');
  // Day 1 is the 21:30 arrival, so day 2 is the earliest day 9.5h fits.
  const ex = blocks(p.trip).filter((b) => b.id.startsWith('ex:lx_base:syn_sintra:'));
  assert.deepEqual(ex.map((b) => b.id), ['ex:lx_base:syn_sintra:out', 'ex:lx_base:syn_sintra:site', 'ex:lx_base:syn_sintra:back']);
  assert.deepEqual([...new Set(ex.map((b) => b.dayNumber))], [2]);
  validateExcursionSelections(p.trip, B.data);
  // The site block is filled from Sintra's own shelf.
  const site = ex.find((b) => b.id.endsWith(':site'));
  assert.equal(site.type, 'activity');
  assert.equal(site.placeId, 'syn_sintra');
});

test('A2: removing an excursion returns the day, keeps swapped content elsewhere, and undo is byte-identical', () => {
  const start = build(HUB, 4);
  const withEx = add(start, 'lx_base', 'sintra');
  // Swap an activity on day 3, away from the excursion.
  const day3 = withEx.days[2].blocks.find((b) => b.type === 'activity');
  const before = day3.activity.templateId;
  const swapped = swapActivity(withEx, day3.id, null, B.content);
  assert.equal(swapped.ok, true);
  const after = blocks(swapped.trip).find((b) => b.id === day3.id).activity.templateId;
  assert.notEqual(after, before, 'the swap changed the activity');

  const r = R.previewRemoveExcursion(swapped.trip, 'lx_base', 'sintra', OPTS);
  assert.equal(r.ok, true);
  const p = r.proposals[0];
  assert.deepEqual(p.diff.excursionsRemoved, [{ stopKey: 'lx_base', excursionId: 'sintra', placeId: 'syn_sintra', reason: 'traveller_removed' }]);
  assert.equal(p.diff.excursionsAdded, undefined);
  assert.deepEqual(exBlockIds(p.trip), [], 'excursion blocks gone');
  assert.equal(planStop(p.trip, 'lx_base').selectedExcursionIds, undefined, 'the key is omitted again, not []');
  assert.deepEqual(nightsOf(p.trip), nightsOf(withEx));
  assert.equal(p.trip.spec.totalDays, 4);
  // Day 2 is open again and filled.
  const day2Open = p.trip.days[1].blocks.filter((b) => b.anchor?.stopId === 'lx_base');
  assert.ok(day2Open.length > 0 && day2Open.every((b) => b.type === 'activity'), 'the freed day is filled');
  assert.equal(p.trip.contentGaps.length, 0);
  assert.equal(blocks(p.trip).find((b) => b.id === day3.id).activity.templateId, after, 'unrelated swapped content survives');

  // Undo returns exactly what was there before applying.
  const applied = apply(swapped.trip, p);
  const undone = undo(applied);
  assert.equal(undone.ok, true);
  assert.deepEqual(undone.trip, swapped.trip);
});

test('A3: click order never matters: menu order is stored, and both orders give byte-identical trips', () => {
  const start = build(HUB, 5);
  const ab = add(add(start, 'lx_base', 'sintra'), 'lx_base', 'cascais');
  const ba = add(add(start, 'lx_base', 'cascais'), 'lx_base', 'sintra');
  assert.deepEqual(planStop(ab, 'lx_base').selectedExcursionIds, ['sintra', 'cascais']);
  assert.deepEqual(stripHistory(ba), stripHistory(ab));
  assert.equal(tripFingerprint(ba), tripFingerprint(ab));

  const spur = build(SPUR, 9);
  const lxThenPt = add(add(spur, 'lx_base', 'sintra'), 'pt_base', 'douro');
  const ptThenLx = add(add(spur, 'pt_base', 'douro'), 'lx_base', 'sintra');
  assert.deepEqual(selections(lxThenPt), { lx_base: ['sintra'], pt_base: ['douro'] });
  assert.deepEqual(stripHistory(ptThenLx), stripHistory(lxThenPt));
});

test('A4: a second excursion that does not fit refuses, names both places, and offers "add a night"', () => {
  const two = build(HUB, 3); // lx_base: 2 nights: one 9.5h excursion fits (day 2), two do not
  const one = add(two, 'lx_base', 'sintra');
  const frozen = clone(one);

  const r = R.previewAddExcursion(one, 'lx_base', 'cascais', OPTS);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'change_not_feasible');
  assert.equal(r.why, 'excursion_does_not_fit');
  assert.match(r.message, /Sintra and Cascais/);
  assert.match(r.message, /Add a night in Lisbon and include Cascais/);
  assert.deepEqual(r.detail, { stopKey: 'lx_base', excursionIds: ['sintra', 'cascais'], nightsNeeded: 3 });
  assert.equal(r.alternatives.length, 1);
  const alt = r.alternatives[0];
  assert.equal(alt.id, 'excursion:add:lx_base:cascais:extend');
  assert.equal(alt.kind, 'extend');
  assert.equal(alt.label, 'Add a night in Lisbon and include Cascais');
  assert.deepEqual(alt.diff.nights, [{ stopKey: 'lx_base', placeId: 'syn_lisbon', from: 2, to: 3 }]);
  assert.deepEqual(alt.diff.totalDays, { from: 3, to: 4 });
  assert.deepEqual(selections(alt.trip), { lx_base: ['sintra', 'cascais'] });
  assert.deepEqual(nightsOf(alt.trip), { lx_base: 3 });
  validateExcursionSelections(alt.trip, B.data);
  assert.deepEqual(one, frozen, 'the trip is unchanged');
  // The alternative applies like any proposal.
  const applied = apply(one, alt);
  assert.equal(applied.spec.totalDays, 4);

  // Fixed dates: no alternative, and the message says why.
  const fixed = build(HUB, 3, B, { startDate: '2026-07-01', endDate: '2026-07-03' });
  const fixedOne = add(fixed, 'lx_base', 'sintra');
  const fr = R.previewAddExcursion(fixedOne, 'lx_base', 'cascais', OPTS);
  assert.deepEqual([fr.ok, fr.why, fr.alternatives], [false, 'excursion_does_not_fit', []]);
  assert.match(fr.message, /dates are fixed/);
  assert.equal(fr.detail.nightsNeeded, 3);

  // Beyond what the stop can ever hold: castle + douro + wine fill days 2-4 of a 4-night stop, so ports has no day.
  let spur = build(SPUR, 11);
  spur = add(add(spur, 'pt_base', 'douro'), 'pt_base', 'wine');
  const beyond = R.previewAddExcursion(spur, 'pt_base', 'ports', OPTS);
  assert.deepEqual([beyond.ok, beyond.why, beyond.alternatives], [false, 'excursion_does_not_fit', []]);
  assert.match(beyond.message, /needs a full day and this trip doesn't have one to give/);
  assert.match(beyond.message, /the Douro, the Wine Cellars and the Port Lodges/);
});

test('A5: a selection raises the stop\'s effective minimum; adjusting, donating and removing all respect it', () => {
  const spur = build(SPUR, 6); // lx_base 2, pt_base 2, lx_hub 1: pt_base is at its authored minimum
  assert.equal(planStop(spur, 'pt_base').minNights, 2);
  const r = R.previewAddExcursion(spur, 'pt_base', 'douro', OPTS);
  assert.equal(r.ok, false, 'castle takes day 2, so douro needs a third night');
  assert.equal(r.detail.nightsNeeded, 3);
  const withDouro = apply(spur, r.alternatives[0]);

  const pt = planStop(withDouro, 'pt_base');
  assert.equal(pt.nights, 3);
  assert.equal(pt.minNights, 3, 'plan minNights is the effective minimum');
  assert.equal(withDouro.routePlan.minDays, 7, 'plan minDays follows');
  assert.equal(withDouro.spec.totalDays, 7);

  // -1 at the effective minimum refuses, naming the excursion, and is not a "no donor" story.
  const down = R.previewAdjustNights(withDouro, 'pt_base', -1, OPTS);
  assert.equal(down.ok, false);
  assert.equal(down.why, 'excursion_does_not_fit');
  assert.equal(down.message, 'Porto needs 3 nights to keep your day trip to the Douro.');
  assert.deepEqual(down.alternatives, []);
  assert.deepEqual(down.detail, { stopKey: 'pt_base', excursionIds: ['douro'], nightsNeeded: 3 });
  // The authored-minimum case keeps its exact text.
  const authored = R.previewAdjustNights(withDouro, 'lx_base', -1, OPTS);
  assert.equal(authored.why, 'allocation_minimum');
  assert.equal(authored.message, 'Lisbon needs at least 2 nights.');

  // pt_base is never a donor below its effective minimum, in any preview.
  const flexible = [R.previewAdjustNights(withDouro, 'lx_base', +1, OPTS), R.previewAdjustNights(withDouro, 'lx_hub', +1, OPTS)];
  for (const res of flexible) for (const p of res.proposals ?? res.alternatives ?? []) assert.ok(nightsOf(p.trip).pt_base >= 3, p.id);
  assert.equal(R.previewChangeLength(withDouro, 6, OPTS).ok, false);

  // Removing the excursion lowers both.
  const back = remove(withDouro, 'pt_base', 'douro');
  assert.equal(planStop(back, 'pt_base').minNights, 2);
  assert.equal(back.routePlan.minDays, 6);
  assert.equal(planStop(back, 'pt_base').nights, 3, 'nights are the traveller\'s: unchanged');
  assert.equal(R.previewAdjustNights(back, 'pt_base', -1, OPTS).ok, true, 'and the night can now be taken away');
});

test('A5b: the effective minimum is the smallest night count that fits, and more nights never un-fit', () => {
  const pkg = B.data.allRoutePackages.find((p) => p.id === HUB);
  const spec = synSpec(1, { routeTemplateId: HUB });
  const subsets = [['sintra'], ['cascais'], ['sintra', 'cascais']];
  const expected = [2, 2, 3];
  subsets.forEach((ids, i) => {
    const r = resolveExcursions(pkg, { lx_base: ids }, spec, B.data);
    assert.equal(r.ok, true);
    assert.equal(r.effectiveMinNights.lx_base, expected[i], ids.join('+'));
    // Brute force: schedule the same excursions at each night count.
    const fits = [];
    for (let n = 2; n <= 5; n++) {
      const derived = { ...r.pkg, stops: r.pkg.stops.map((s) => ({ ...s, minNights: n })) };
      const built = buildRouteResult(derived, spec, B.data);
      try {
        scheduleRoute(built.routeResult, spec, B.data);
        fits.push(true);
      } catch (err) {
        assert.ok(err instanceof PackageAuthoringError && err.reason === 'excursion_does_not_fit');
        fits.push(false);
      }
    }
    const smallest = 2 + fits.indexOf(true);
    assert.equal(smallest, r.effectiveMinNights.lx_base, 'brute-force smallest');
    assert.ok(fits.slice(fits.indexOf(true)).every(Boolean), 'monotone: once it fits, more nights still fit');
  });
});

test('A6 (J7): every nights ±1 proposal and alternative, at every stop, keeps every selection', () => {
  let trip = build(SPUR, 9);
  trip = add(trip, 'lx_base', 'sintra');
  trip = add(trip, 'pt_base', 'douro');
  const before = selections(trip);
  assert.deepEqual(before, { lx_base: ['sintra'], pt_base: ['douro'] });
  const sites = siteIds(trip);
  assert.equal(sites.length, 3, 'sintra, the fixed castle and douro');

  let checked = 0;
  for (const stop of trip.routePlan.stops) {
    for (const delta of [1, -1]) {
      const r = R.previewAdjustNights(trip, stop.key, delta, OPTS);
      const proposals = r.ok ? r.proposals : r.alternatives;
      for (const p of proposals) {
        assert.deepEqual(selections(p.trip), before, `${p.id}: selections on the trip`);
        assert.deepEqual(selections({ routePlan: p.routePlan }), before, `${p.id}: selections on the proposal plan`);
        assert.deepEqual(siteIds(p.trip), sites, `${p.id}: excursion blocks`);
        assert.equal(p.diff.excursionsRemoved, undefined, `${p.id}: nothing lost`);
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 4, `expected several proposals to check, got ${checked}`);
});

test('A7: changing the trip length keeps selections, and refuses below the effective minimum by naming the excursion', () => {
  let trip = build(SPUR, 9);
  trip = add(trip, 'lx_base', 'sintra');
  trip = add(trip, 'pt_base', 'douro');
  const before = selections(trip);
  const minDays = trip.routePlan.minDays;

  for (const days of [trip.spec.totalDays + 1, trip.spec.totalDays - 1]) {
    const r = R.previewChangeLength(trip, days, OPTS);
    assert.equal(r.ok, true, `${days} days`);
    assert.deepEqual(selections(r.proposals[0].trip), before, `${days} days`);
  }

  const tooShort = R.previewChangeLength(trip, minDays - 1, OPTS);
  assert.equal(tooShort.ok, false);
  assert.equal(tooShort.why, 'insufficient_days', 'the reason code is unchanged');
  assert.match(tooShort.message, /to keep your day trip to/, 'but the message names the cause');
  assert.match(tooShort.message, /the Douro/);

  // "Switch to the shorter route" keeps the kept stops' selections and reports the removed stop's.
  const shorter = tooShort.alternatives.find((a) => a.kind === 'switch_route');
  assert.ok(shorter, 'the backbone alternative is offered');
  assert.deepEqual(selections(shorter.trip), { lx_base: ['sintra'] });
  assert.deepEqual(shorter.diff.excursionsRemoved, [{ stopKey: 'pt_base', excursionId: 'douro', placeId: 'syn_douro', reason: 'stop_removed' }]);
  validateExcursionSelections(shorter.trip, B.data);
});

test('A7b: adding an optional stop that pushes a kept stop\'s excursion to the next day raises that stop\'s minimum, out loud', () => {
  // Alone at Birch (1 night) the excursion fits the arrival day. Coming from Dogwood it does not, so the
  // trip with Dogwood needs 2 nights at Birch: a change the traveller must be told about, never a dropped selection.
  const minDays = 4;
  let line = build(FWD, minDays);
  assert.equal(planStop(line, 'ln_b').minNights, 1);
  line = add(line, 'ln_b', 'falls');
  assert.equal(planStop(line, 'ln_b').minNights, 1, 'no raise on the direct route');
  assert.equal(line.routePlan.minDays, minDays);

  const r = R.previewAddOptional(line, 'mid', 'ab', OPTS);
  assert.equal(r.ok, false, 'no room at this length');
  assert.equal(r.why, 'insufficient_days');
  assert.match(r.message, new RegExp(`needs ${minDays + 2} days in total`), 'one day for Dogwood, one more for Birch');
  assert.equal(r.alternatives.length, 1);
  const alt = r.alternatives[0];
  assert.equal(alt.label, 'Add 2 days and include Dogwood');
  assert.equal(planStop(alt.trip, 'ln_b').nights, 2);
  assert.equal(planStop(alt.trip, 'ln_b').minNights, 2, 'the plan records the raised minimum');
  assert.deepEqual(selections(alt.trip), { ln_b: ['falls'] });
  assert.equal(alt.diff.excursionsRemoved, undefined);
  validateExcursionSelections(alt.trip, B.data);

  // With room, the same add is a plain proposal that keeps the selection.
  const roomy = R.previewAddOptional(add(build(FWD, minDays + 2), 'ln_b', 'falls'), 'mid', 'ab', OPTS);
  assert.equal(roomy.ok, true);
  assert.deepEqual(selections(roomy.proposals[0].trip), { ln_b: ['falls'] });
  assert.equal(planStop(roomy.proposals[0].trip, 'ln_b').minNights, 2);

  // Moving Dogwood after Birch (arriving at Birch from Alder again) lowers the minimum back.
  const back = R.previewMoveOptional(apply(line, alt), 'mid', 'bc', OPTS);
  assert.equal(back.ok, true);
  assert.equal(planStop(back.proposals[0].trip, 'ln_b').minNights, 1);
  assert.deepEqual(selections(back.proposals[0].trip), { ln_b: ['falls'] });
});

test('A8: add, move and remove the optional stop with excursions selected: kept when kept, reported when removed', () => {
  // Move / add on the line family: the selection at Birch survives every rebuild, the one at Dogwood follows its stop.
  let line = build(FWD, 8);
  line = add(line, 'ln_b', 'falls');
  const added = R.previewAddOptional(line, 'mid', 'ab', OPTS);
  assert.equal(added.ok, true);
  assert.deepEqual(selections(added.proposals[0].trip), { ln_b: ['falls'] });
  let withMid = apply(line, added.proposals[0]);
  withMid = add(withMid, 'ln_d', 'ridge');
  assert.deepEqual(selections(withMid), { ln_b: ['falls'], ln_d: ['ridge'] });
  const moved = R.previewMoveOptional(withMid, 'mid', 'bc', OPTS);
  assert.equal(moved.ok, true);
  assert.deepEqual(selections(moved.proposals[0].trip), { ln_b: ['falls'], ln_d: ['ridge'] });
  assert.equal(moved.proposals[0].diff.excursionsRemoved, undefined);
  const listed = R.listMoveOptions(withMid, 'mid', OPTS);
  assert.deepEqual(selections(listed.options[0].proposal.trip), { ln_b: ['falls'], ln_d: ['ridge'] });

  // Remove the optional stop that holds a selection: the loss is the traveller's, and it is reported.
  const removed = R.previewRemoveOptional(withMid, 'mid', OPTS);
  assert.equal(removed.ok, true);
  assert.deepEqual(selections(removed.proposals[0].trip), { ln_b: ['falls'] });
  assert.deepEqual(removed.proposals[0].diff.excursionsRemoved, [{ stopKey: 'ln_d', excursionId: 'ridge', placeId: 'syn_ldx', reason: 'stop_removed' }]);

  // Same on the hub: removing the spur whose base holds a selection. The hub tops out at 6 days, so at
  // 8 days the route can't absorb the freed nights and the answer is the "shorten the trip" alternative:
  // it still keeps Lisbon's selection and still reports the removed stop's, out loud.
  let hub = add(build(SPUR, 7), 'lx_base', 'sintra');
  const needNight = R.previewAddExcursion(hub, 'pt_base', 'douro', OPTS); // Porto has 2 nights and the castle takes day 2
  assert.equal(needNight.ok, false);
  hub = apply(hub, needNight.alternatives[0]); // 8 days, Porto at 3 nights
  const spurGone = R.previewRemoveOptional(hub, 'spur', OPTS);
  assert.equal(spurGone.ok, false);
  assert.equal(spurGone.alternatives.length, 1);
  const shrunk = spurGone.alternatives[0];
  assert.deepEqual(selections(shrunk.trip), { lx_base: ['sintra'] });
  assert.deepEqual(shrunk.diff.excursionsRemoved.map((x) => [x.stopKey, x.excursionId, x.reason]), [['pt_base', 'douro', 'stop_removed']]);
  validateExcursionSelections(shrunk.trip, B.data);
  // And adding the spur back later starts empty: nothing is remembered or re-selected.
  const backOn = R.previewAddOptional(apply(hub, shrunk), 'spur', undefined, OPTS);
  assert.equal(backOn.ok, true, JSON.stringify(backOn).slice(0, 300));
  assert.deepEqual(selections(backOn.proposals[0].trip), { lx_base: ['sintra'] });
});

test('A9: a reversed trip keeps its direction and selections, and the mirror\'s menu is its own copy', () => {
  let rev = build(REV, 8);
  assert.equal(rev.routePlan.directionId, 'rev');
  rev = add(rev, 'ln_b', 'falls');
  assert.equal(rev.routePlan.directionId, 'rev');
  const withMid = R.previewAddOptional(rev, 'mid', 'ab', OPTS);
  assert.equal(withMid.ok, true);
  const plan = withMid.proposals[0].routePlan;
  assert.equal(plan.variantId, 'syn_line#rev+mid@ab');
  assert.equal(plan.directionId, 'rev');
  assert.deepEqual(selections(withMid.proposals[0].trip), { ln_b: ['falls'] });
  const gone = remove(rev, 'ln_b', 'falls');
  assert.equal(gone.routePlan.directionId, 'rev');
  assert.deepEqual(selections(gone), {});

  const pkgs = compileFamilies([lineFamily()], { includePending: true });
  const canonical = pkgs.find((p) => p.id === FWD);
  const mirror = pkgs.find((p) => p.id === REV);
  const menu = (pkg) => pkg.stops.find((s) => s.id === 'ln_b').excursionMenu;
  assert.deepEqual(menu(mirror), menu(canonical));
  assert.notEqual(menu(mirror), menu(canonical), 'a copy, not the same array');
  assert.notEqual(menu(mirror)[0], menu(canonical)[0], 'and not the same item objects');
  menu(mirror)[0].hoursOnSite = 99;
  menu(mirror).push({ id: 'x' });
  assert.equal(menu(canonical)[0].hoursOnSite, 3);
  assert.equal(menu(canonical).length, 1);
});

test('A10: add, add, nights +1, remove: four undos each restore the prior state and its fingerprint', () => {
  const t0 = build(HUB, 5);
  const t1 = add(t0, 'lx_base', 'sintra');
  const t2 = add(t1, 'lx_base', 'cascais');
  const up = R.previewAdjustNights(t2, 'lx_base', +1, OPTS);
  assert.equal(up.ok, true);
  const t3 = apply(t2, up.proposals[0]);
  const t4 = remove(t3, 'lx_base', 'sintra');
  assert.deepEqual([t1, t2, t3, t4].map((t) => t.history.length), [1, 2, 3, 4]);

  let cur = t4;
  for (const prior of [t3, t2, t1, t0]) {
    const u = undo(cur);
    assert.equal(u.ok, true);
    assert.deepEqual(stripHistory(u.trip), stripHistory(prior));
    assert.equal(tripFingerprint(u.trip), tripFingerprint(prior));
    assert.deepEqual(u.trip.history, prior.history, 'the remaining stack is exactly the prior one');
    cur = u.trip;
  }
});

test('A11 / A12: a stale add or remove is refused and leaves the trip, selections included, untouched', () => {
  const trip = build(HUB, 5);
  const addPreview = R.previewAddExcursion(trip, 'lx_base', 'sintra', OPTS).proposals[0];
  const someActivity = trip.days[2].blocks.find((b) => b.type === 'activity');
  const swapped = swapActivity(trip, someActivity.id, null, B.content).trip;
  const frozen = clone(swapped);
  const staleAdd = R.applyProposal(swapped, addPreview);
  assert.deepEqual([staleAdd.ok, staleAdd.reason], [false, 'stale_preview']);
  assert.deepEqual(swapped, frozen, 'deep-equal to the post-swap trip');
  assert.deepEqual(selections(swapped), {});

  const withEx = add(trip, 'lx_base', 'sintra');
  const removePreview = R.previewRemoveExcursion(withEx, 'lx_base', 'sintra', OPTS).proposals[0];
  const act = withEx.days[2].blocks.find((b) => b.type === 'activity');
  const swapped2 = swapActivity(withEx, act.id, null, B.content).trip;
  const frozen2 = clone(swapped2);
  const staleRemove = R.applyProposal(swapped2, removePreview);
  assert.deepEqual([staleRemove.ok, staleRemove.reason], [false, 'stale_preview']);
  assert.deepEqual(swapped2, frozen2);
  assert.deepEqual(selections(swapped2), { lx_base: ['sintra'] }, 'the selection is still there');
});

test('A14: nothing is ever auto-selected, deselected or reordered, across every path, length and starting selection', () => {
  // Starting selections are built the only legitimate way (through previewAddExcursion), so a
  // subset that does not fit at a length simply is not a starting point there.
  const menus = {
    [HUB]: { lx_base: ['sintra', 'cascais'] },
    [SPUR]: { lx_base: ['sintra', 'cascais'], pt_base: ['douro', 'wine'] },
    [SOLO]: { solo_base: ['quick'] },
    [FWD]: { ln_b: ['falls'] },
    'syn_line#fwd+mid@ab': { ln_b: ['falls'], ln_d: ['ridge'] }
  };
  const flat = (sel) => Object.entries(sel).flatMap(([k, ids]) => ids.map((id) => `${k}:${id}`)).sort();
  let starts = 0;
  let previews = 0;

  for (const [variantId, menu] of Object.entries(menus)) {
    const pkg = B.data.allRoutePackages.find((p) => p.id === variantId);
    const range = checkVariantsSchedulable([pkg], B.data).find((r) => r.variantId === variantId);
    const entries = Object.entries(menu).flatMap(([k, ids]) => ids.map((id) => [k, id]));
    for (let days = range.minDays; days <= range.maxDays; days++) {
      const fresh = build(variantId, days);
      for (let mask = 0; mask < 1 << entries.length; mask++) {
        let trip = fresh;
        let ok = true;
        entries.forEach(([k, id], i) => {
          if (!ok || !(mask & (1 << i))) return;
          const r = R.previewAddExcursion(trip, k, id, OPTS);
          if (r.ok) trip = apply(trip, r.proposals[0]);
          else ok = false; // does not fit at this length: not a starting selection here
        });
        if (!ok) continue;
        starts += 1;
        const S = selections(trip);
        const fixedOnly = mask === 0;

        /** `expected` is the selection this result may hold, before subtracting the losses its diff lists. */
        const check = (label, result, expected = S) => {
          const list = result?.ok ? result.proposals : result?.alternatives ?? [];
          for (const p of list) {
            previews += 1;
            const lost = (p.diff.excursionsRemoved ?? []).map((x) => `${x.stopKey}:${x.excursionId}`);
            const want = flat(expected).filter((x) => !lost.includes(x));
            assert.deepEqual(flat(selections(p.trip)), want, `${variantId}/${days}/${mask} ${label} ${p.id}`);
            assert.deepEqual(flat(selections({ routePlan: p.routePlan })), want, `${variantId}/${days}/${mask} ${label} ${p.id} (plan)`);
            if (fixedOnly && !(p.diff.excursionsAdded ?? []).length) {
              assert.deepEqual(exBlockIds(p.trip).filter((id) => !/^ex:pt_base:syn_castle:/.test(id)), [], `${label} ${p.id}: no excursion blocks from nowhere`);
            }
          }
        };

        for (const stop of trip.routePlan.stops) {
          check(`adj ${stop.key}+1`, R.previewAdjustNights(trip, stop.key, +1, OPTS));
          check(`adj ${stop.key}-1`, R.previewAdjustNights(trip, stop.key, -1, OPTS));
        }
        for (const d of [days - 1, days + 1, trip.routePlan.minDays - 1]) {
          if (d >= 1) check(`len ${d}`, R.previewChangeLength(trip, d, OPTS));
        }
        const family = B.families.find((f) => f.id === trip.routePlan.familyId);
        for (const opt of family.optional ?? []) {
          for (const pos of opt.positions) {
            check(`add ${opt.id}@${pos.id}`, R.previewAddOptional(trip, opt.id, pos.id, OPTS));
            check(`move ${opt.id}@${pos.id}`, R.previewMoveOptional(trip, opt.id, pos.id, OPTS));
          }
          check(`remove ${opt.id}`, R.previewRemoveOptional(trip, opt.id, OPTS));
        }
        // Explicit excursion previews change exactly the one id asked for.
        for (const stop of trip.routePlan.stops) {
          const offered = R.listExcursionMenu(trip, stop.key, OPTS);
          for (const item of offered) {
            if (item.selected) {
              const r = R.previewRemoveExcursion(trip, stop.key, item.excursionId, OPTS);
              const expected = clone(S);
              expected[stop.key] = expected[stop.key].filter((id) => id !== item.excursionId);
              if (expected[stop.key].length === 0) delete expected[stop.key];
              check(`remove ${item.excursionId}`, r, expected);
            } else {
              const r = R.previewAddExcursion(trip, stop.key, item.excursionId, OPTS);
              const expected = clone(S);
              const ids = [...(expected[stop.key] ?? []), item.excursionId];
              const order = R.listExcursionMenu(trip, stop.key, OPTS).map((m) => m.excursionId);
              expected[stop.key] = order.filter((id) => ids.includes(id));
              check(`add ${item.excursionId}`, r, expected);
            }
          }
        }
      }
    }
  }
  assert.ok(starts > 30 && previews > 300, `the property ran over ${starts} starting selections and ${previews} results`);
});

test('A14b: intake builds never select anything, at every length of every synthetic variant', () => {
  const ranges = checkVariantsSchedulable(B.data.allRoutePackages, B.data);
  let built = 0;
  for (const { variantId, minDays, maxDays } of ranges) {
    for (let d = minDays; d <= maxDays; d++) {
      const trip = build(variantId, d);
      assert.deepEqual(selections(trip), {}, `${variantId}/${d}`);
      assert.ok(trip.routePlan.stops.every((s) => !('selectedExcursionIds' in s)), `${variantId}/${d}: the key is absent, not empty`);
      assert.deepEqual(siteIds(trip).filter((id) => !id.startsWith('ex:pt_base:syn_castle:')), [], `${variantId}/${d}: only fixed excursions`);
      built += 1;
    }
  }
  assert.ok(built > 40);
});

test('A15: site content is place-only: a place with no content is an honest gap, never borrowed', () => {
  const trip = add(build(HUB, 4), 'lx_base', 'cascais');
  const cascais = blocks(trip).find((b) => b.id === 'ex:lx_base:syn_cascais:site');
  assert.equal(cascais.type, 'open');
  assert.equal(cascais.generationStatus, 'unavailable');
  assert.equal(cascais.gap.reason, 'no_eligible_content');
  assert.ok(trip.contentGaps.some((g) => g.blockId === 'ex:lx_base:syn_cascais:site'));

  // Every filled site block holds an item of its own place.
  const both = add(build(SPUR, 10), 'lx_base', 'sintra');
  const byId = new Map(B.content.map((i) => [i.id, i]));
  const filled = siteBlocks(both).filter((b) => b.type === 'activity');
  assert.ok(filled.length >= 2, 'sintra and the fixed castle are filled');
  for (const b of filled) assert.equal(byId.get(b.anchor.contentId).placeId, b.placeId, b.id);
});

test('A16 / Q3: a held menu item is never offered or addable; a withdrawn one is reported, never silently kept or dropped', () => {
  const trip = build(HUB, 5);
  const listed = R.listExcursionMenu(trip, 'lx_base', OPTS);
  assert.deepEqual(listed.map((m) => m.excursionId), ['sintra', 'cascais']);
  assert.ok(listed.every((m) => m.selected === false));
  const held = R.previewAddExcursion(trip, 'lx_base', 'obidos', OPTS);
  assert.deepEqual([held.ok, held.why], [false, 'not_available']);

  // No proposal on any path selects a held item.
  const withEx = add(trip, 'lx_base', 'sintra');
  const everything = [R.previewAdjustNights(withEx, 'lx_base', +1, OPTS), R.previewChangeLength(withEx, 6, OPTS), R.previewAddExcursion(withEx, 'lx_base', 'cascais', OPTS)];
  for (const r of everything) {
    for (const p of r.ok ? r.proposals : r.alternatives) assert.ok(!(planStop(p.trip, 'lx_base').selectedExcursionIds ?? []).includes('obidos'));
  }

  // Q3: the item is withdrawn (pending_review) after the traveller chose it.
  const families = synFamilies();
  families[0].stops.lx_base.excursionMenu.find((m) => m.id === 'sintra').status = 'pending_review';
  const later = synBundle(compileFamilies, families);
  assert.deepEqual(R.listExcursionMenu(withEx, 'lx_base', later.options).map((m) => m.excursionId), ['cascais'], 'no longer offered');
  const rebuilt = R.previewAdjustNights(withEx, 'lx_base', +1, later.options);
  assert.equal(rebuilt.ok, true);
  const p = rebuilt.proposals[0];
  assert.deepEqual(p.diff.excursionsRemoved, [{ stopKey: 'lx_base', excursionId: 'sintra', placeId: 'syn_sintra', reason: 'no_longer_offered' }]);
  assert.deepEqual(selections(p.trip), {});
  assert.deepEqual(exBlockIds(p.trip), []);
  // The traveller can still remove it explicitly, and that is not reported as a withdrawal.
  const explicit = R.previewRemoveExcursion(withEx, 'lx_base', 'sintra', later.options);
  assert.equal(explicit.ok, true);
  assert.deepEqual(explicit.proposals[0].diff.excursionsRemoved.map((x) => x.reason), ['traveller_removed']);
});

test('A17: Peru\'s compiled packages carry no menu key, and no Peru trip or preview grows an excursion key', () => {
  for (const pkg of PILOT_DATA.allRoutePackages) {
    for (const s of pkg.stops) assert.equal('excursionMenu' in s, false, `${pkg.id}/${s.id}`);
  }
});

test('A18: Machu Picchu stays a fixed excursion, byte for byte, and can be neither added nor removed', () => {
  const peruSpec = (totalDays, extra = {}) => ({
    originPlaceId: 'vancouver', destination: { kind: 'country', id: 'PE' }, travelMonth: 10, totalDays, travellerType: 'couple',
    interests: [], pace: 'balanced', budget: 'mid', requiredPlaceIds: [], routeTemplateId: null, stops: [],
    choices: { pinned: [], rejected: [], placed: [] }, ...extra
  });
  const fixed = [{ placeId: 'machu_picchu', connectionId: 'conn_agc_mp_shuttle', hoursOnSite: 4 }];
  let checked = 0;
  const served = PILOT_DATA.routePackages.filter((p) => p.familyId === 'peru_classic');
  for (const { variantId, minDays } of checkVariantsSchedulable(served, PILOT_DATA)) {
    const trip = buildFilledTrip(peruSpec(minDays, { routeTemplateId: variantId }));
    checked += 1;
    assert.deepEqual(planStop(trip, 'pc_aguas').excursions, fixed);
    assert.ok(trip.routePlan.stops.every((s) => !('selectedExcursionIds' in s)));
    assert.deepEqual(exBlockIds(trip), ['ex:pc_aguas:machu_picchu:out', 'ex:pc_aguas:machu_picchu:site', 'ex:pc_aguas:machu_picchu:back'], variantId);
    for (const id of ['machu_picchu', 'conn_agc_mp_shuttle']) {
      assert.deepEqual([R.previewAddExcursion(trip, 'pc_aguas', id).ok, R.previewAddExcursion(trip, 'pc_aguas', id).why], [false, 'not_in_menu']);
      assert.deepEqual([R.previewRemoveExcursion(trip, 'pc_aguas', id).ok, R.previewRemoveExcursion(trip, 'pc_aguas', id).why], [false, 'not_in_menu']);
    }
    assert.deepEqual(R.listExcursionMenu(trip, 'pc_aguas'), []);
  }
  assert.ok(checked > 0);
});

test('A19: the engine names no place, country, operator or transport mode', () => {
  const words = /\b(peru|lima|cusco|huaraz|tokyo|japan|nikko|toronto|ottawa|montr[ée]al|qu[ée]bec|niagara|canada|new_york|machu|vancouver|flight|train|ferry|shuttle|coach)\b/i;
  for (const file of ['restructure.js', 'planner.js', 'validate.js']) {
    const text = readFileSync(new URL(`../../src/lib/door2/${file}`, import.meta.url), 'utf8');
    const hits = text.split('\n').map((line, i) => ({ line, n: i + 1 })).filter(({ line }) => words.test(line));
    assert.deepEqual(hits.map((h) => `${file}:${h.n}: ${h.line.trim()}`), [], `${file} names a destination-specific word`);
  }
});

test('A20: authoring errors, one assertion each, and a family without menus compiles with no menu key', () => {
  const data = (families) => synBundle(compileFamilies, families).data;
  const menuOn = (stopKey, items, mutate = (f) => f) => {
    const f = hubFamily();
    f.stops[stopKey].excursionMenu = items;
    return mutate(f);
  };
  const item = (id, placeId, connectionId, hoursOnSite = 3, status = 'approved') => ({ id, placeId, connectionId, hoursOnSite, status });
  const reasonOf = (fn) => {
    try {
      fn();
    } catch (err) {
      assert.ok(err instanceof FamilyAuthoringError, `${err}`);
      return err.reason;
    }
    return 'no error';
  };
  const compile = (f) => compileFamilies([f], { includePending: true });
  const check = (f, connections) => {
    const d = { ...data([f]), connections: connections ?? data([f]).connections };
    checkVariantsSchedulable(compile(f), d);
  };

  // A menu on a pass-through stop (maxNights 0), and on one an override turns into a pass-through.
  const passThrough = hubFamily();
  passThrough.stops.lx_hub = { placeId: 'syn_lisbon', minNights: 0, maxNights: 0, excursions: [], excursionMenu: [item('x', 'syn_sintra', 'syn_conn_lx_sintra')] };
  assert.equal(reasonOf(() => compile(passThrough)), 'excursion_menu_on_pass_through');
  const overridden = hubFamily();
  overridden.stops.lx_hub.excursionMenu = [item('hubtrip', 'syn_sintra', 'syn_conn_lx_sintra')];
  overridden.optional[0].positions[0].overrides = { lx_hub: { minNights: 0, maxNights: 0 } };
  assert.equal(reasonOf(() => compile(overridden)), 'excursion_menu_on_pass_through');

  assert.equal(reasonOf(() => compile(menuOn('lx_base', [item('sintra', 'syn_sintra', 'syn_conn_lx_sintra'), item('sintra', 'syn_cascais', 'syn_conn_lx_cascais')]))), 'duplicate_excursion_id');
  const acrossStops = hubFamily();
  acrossStops.stops.lx_hub.excursionMenu = [item('sintra', 'syn_sintra', 'syn_conn_lx_sintra')];
  assert.equal(reasonOf(() => compile(acrossStops)), 'duplicate_excursion_id', 'unique in the family, not just the stop');
  assert.equal(reasonOf(() => compile(menuOn('lx_base', [item('a', 'syn_sintra', 'syn_conn_lx_sintra'), item('b', 'syn_sintra', 'syn_conn_lx_sintra')]))), 'duplicate_excursion_place');
  assert.equal(reasonOf(() => compile(menuOn('pt_base', [item('again', 'syn_castle', 'syn_conn_pt_castle')]))), 'duplicate_excursion_place', 'a menu place may not repeat a fixed excursion');
  assert.equal(reasonOf(() => compile(menuOn('lx_base', [item('home', 'syn_lisbon', 'syn_conn_lx_sintra')]))), 'excursion_place_is_base');
  assert.equal(reasonOf(() => compile(menuOn('lx_base', [item('a', 'syn_sintra', 'syn_conn_lx_sintra', 3, 'maybe')]))), 'invalid_excursion_status');

  assert.equal(reasonOf(() => check(menuOn('lx_base', [item('a', 'syn_nowhere', 'syn_conn_lx_sintra')]))), 'excursion_unknown_place');
  assert.equal(reasonOf(() => check(menuOn('lx_base', [item('a', 'syn_sintra', 'syn_conn_missing')]))), 'excursion_unknown_connection');
  assert.equal(reasonOf(() => check(menuOn('lx_base', [item('a', 'syn_sintra', 'syn_conn_lx_cascais')]))), 'excursion_connection_mismatch');
  // 2.25 + 11 + 2.25 = 15.5h never fits a 12h day, at any number of nights: it could never be selected.
  assert.equal(reasonOf(() => check(menuOn('lx_base', [item('long', 'syn_sintra', 'syn_conn_lx_sintra', 11)]))), 'excursion_never_fits');
  // Held items are checked the same way.
  assert.equal(reasonOf(() => check(menuOn('lx_base', [item('long', 'syn_sintra', 'syn_conn_lx_sintra', 11, 'pending_review')]))), 'excursion_never_fits');
  // Fixed excursion + item that fits alone but not beside it at maxNights.
  const crowded = hubFamily();
  crowded.stops.pt_base.maxNights = 2;
  assert.equal(reasonOf(() => check(crowded)), 'excursion_never_fits', 'castle takes the only full day of a 2-night stop');
  // The shipped synthetic families are fine, and checkVariantsSchedulable's return value has its old shape.
  const ranges = checkVariantsSchedulable(B.data.allRoutePackages, B.data);
  assert.ok(ranges.every((r) => Object.keys(r).sort().join() === 'held,maxDays,minDays,variantId'));

  // A family without menus compiles with no menu key anywhere.
  for (const pkg of compile(lineFamily()).concat(compile(soloFamily()))) {
    for (const s of pkg.stops) assert.equal('excursionMenu' in s, pkg.id.startsWith('syn_solo') || s.id === 'ln_b' || s.id === 'ln_d', `${pkg.id}/${s.id}`);
  }
  const noMenu = hubFamily();
  for (const s of Object.values(noMenu.stops)) delete s.excursionMenu;
  for (const pkg of compile(noMenu)) for (const s of pkg.stops) assert.equal('excursionMenu' in s, false);
  // An empty menu is treated as no menu.
  const emptyMenu = hubFamily();
  emptyMenu.stops.lx_base.excursionMenu = [];
  for (const pkg of compile(emptyMenu)) assert.equal('excursionMenu' in pkg.stops[0], false);
});

test('A21: validateExcursionSelections throws when a trip\'s blocks and its plan disagree', () => {
  const trip = add(build(SPUR, 9), 'lx_base', 'sintra');
  validateExcursionSelections(trip, B.data);

  const droppedSelection = clone(trip);
  delete droppedSelection.routePlan.stops.find((s) => s.key === 'lx_base').selectedExcursionIds;
  assert.throws(() => validateExcursionSelections(droppedSelection, B.data), /plans excursions .* but its days hold/);

  const droppedBlocks = clone(trip);
  droppedBlocks.days.forEach((d) => (d.blocks = d.blocks.filter((b) => !b.id.startsWith('ex:lx_base:syn_sintra:'))));
  assert.throws(() => validateExcursionSelections(droppedBlocks, B.data), /plans excursions/);

  const unknownId = clone(trip);
  unknownId.routePlan.stops.find((s) => s.key === 'lx_base').selectedExcursionIds = ['nope'];
  assert.throws(() => validateExcursionSelections(unknownId, B.data), /not an approved item/);

  const heldId = clone(trip);
  heldId.routePlan.stops.find((s) => s.key === 'lx_base').selectedExcursionIds = ['obidos'];
  assert.throws(() => validateExcursionSelections(heldId, B.data), /not an approved item/);
});

test('A23: under the strict policy an unreviewed menu connection refuses; it never throws', () => {
  const trip = build(SOLO, 3);
  assert.equal(R.previewAddExcursion(trip, 'solo_base', 'ghost', OPTS).ok, false);
  const r = R.previewAddExcursion(trip, 'solo_base', 'ghost', { ...OPTS, reviewPolicy: 'strict' });
  assert.deepEqual([r.ok, r.reason, r.why], [false, 'change_not_feasible', 'not_available']);
  // The same item is addable when drafts are allowed, so the refusal is about review status alone.
  const drafts = R.previewAddExcursion(trip, 'solo_base', 'ghost', { ...OPTS, reviewPolicy: 'allow_drafts' });
  assert.equal(drafts.ok, true);
  assert.deepEqual(selections(drafts.proposals[0].trip), { solo_base: ['ghost'] });
});

test('A24: records today\'s behaviour: an excursion can land on a long-haul arrival day', () => {
  const trip = build(SOLO, 3);
  const arrival = trip.days[0].blocks.find((b) => b.id === 'tr:origin_out>solo_base');
  assert.ok(arrival.transport.computedUsableTimeLost >= 8, 'a long-haul arrival');
  const withQuick = add(trip, 'solo_base', 'quick');
  const onDayOne = withQuick.days[0].blocks.filter((b) => b.id.startsWith('ex:solo_base:syn_quick:'));
  assert.equal(onDayOne.length, 3, 'the excursion sits on the arrival day, next to the arrival cap');
  validateExcursionSelections(withQuick, B.data);
});

test('the API: unknown stops throw, refusals are precise, and nothing new appears when nothing is selected', () => {
  const trip = build(HUB, 5);
  assert.throws(() => R.previewAddExcursion(trip, 'nope', 'sintra', OPTS), /unknown stop/);
  assert.throws(() => R.previewRemoveExcursion(trip, 'nope', 'sintra', OPTS), /unknown stop/);
  assert.throws(() => R.listExcursionMenu(trip, 'nope', OPTS), /unknown stop/);
  assert.equal(R.previewAddExcursion(trip, 'lx_base', 'nope', OPTS).why, 'not_in_menu');
  assert.equal(R.previewRemoveExcursion(trip, 'lx_base', 'nope', OPTS).why, 'not_in_menu');
  assert.equal(R.previewRemoveExcursion(trip, 'lx_base', 'sintra', OPTS).why, 'not_included');
  const withEx = add(trip, 'lx_base', 'sintra');
  assert.equal(R.previewAddExcursion(withEx, 'lx_base', 'sintra', OPTS).why, 'already_included');
  assert.deepEqual(R.listExcursionMenu(withEx, 'lx_base', OPTS).map((m) => [m.excursionId, m.selected]), [['sintra', true], ['cascais', false]]);

  // Rule 8: with nothing selected no new key appears on any preview output.
  const outputs = [R.previewAdjustNights(trip, 'lx_base', +1, OPTS), R.previewChangeLength(trip, 6, OPTS), R.previewAdjustNights(trip, 'lx_base', -1, OPTS)];
  const spur = build(SPUR, 9);
  outputs.push(R.previewRemoveOptional(spur, 'spur', OPTS), R.previewChangeLength(spur, 10, OPTS));
  for (const r of outputs) {
    for (const p of r.ok ? r.proposals : r.alternatives) {
      assert.equal('excursionsAdded' in p.diff || 'excursionsRemoved' in p.diff, false);
      assert.ok(p.routePlan.stops.every((s) => !('selectedExcursionIds' in s)));
    }
    assert.equal('detail' in r, false);
  }
  // A refusal that is not about excursions has no `detail` either.
  assert.equal('detail' in R.previewAdjustNights(trip, 'lx_base', -1, OPTS), false);
});
