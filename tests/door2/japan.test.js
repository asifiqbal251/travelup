import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeUsableTimeLost } from '../../src/lib/door2/bufferRuleset.js';
import { checkVariantsSchedulable } from '../../src/lib/door2/families.js';
import { eligibleItemsForBlock } from '../../src/lib/door2/fill.js';
import { PILOT_CONTENT } from '../../src/lib/door2/pilotContent.js';
import { PILOT_CONNECTIONS, PILOT_ROUTE_PACKAGES } from '../../src/lib/door2/pilotData.js';
import { PILOT_DATA, buildFilledTrip } from '../../src/lib/door2/planner.js';
import * as R from '../../src/lib/door2/restructure.js';

// E3b: the Japan pilot family on real data. Tokyo base with an optional Kyoto spur
// (Tokyo -> Kyoto -> Tokyo hub night), and a day-trip menu on each base: Nikko and
// Kamakura from Tokyo, Nara and Osaka from Kyoto. Nothing is ever preselected.
// J10 (save/reload/delete) is japanStorage.test.js; J11 is excursions.test.js;
// J12 is preE3a.test.js and reversible.test.js; J13 is flowIntake.test.js B11b.

const BASE = 'tokyo_city';
const SPUR = 'tokyo_city+kyoto@after_tokyo';

const spec = (totalDays, extra = {}) => ({
  originPlaceId: 'vancouver',
  destination: { kind: 'country', id: 'JP' },
  travelMonth: 10,
  totalDays,
  travellerType: 'couple',
  interests: [],
  pace: 'balanced',
  budget: 'mid',
  requiredPlaceIds: [],
  routeTemplateId: null,
  stops: [],
  choices: { pinned: [], rejected: [], placed: [] },
  ...extra
});

function build(totalDays, variantId = null) {
  const trip = buildFilledTrip(spec(totalDays, { routeTemplateId: variantId }));
  assert.ok(trip.routePlan, `built ${variantId ?? 'JP'}/${totalDays}: ${JSON.stringify(trip.detail ?? trip.state)}`);
  return trip;
}

function add(trip, stopKey, excursionId, options = {}) {
  const r = R.previewAddExcursion(trip, stopKey, excursionId, options);
  assert.equal(r.ok, true, `add ${excursionId}: ${JSON.stringify(r).slice(0, 300)}`);
  const applied = R.applyProposal(trip, r.proposals[0]);
  assert.equal(applied.ok, true);
  return applied.trip;
}

function remove(trip, stopKey, excursionId) {
  const r = R.previewRemoveExcursion(trip, stopKey, excursionId);
  assert.equal(r.ok, true, `remove ${excursionId}: ${JSON.stringify(r).slice(0, 300)}`);
  return R.applyProposal(trip, r.proposals[0]).trip;
}

const blocks = (trip) => trip.days.flatMap((d) => d.blocks.map((b) => ({ ...b, dayNumber: d.dayNumber })));
const contentIds = (trip) => blocks(trip).filter((b) => b.type === 'activity').map((b) => b.anchor.contentId);
const nightsOf = (trip) => Object.fromEntries(trip.routePlan.stops.map((s) => [s.key, s.nights]));
const placeOfItem = new Map(PILOT_CONTENT.map((i) => [i.id, i.placeId]));

/** PILOT_DATA with one menu item's hoursOnSite replaced, for the what-if checks. */
function withMenuHours(excursionId, hoursOnSite) {
  const patch = (p) => ({
    ...p,
    stops: p.stops.map((s) =>
      s.excursionMenu ? { ...s, excursionMenu: s.excursionMenu.map((m) => (m.id === excursionId ? { ...m, hoursOnSite } : m)) } : s
    )
  });
  return { ...PILOT_DATA, routePackages: PILOT_DATA.routePackages.map(patch), allRoutePackages: PILOT_DATA.allRoutePackages.map(patch) };
}

// ---------------------------------------------------------------------------

