import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifySlot, normalisePace } from '../../src/lib/door2/fill.js';
import { PILOT_CONTENT, PILOT_CONTENT_VERSION } from '../../src/lib/door2/pilotContent.js';
import { PILOT_PLACES } from '../../src/lib/door2/pilotData.js';
import { PILOT_DATA, buildFilledTrip, buildSkeletonTrip } from '../../src/lib/door2/planner.js';
import { validateFilled } from '../../src/lib/door2/validate.js';

// Expected values below were derived independently of this code (see the fill
// brief, Part E). If one disagrees, don't edit it to match: work out which
// side is wrong.

const DRAFTS = { reviewPolicy: 'allow_drafts' };

function spec(destination, totalDays, requiredPlaceIds = [], extra = {}) {
  return {
    originPlaceId: 'vancouver',
    destination,
    travelMonth: 10,
    totalDays,
    travellerType: 'couple',
    interests: [],
    pace: 'balanced',
    budget: 'mid',
    requiredPlaceIds,
    routeTemplateId: null,
    stops: [],
    choices: { pinned: [], rejected: [], placed: [] },
    ...extra
  };
}

const PERU = { kind: 'country', id: 'PE' };
const NYC = { kind: 'place', id: 'new_york' };
const TOKYO = { kind: 'place', id: 'tokyo' };
const G = {
  G1: spec(NYC, 7),
  G2: spec(PERU, 10),
  G3: spec(PERU, 12, ['huaraz', 'machu_picchu']),
  G4: spec(TOKYO, 7),
  G5: spec(TOKYO, 10),
  G6: spec(PERU, 14),
  G7: spec(PERU, 10, [], { interests: ['Hiking'] }),
  G8: spec(PERU, 10, [], { interests: ['Adventure'] }),
  G9: spec(PERU, 16, ['huaraz', 'machu_picchu'], { interests: ['Hiking'] }),
  G10: spec(TOKYO, 7, [], { pace: 'relaxed' }),
  G11: spec(PERU, 5)
};

function filled(s) {
  const trip = buildFilledTrip(s, PILOT_DATA, DRAFTS);
  assert.notEqual(trip.ok, false, `expected a Trip, got failure ${JSON.stringify(trip)}`);
  return trip;
}

/** Filled or gap blocks in walk order: [{day, start, slot, id, contentId|'GAP'}]. */
function fills(trip) {
  return trip.days.flatMap((d) =>
    d.blocks
      .filter((b) => b.type === 'activity' || b.gap)
      .map((b) => ({ day: d.dayNumber, start: b.startTime, slot: b.activity?.slot ?? b.gap.slot, id: b.id, contentId: b.anchor.contentId ?? 'GAP' }))
  );
}
const ids = (trip) => fills(trip).map((f) => `D${f.day} ${f.contentId}`);
const blockById = (trip, id) => trip.days.flatMap((d) => d.blocks).find((b) => b.id === id);
const clone = (x) => JSON.parse(JSON.stringify(x));

test('G1: NYC, 7 days', () => {
  const trip = filled(G.G1);
  assert.deepEqual(ids(trip), [
    'D2 nyc_midtown',
    'D3 nyc_central_park_museums',
    'D4 nyc_lower_manhattan',
    'D5 nyc_statue_brooklyn',
    'D6 nyc_brooklyn_neighbourhoods'
  ]);
  assert.equal(trip.contentGaps.length, 0);
  assert.equal(trip.status, 'valid'); // 72eb2d7: all connections reviewed → trip status 'valid'
  assert.equal(trip.versions.content, PILOT_CONTENT_VERSION);
});

test('G2: Peru, 10 days', () => {
  const trip = filled(G.G2);
  const f = fills(trip);
  assert.deepEqual(
    f.map((x) => `D${x.day} ${x.start} ${x.slot} ${x.contentId}`),
    [
      'D2 09:00 half lima_miraflores',
      'D3 09:00 full lima_historic_centre',
      'D4 14:00 half cusco_acclimatise',
      'D5 09:00 full cusco_market_san_blas',
      'D6 09:00 full cusco_sacsayhuaman',
      // 72eb2d7: Ollantaytambo→Aguas train 1.75h → 1.5h, so MP is 15 min earlier and the
      // return from MP lands 19:21 (was 19:36), leaving a 99-min evening (≥ 90-min minimum).
      'D7 14:30 half mp_citadel',
      'D7 19:21 evening agc_hot_springs',
      // 72eb2d7: the Aguas→Ollantaytambo leg is the same train row, so Lima arrival is 15 min earlier.
      'D8 18:39 evening lima_magic_water'
    ]
  );
  assert.equal(f.find((x) => x.contentId === 'mp_citadel').id, 'ex:pc_aguas:machu_picchu:site');
  assert.equal(blockById(trip, 'ex:pc_aguas:machu_picchu:site').placeId, 'machu_picchu');
  assert.equal(trip.contentGaps.length, 0);
  assert.equal(trip.status, 'valid'); // 72eb2d7: all connections reviewed → trip status 'valid'
});

