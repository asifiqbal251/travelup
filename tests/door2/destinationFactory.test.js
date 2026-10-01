// Phase E checkpoint, decision E5-3: a permanent guard on the generality claim.
//
// A synthetic destination is added as DATA ONLY. If any of these fail, adding a new
// destination no longer costs zero engine changes, and §5 of
// claude/checkpoint-phase-e-2026-09-30.md has become false.
//
// Deliberately synthetic: no real places, no real connections, no facts to maintain.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TF_FAMILY, buildProbeWorld, probeSpec,
  checkVariantsSchedulable, buildFilledTrip, R
} from './helpers/syntheticFamily.js';

const world = () => buildProbeWorld();
const build = (w, days, variantId) =>
  buildFilledTrip(probeSpec(days, variantId), w.data, { reviewPolicy: 'allow_drafts', content: w.content });
const opts = (w) => ({ data: w.data, content: w.content, reviewPolicy: 'allow_drafts', families: [TF_FAMILY] });
const baseAStop = (trip) => trip.routePlan.stops.find((s) => s.placeId === 'tf_base_a');

test('DF1: a new family compiles — directions x optional, with no engine change', () => {
  const w = world();
  const ids = w.packages.map((p) => p.id).sort();
  assert.deepEqual(ids, [
    'tf_corridor#a_to_b',
    'tf_corridor#a_to_b+base_c@corridor',
    'tf_corridor#b_to_a',
    'tf_corridor#b_to_a+base_c@corridor'
  ]);
});

test('DF2: every variant passes the authoring check', () => {
  const w = world();
  const rows = checkVariantsSchedulable(w.data.routePackages, w.data);
  assert.equal(rows.length, 4);
  for (const r of rows) {
    assert.ok(Number.isInteger(r.minDays) && r.minDays > 0, `${r.variantId}: minDays ${r.minDays}`);
    assert.ok(r.maxDays >= r.minDays, `${r.variantId}: maxDays ${r.maxDays} < minDays ${r.minDays}`);
  }
});

test('DF3: both directions build a real trip', () => {
  const w = world();
  const fwd = build(w, 10, 'tf_corridor#a_to_b');
  const rev = build(w, 10, 'tf_corridor#b_to_a');
  assert.ok(fwd.routePlan, JSON.stringify(fwd).slice(0, 200));
  assert.ok(rev.routePlan, JSON.stringify(rev).slice(0, 200));
  const order = (t) => t.routePlan.stops.map((s) => s.placeId).join(' ');
  assert.notEqual(order(fwd), order(rev), 'the reversed direction must differ');
  assert.equal(rev.routePlan.stops[0].placeId, 'tf_base_b');
});

test('DF4: a day-trip menu is offered on the base, with nothing preselected', () => {
  const w = world();
  const trip = build(w, 10, 'tf_corridor#a_to_b');
  const menu = R.listExcursionMenu(trip, baseAStop(trip).key, opts(w));
  assert.equal(menu.length, 2);
  assert.deepEqual(menu.map((m) => m.excursionId).sort(), ['site_a', 'site_b']);
  assert.ok(menu.every((m) => m.selected === false), 'nothing is preselected');
});

test('DF5: a day trip can be added on a REVERSIBLE family and consumes no nights', () => {
  const w = world();
  const trip = build(w, 10, 'tf_corridor#a_to_b');
  const key = baseAStop(trip).key;
  const r = R.previewAddExcursion(trip, key, 'site_a', opts(w));
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 220));
  const applied = R.applyProposal(trip, r.proposals[0]);
  const after = applied.trip ?? applied;
  assert.deepEqual(baseAStop(after).selectedExcursionIds, ['site_a']);
  assert.equal(after.spec.totalDays, trip.spec.totalDays, 'a day trip consumes no nights');
});

test('DF6: a selected day trip survives a mid-route structural change (the J7 rule, new combination)', () => {
  const w = world();
  const trip = build(w, 10, 'tf_corridor#a_to_b');
  const key = baseAStop(trip).key;
  const add = R.previewAddExcursion(trip, key, 'site_a', opts(w));
  assert.equal(add.ok, true);
  const withTrip = (R.applyProposal(trip, add.proposals[0])).trip ?? R.applyProposal(trip, add.proposals[0]);

  const opt = R.previewAddOptional(withTrip, 'base_c', 'corridor', opts(w));
  assert.equal(opt.ok, true, JSON.stringify(opt).slice(0, 220));
  const applied = R.applyProposal(withTrip, opt.proposals[0]);
  const after = applied.trip ?? applied;

  assert.ok(after.routePlan.stops.some((s) => s.placeId === 'tf_base_c'), 'the optional was inserted');
  assert.deepEqual(baseAStop(after).selectedExcursionIds, ['site_a'], 'the selection survived the rebuild');
});

test('DF7: every preview returns on the new family — proposals or a structured refusal, never a throw', () => {
  const w = world();
  const problems = [];
  for (const variantId of w.data.routePackages.map((p) => p.id)) {
    for (let days = 8; days <= 16; days++) {
      let trip;
      try { trip = build(w, days, variantId); } catch (e) { problems.push(`build ${variantId}/${days}: ${e.message}`); continue; }
      if (!trip?.routePlan) continue;
      const calls = [['len-1', () => R.previewChangeLength(trip, days - 1, opts(w))],
                     ['len+1', () => R.previewChangeLength(trip, days + 1, opts(w))]];
      for (const s of trip.routePlan.stops) {
        calls.push([`-1 ${s.key}`, () => R.previewAdjustNights(trip, s.key, -1, opts(w))]);
        calls.push([`+1 ${s.key}`, () => R.previewAdjustNights(trip, s.key, +1, opts(w))]);
      }
      for (const [label, fn] of calls) {
        let r;
        try { r = fn(); } catch (e) { problems.push(`${variantId}/${days} ${label} THREW: ${e.message}`); continue; }
        if (r.ok !== true && typeof r.reason !== 'string') problems.push(`${variantId}/${days} ${label}: neither proposals nor a reason`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.slice(0, 10).join('\n'));
});

test('DF8: an attraction place is never used as an overnight base', () => {
  const w = world();
  for (const variantId of w.data.routePackages.map((p) => p.id)) {
    const trip = build(w, 12, variantId);
    if (!trip?.routePlan) continue;
    for (const s of trip.routePlan.stops) {
      const p = w.data.places[s.placeId];
      assert.ok(!(p.visitKind === 'attraction' && s.nights >= 1), `${variantId}: night at attraction ${s.placeId}`);
    }
  }
});