test('J1: the family compiles to two served variants, Tokyo 5-12 days and Tokyo with Kyoto 8-18', () => {
  const served = PILOT_ROUTE_PACKAGES.filter((p) => p.familyId === BASE);
  assert.deepEqual(
    served.map((p) => [p.id, p.name, p.stops.map((s) => `${s.id}:${s.placeId}:${s.minNights}-${s.maxNights}`)]),
    [
      [BASE, 'Tokyo', ['tokyo_base:tokyo:3-10']],
      [SPUR, 'Tokyo with Kyoto', ['tokyo_base:tokyo:3-10', 'kyo_base:kyoto:2-5', 'tokyo_hub:tokyo:1-1']]
    ]
  );
  assert.deepEqual(checkVariantsSchedulable(served, PILOT_DATA), [
    { variantId: BASE, held: false, minDays: 5, maxDays: 12 },
    { variantId: SPUR, held: false, minDays: 8, maxDays: 18 }
  ]);
  // Menu places are never route places (E3a Q5), and Kyoto is only in the spur.
  assert.deepEqual(served.map((p) => p.placeIds), [['tokyo'], ['tokyo', 'kyoto']]);
});

test('J2: a default Japan build is Tokyo only, unchanged, with no excursion, and 10 days still shows exactly 2 gaps', () => {
  // Pinned from the pre-E3b build (identical to the old hand-written package, RF4).
  const expected = {
    5: { nights: 3, content: ['tyo_shinjuku', 'tyo_asakusa', 'tyo_meiji_shibuya'], gaps: 0 },
    7: { nights: 5, content: ['tyo_shinjuku', 'tyo_asakusa', 'tyo_meiji_shibuya', 'tyo_nikko', 'tyo_ueno_yanaka'], gaps: 0 },
    10: { nights: 8, content: ['tyo_shinjuku', 'tyo_asakusa', 'tyo_meiji_shibuya', 'tyo_nikko', 'tyo_ueno_yanaka', 'tyo_tsukiji_ginza'], gaps: 2 },
    12: { nights: 10, content: ['tyo_shinjuku', 'tyo_asakusa', 'tyo_meiji_shibuya', 'tyo_nikko', 'tyo_ueno_yanaka', 'tyo_tsukiji_ginza'], gaps: 4 }
  };
  for (const [days, want] of Object.entries(expected)) {
    const trip = build(Number(days));
    assert.equal(trip.routePlan.variantId, BASE, `${days} days`);
    assert.deepEqual(nightsOf(trip), { tokyo_base: want.nights }, `${days} days`);
    assert.deepEqual(contentIds(trip), want.content, `${days} days`);
    assert.equal(trip.contentGaps.length, want.gaps, `${days} days`);
    assert.equal(blocks(trip).some((b) => b.id.startsWith('ex:')), false, 'no excursion blocks');
    assert.equal('selectedExcursionIds' in trip.routePlan.stops[0], false, 'nothing selected');
  }
});

test('J3: adding Kyoto gives Tokyo -> Kyoto -> one Tokyo hub night, and no day carries two ground legs', () => {
  const ten = build(10);
  const r = R.previewAddOptional(ten, 'kyoto');
  assert.equal(r.ok, true);
  assert.deepEqual(r.proposals.map((p) => nightsOf(p.trip)), [{ tokyo_base: 5, kyo_base: 2, tokyo_hub: 1 }]);

  const ranges = checkVariantsSchedulable(PILOT_ROUTE_PACKAGES.filter((p) => p.id === SPUR), PILOT_DATA);
  for (let d = ranges[0].minDays; d <= ranges[0].maxDays; d++) {
    const trip = build(d, SPUR);
    assert.deepEqual(trip.routePlan.stops.map((s) => `${s.key}:${s.placeId}`), ['tokyo_base:tokyo', 'kyo_base:kyoto', 'tokyo_hub:tokyo'], `${d} days`);
    assert.equal(trip.routePlan.stops[2].nights, 1, `${d} days: the hub is exactly 1 night`);
    for (const day of trip.days) {
      const legs = day.blocks.filter((b) => b.type === 'travel' && b.id.startsWith('tr:') && !b.transport.mode.startsWith('flight'));
      assert.ok(legs.length <= 1, `${d} days, day ${day.dayNumber}: ${legs.map((b) => b.id).join(', ')}`);
    }
  }
});