test('G3: Peru + Huaraz + Machu Picchu, 12 days', () => {
  const trip = filled(G.G3);
  const f = fills(trip);
  assert.deepEqual(ids(trip), [
    'D2 lima_miraflores',
    'D3 lima_historic_centre',
    'D4 huz_first_evening',
    'D5 huz_acclimatise',
    'D6 lima_magic_water',
    'D7 cusco_acclimatise',
    'D8 cusco_market_san_blas',
    'D9 mp_citadel',
    'D9 agc_hot_springs', // 72eb2d7: train 15 min shorter → MP return 19:21 leaves a 99-min evening
    'D10 lima_ceviche_evening'
  ]);
  const at = (day) => f.find((x) => x.day === day);
  // 72eb2d7: Lima↔Huaraz coach 8.0h → 8.5h, so both coach arrivals move 17:51 → 18:21.
  assert.deepEqual([at(4).start, at(4).slot], ['18:21', 'evening']);
  assert.deepEqual([at(6).start, at(6).slot], ['18:21', 'evening']);
  // 72eb2d7: train 1.75h → 1.5h, so the Lima arrival moves 18:54 → 18:39.
  assert.deepEqual([at(10).start, at(10).slot], ['18:39', 'evening']);
  const limaItems = f.filter((x) => x.contentId.startsWith('lima_')).map((x) => x.contentId);
  assert.equal(limaItems.length, 4);
  assert.equal(new Set(limaItems).size, 4, "Lima's three stays use four different items");
  assert.equal(trip.contentGaps.length, 0);
});

test('G4: Tokyo, 7 days', () => {
  const trip = filled(G.G4);
  const f = fills(trip);
  assert.deepEqual(ids(trip), ['D2 tyo_shinjuku', 'D3 tyo_asakusa', 'D4 tyo_meiji_shibuya', 'D5 tyo_nikko', 'D6 tyo_ueno_yanaka']);
  assert.equal(f[0].start, '16:21');
  assert.equal(f[0].slot, 'half');
  assert.equal(trip.contentGaps.length, 0);
});

test('G5: Tokyo, 10 days runs out of content (content_insufficient)', () => {
  const trip = filled(G.G5);
  assert.deepEqual(ids(trip), [
    'D2 tyo_shinjuku',
    'D3 tyo_asakusa',
    'D4 tyo_meiji_shibuya',
    'D5 tyo_nikko',
    'D6 tyo_ueno_yanaka',
    'D7 tyo_tsukiji_ginza',
    'D8 GAP',
    'D9 GAP'
  ]);
  assert.equal(trip.status, 'incomplete');
  assert.ok(trip.warnings.includes('content_insufficient'));
  assert.equal(trip.contentGaps.length, 2);
  assert.deepEqual(
    trip.contentGaps.map((g) => g.blockId),
    ['op:tokyo_base:d6', 'op:tokyo_base:d7']
  );
  for (const g of trip.contentGaps) {
    const b = blockById(trip, g.blockId);
    assert.equal(b.type, 'open');
    assert.equal(b.generationStatus, 'unavailable');
    assert.deepEqual(b.gap, { reason: 'no_eligible_content', slot: 'full' });
    assert.equal(b.activity, undefined);
    assert.equal(b.anchor.contentId, null);
  }
});

test('G6: Peru, 14 days', () => {
  const trip = filled(G.G6);
  assert.deepEqual(
    fills(trip).map((x) => `D${x.day} ${x.start} ${x.slot} ${x.contentId}`),
    [
      'D2 09:00 half lima_miraflores',
      'D3 09:00 full lima_historic_centre',
      'D4 09:00 full lima_barranco',
      'D5 14:00 half cusco_acclimatise',
      'D6 09:00 full cusco_market_san_blas',
      'D7 09:00 full cusco_sacsayhuaman',
      'D8 09:00 full cusco_pisac',
      'D9 11:03 full olly_fortress_town',
      // 72eb2d7: Ollantaytambo↔Aguas train 1.75h → 1.5h moves each of these 15 min earlier.
      'D10 12:27 half mp_citadel',
      'D10 17:18 evening agc_hot_springs',
      'D11 09:00 full agc_mandor',
      'D12 18:39 evening lima_magic_water'
    ]
  );
  assert.equal(trip.contentGaps.length, 0);
});

test('G7: Peru, 10 days, Hiking: Pisac then Humantay (not before dayOffset 2)', () => {
  const trip = filled(G.G7);
  const g2 = ids(filled(G.G2));
  const got = ids(trip);
  assert.equal(got.find((x) => x.startsWith('D5 ')), 'D5 cusco_pisac');
  assert.equal(got.find((x) => x.startsWith('D6 ')), 'D6 cusco_humantay');
  assert.deepEqual(
    got.filter((x) => !/^D[56] /.test(x)),
    g2.filter((x) => !/^D[56] /.test(x))
  );
  assert.equal(blockById(trip, 'op:pc_cusco:d2').anchor.contentId, 'cusco_humantay');
});

test('G8: Peru, 10 days, Adventure', () => {
  const got = ids(filled(G.G8));
  assert.equal(got.find((x) => x.startsWith('D3 ')), 'D3 lima_lunahuana');
  assert.equal(got.find((x) => x.startsWith('D6 ')), 'D6 cusco_humantay');
});

test('G9: Peru, 16 days, Huaraz + MP, Hiking: Wilcacocha at offset 1, Laguna 69 at offset 2', () => {
  const trip = filled(G.G9);
  const got = ids(trip);
  assert.equal(got.find((x) => x.startsWith('D5 ')), 'D5 huz_wilcacocha');
  assert.equal(got.find((x) => x.startsWith('D6 ')), 'D6 huz_laguna69');
  // Route Families: Huaraz stop key ph_huaraz -> pc_huaraz.
  assert.equal(blockById(trip, 'op:pc_huaraz:d1').anchor.contentId, 'huz_wilcacocha');
  assert.equal(blockById(trip, 'op:pc_huaraz:d2').anchor.contentId, 'huz_laguna69');
});

test('G10: Tokyo, 7 days, relaxed: no Nikko; Fast-paced is identical to G4', () => {
  const relaxed = fills(filled(G.G10)).map((x) => x.contentId);
  assert.deepEqual(relaxed, ['tyo_shinjuku', 'tyo_ueno_yanaka', 'tyo_tsukiji_ginza', 'tyo_asakusa', 'tyo_meiji_shibuya']);
  assert.ok(!relaxed.includes('tyo_nikko'));
  assert.deepEqual(filled(spec(TOKYO, 7, [], { pace: 'Fast-paced' })).days, filled(G.G4).days);
});

test('G11: Peru, 5 days: the skeleton failure is returned unchanged', () => {
  const result = buildFilledTrip(G.G11, PILOT_DATA, DRAFTS);
  assert.equal(result.ok, false);
  assert.equal(result.state, 'duration_too_short');
  assert.deepStrictEqual(result, buildSkeletonTrip(G.G11, PILOT_DATA, DRAFTS));
});

test('G12: fill never changes the calendar (G2, G3, G6)', () => {
  for (const key of ['G2', 'G3', 'G6']) {
    const skeleton = buildSkeletonTrip(G[key], PILOT_DATA, DRAFTS);
    const trip = filled(G[key]);
    assert.equal(trip.id, skeleton.id, key);
    assert.equal(trip.days.length, skeleton.days.length, key);
    skeleton.days.forEach((skDay, i) => {
      const shape = (b) => ({ id: b.id, startTime: b.startTime, durationHours: b.durationHours, placeId: b.placeId });
      assert.deepEqual(trip.days[i].blocks.map(shape), skDay.blocks.map(shape), `${key} Day ${skDay.dayNumber}`);
      skDay.blocks.forEach((b, j) => {
        if (b.type !== 'open') assert.deepStrictEqual(trip.days[i].blocks[j], b, `${key} ${b.id}`);
      });
    });
  }
});

test('G13: determinism and JSON round-trip (G2)', () => {
  const a = filled(G.G2);
  const b = filled(G.G2);
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), a);
});