test('J4: each base offers its own menu, nothing selected; the hub night offers none', () => {
  const trip = build(8, SPUR);
  const menu = (stopKey) => R.listExcursionMenu(trip, stopKey).map((m) => [m.excursionId, m.placeId, m.hoursOnSite, m.selected]);
  assert.deepEqual(menu('tokyo_base'), [['nikko', 'nikko', 4, false], ['kamakura', 'kamakura', 6, false]]);
  assert.deepEqual(menu('kyo_base'), [['nara', 'nara', 5, false], ['osaka', 'osaka', 6, false]]);
  assert.deepEqual(menu('tokyo_hub'), []);
  assert.equal(blocks(trip).some((b) => b.id.startsWith('ex:')), false);
  assert.ok(trip.routePlan.stops.every((s) => !('selectedExcursionIds' in s)));
});

test('J5: Nikko at a 3-night Tokyo adds three ex: blocks on one day, keeps nights and length, and fills the site from Nikko only', () => {
  const trip = build(5);
  const withNikko = add(trip, 'tokyo_base', 'nikko');
  assert.deepEqual(nightsOf(withNikko), { tokyo_base: 3 });
  assert.equal(withNikko.spec.totalDays, 5);
  assert.equal(withNikko.days.length, trip.days.length);
  const ex = blocks(withNikko).filter((b) => b.id.startsWith('ex:'));
  assert.deepEqual(ex.map((b) => b.id), ['ex:tokyo_base:nikko:out', 'ex:tokyo_base:nikko:site', 'ex:tokyo_base:nikko:back']);
  assert.equal(new Set(ex.map((b) => b.dayNumber)).size, 1, 'one day');
  const site = ex[1];
  assert.equal(site.placeId, 'nikko');
  assert.equal(site.durationHours, 4);
  assert.equal(site.type, 'activity');
  assert.equal(placeOfItem.get(site.anchor.contentId), 'nikko', `site filled from Nikko content, got ${site.anchor.contentId}`);
  assert.ok(['nik_toshogu', 'nik_rinnoji_futarasan'].includes(site.anchor.contentId));
});

test('J6: with Nikko selected, the Tokyo "Day trip to Nikko" is gone; deselected, it is eligible again', () => {
  const trip = build(10);
  assert.ok(contentIds(trip).includes('tyo_nikko'), 'the default 10-day trip uses it');
  const withNikko = add(trip, 'tokyo_base', 'nikko');
  assert.equal(contentIds(withNikko).includes('tyo_nikko'), false, 'nowhere in the trip');
  // Not just unplaced: no full day at the stop, on any day, will take it (so a swap cannot bring it back).
  const fullDays = (t) => t.days.flatMap((d) => d.blocks).filter((b) => b.anchor?.stopId === 'tokyo_base' && b.placeId === 'tokyo' && b.durationHours >= 8);
  const offers = (t) => fullDays(t).map((b) => eligibleItemsForBlock(t, b, PILOT_CONTENT).some((i) => i.id === 'tyo_nikko'));
  assert.ok(fullDays(withNikko).length >= 4);
  assert.ok(offers(withNikko).every((ok) => !ok), 'ineligible on every Tokyo day');
  const back = remove(withNikko, 'tokyo_base', 'nikko');
  assert.ok(contentIds(back).includes('tyo_nikko'), 'placed again once Nikko is removed');
  // With no excursion, it is eligible wherever it is not already used (its own block).
  const unused = { ...back, days: back.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.anchor?.contentId === 'tyo_nikko' ? { ...b, type: 'open', anchor: { ...b.anchor, contentId: null } } : b)) })) };
  assert.ok(offers(unused).every(Boolean), 'eligible on every Tokyo full day again');
});