test('G14: PILOT_CONTENT integrity', () => {
  const SLOTS = new Set(['full', 'half', 'evening', 'short']);
  const INTENSITIES = new Set(['Light', 'Moderate', 'High', 'Highly active']);
  assert.equal(PILOT_CONTENT_VERSION, 'pilot-content-v1');
  assert.equal(PILOT_CONTENT.length, 56);
  assert.equal(new Set(PILOT_CONTENT.map((i) => i.id)).size, PILOT_CONTENT.length, 'ids are unique');
  for (const item of PILOT_CONTENT) {
    assert.ok(Object.prototype.hasOwnProperty.call(PILOT_PLACES, item.placeId), `${item.id}: unknown place ${item.placeId}`);
    assert.ok(item.slots.length > 0 && item.slots.every((s) => SLOTS.has(s)), `${item.id}: bad slots`);
    assert.ok(INTENSITIES.has(item.intensity), `${item.id}: bad intensity`);
    assert.ok(typeof item.summary === 'string' && item.summary.length > 0, `${item.id}: no summary`);
    assert.ok(item.source && (item.source.kind === 'extracted' || item.source.kind === 'authored'), `${item.id}: no source`);
    if (item.slots.includes('full')) {
      for (const k of ['morning', 'afternoon', 'evening']) assert.ok(item[k], `${item.id}: full slot without ${k}`);
    }
  }
});

test('G15: slot classification and pace normalisation', () => {
  assert.equal(classifySlot({ durationHours: 12, startTime: '09:00' }), 'full');
  assert.equal(classifySlot({ durationHours: 7.99, startTime: '09:00' }), 'half');
  assert.equal(classifySlot({ durationHours: 3.15, startTime: '17:51' }), 'evening');
  assert.equal(classifySlot({ durationHours: 2.1, startTime: '18:54' }), 'evening');
  assert.equal(classifySlot({ durationHours: 2.5, startTime: '10:00' }), 'short');
  assert.equal(classifySlot({ durationHours: 8, startTime: '18:00' }), 'full');
  assert.equal(normalisePace('Relaxed'), 'relaxed');
  assert.equal(normalisePace('Fast-paced'), 'fast');
  assert.equal(normalisePace('balanced'), 'neutral');
  assert.equal(normalisePace(undefined), 'neutral');
});

test('G16: validateFilled catches tampering', () => {
  const skeleton = buildSkeletonTrip(G.G2, PILOT_DATA, DRAFTS);
  const good = filled(G.G2);
  assert.doesNotThrow(() => validateFilled(good, skeleton, G.G2, PILOT_CONTENT));

  const tamper = (trip, fn) => {
    const t = clone(trip);
    fn(t, (id) => t.days.flatMap((d) => d.blocks).find((b) => b.id === id));
    return t;
  };
  const setItem = (block, itemId) => {
    block.anchor.contentId = itemId;
    block.activity.templateId = itemId;
  };

  // (a) the same item used on two blocks
  const a = tamper(good, (_, byId) => setItem(byId('op:pc_cusco:d2'), 'cusco_market_san_blas'));
  assert.throws(() => validateFilled(a, skeleton, G.G2, PILOT_CONTENT), /used more than once/);

  // (b) an activity whose item is for another place
  const b = tamper(good, (_, byId) => setItem(byId('op:pc_lima_in:d1'), 'cusco_pisac'));
  assert.throws(() => validateFilled(b, skeleton, G.G2, PILOT_CONTENT), /uses content "cusco_pisac" for "cusco"/);

  // (c) cusco_humantay at dayOffset 1
  const c = tamper(good, (_, byId) => setItem(byId('op:pc_cusco:d1'), 'cusco_humantay'));
  assert.throws(() => validateFilled(c, skeleton, G.G2, PILOT_CONTENT), /dayOffset 1, minDayAtStop 2/);

  // (d) a changed startTime on a travel block
  const d = tamper(good, (_, byId) => { byId('tr:pc_lima_in>pc_cusco').startTime = '10:00'; });
  assert.throws(() => validateFilled(d, skeleton, G.G2, PILOT_CONTENT), /startTime/);

  // (e) status draft while a gap exists
  const skeleton5 = buildSkeletonTrip(G.G5, PILOT_DATA, DRAFTS);
  const e = tamper(filled(G.G5), (t) => { t.status = 'draft'; });
  assert.throws(() => validateFilled(e, skeleton5, G.G5, PILOT_CONTENT), /status "draft" with 2 gaps/);
});