test('J7: two day trips at a 2-night Kyoto refuse, naming both; "Add a night" gives 3 nights and both', () => {
  const trip = add(build(8, SPUR), 'kyo_base', 'nara');
  assert.deepEqual(nightsOf(trip), { tokyo_base: 3, kyo_base: 2, tokyo_hub: 1 }, 'one fits at 2 nights');
  const r = R.previewAddExcursion(trip, 'kyo_base', 'osaka');
  assert.equal(r.ok, false);
  assert.equal(r.why, 'excursion_does_not_fit');
  assert.deepEqual(r.detail, { stopKey: 'kyo_base', excursionIds: ['nara', 'osaka'], nightsNeeded: 3 });
  assert.match(r.message, /Nara and Osaka/);
  assert.equal(r.alternatives.length, 1);
  const alt = r.alternatives[0];
  assert.equal(alt.label, 'Add a night in Kyoto and include Osaka');
  assert.deepEqual(nightsOf(alt.trip), { tokyo_base: 3, kyo_base: 3, tokyo_hub: 1 });
  assert.equal(alt.trip.spec.totalDays, 9);
  assert.deepEqual(alt.trip.routePlan.stops[1].selectedExcursionIds, ['nara', 'osaka']);
  assert.deepEqual(
    blocks(alt.trip).filter((b) => /:site$/.test(b.id)).map((b) => b.id),
    ['ex:kyo_base:nara:site', 'ex:kyo_base:osaka:site']
  );
});

test('J8: Kamakura at 6.0h leaves no orphan evening block at Tokyo; at 5.0h it would', () => {
  const trip = build(5);
  const dayOf = (t) => {
    const site = blocks(t).find((b) => b.id === 'ex:tokyo_base:kamakura:site');
    return t.days.find((d) => d.dayNumber === site.dayNumber).blocks;
  };
  const real = dayOf(add(trip, 'tokyo_base', 'kamakura'));
  assert.deepEqual(
    real.map((b) => [b.id, b.startTime, b.durationHours]),
    [
      ['ex:tokyo_base:kamakura:out', '09:00', 2.5],
      ['ex:tokyo_base:kamakura:site', '11:30', 6],
      ['ex:tokyo_base:kamakura:back', '17:30', 2.5]
    ],
    'back at 20:00; the hour left is under the 1.5h minimum, so no block'
  );
  const five = withMenuHours('kamakura', 5.0);
  const shorter = dayOf(add(trip, 'tokyo_base', 'kamakura', { data: five }));
  const evening = shorter.filter((b) => b.id.startsWith('op:'));
  assert.deepEqual(evening.map((b) => [b.startTime, b.durationHours]), [['19:00', 2]], 'at 5.0h a 2-hour evening block appears (E2-F5)');
});

test('J9: every day trip fits as authored, and the E1 limits (4.64 / 7.00 / 7.40 / 7.70) hold on the real family', () => {
  const row = (id) => PILOT_CONNECTIONS.find((c) => c.id === id);
  const cases = [
    ['tokyo_base', 'nikko', 'conn_tyo_nikko_train', 4.0, 4.64, 5, BASE],
    ['tokyo_base', 'kamakura', 'conn_tyo_kamakura_train', 6.0, 7.0, 5, BASE],
    ['kyo_base', 'nara', 'conn_kyo_nara_train', 5.0, 7.4, 8, SPUR],
    ['kyo_base', 'osaka', 'conn_kyo_osaka_train', 6.0, 7.7, 8, SPUR]
  ];
  for (const [stopKey, id, connId, authored, limit, days, variant] of cases) {
    const oneWay = computeUsableTimeLost(row(connId));
    assert.equal(Math.round((12 - 2 * oneWay) * 100) / 100, limit, `${id}: 12h window minus the round trip`);
    const trip = build(days, variant);
    assert.equal(R.listExcursionMenu(trip, stopKey).find((m) => m.excursionId === id).hoursOnSite, authored);
    add(trip, stopKey, id); // as authored
    add(trip, stopKey, id, { data: withMenuHours(id, limit) }); // exactly at the limit
    const over = R.previewAddExcursion(trip, stopKey, id, { data: withMenuHours(id, limit + 0.05) });
    assert.deepEqual([over.ok, over.why], [false, 'excursion_does_not_fit'], `${id} just over its limit`);
  }
});
