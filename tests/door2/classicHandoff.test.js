// Direction B, Stage 2 — the /plan -> /find parameter contract (build brief B Stage 2,
// revision 3, sections 5 to 8). Pure functions only; the pages that use them are driven
// in flowBStage2Exits.test.js and flowBStage2Arrival.test.js.
//
// Approved sentences are written out here on purpose, not imported, so wording drift
// fails a test instead of passing silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClassicHandoff,
  parseClassicHandoff,
  handoffNote,
  lexInteger,
  boundedQuery,
  destinationHandoff,
  durationHandoff,
  DEST_Q_MAX,
  VERIFIED_CLASSIC_DESTINATION_IDS,
} from '../../src/lib/door2/classicHandoff.js';

const parsed = (qs) => parseClassicHandoff(qs);

// ── strict numeric lexing ────────────────────────────────────────────────────

test('lexInteger accepts whole canonical decimals and nothing else', () => {
  for (const ok of ['0', '1', '7', '14', '60', '100']) assert.equal(lexInteger(ok), Number(ok), ok);
  for (const bad of ['7abc', '+7', '-7', ' 7', '7 ', '7.0', '7.5', '1e1', '0x7', '07', '', ' ', 'abc', '٧']) {
    assert.equal(lexInteger(bad), null, JSON.stringify(bad));
  }
  assert.equal(lexInteger(null), null);
  assert.equal(lexInteger(undefined), null);
  assert.equal(lexInteger(7), null, 'only strings are lexed');
});

// ── the /find side: each field on its own ────────────────────────────────────

test('parse: nothing, or only unknown keys, is not a handoff', () => {
  assert.equal(parsed('').active, false);
  assert.equal(parsed('?foo=bar&utm_source=x').active, false);
  assert.equal(parsed(undefined).active, false);
});

test('parse: a full, valid handoff', () => {
  const h = parsed('?dest_q=Peru&month=10&days=10&party=two');
  assert.deepEqual(h, { active: true, destQ: 'Peru', destId: null, month: '10', days: 10, daysReq: null, party: 'two', route: null });
});

test('parse: month is the classic string "1"-"12"; anything else falls back alone', () => {
  assert.equal(parsed('?month=1').month, '1');
  assert.equal(parsed('?month=12').month, '12');
  for (const bad of ['0', '13', '01', 'October', '10.0', '-1', '1e1', '']) {
    assert.equal(parsed(`?month=${bad}&party=two`).month, null, bad);
    assert.equal(parsed(`?month=${bad}&party=two`).party, 'two', `${bad}: other fields survive`);
  }
});

test('parse: party accepts only the four classic keys', () => {
  for (const ok of ['just-me', 'two', 'friends', 'family']) assert.equal(parsed(`?party=${ok}`).party, ok);
  for (const bad of ['solo', 'couple', 'Two', 'two ', 'groups', '']) assert.equal(parsed(`?party=${bad}`).party, null, bad);
});

test('parse: days is 3-14 exactly; out of range or malformed is dropped with no request recorded', () => {
  for (let n = 3; n <= 14; n++) assert.equal(parsed(`?days=${n}`).days, n);
  for (const bad of ['2', '15', '1', '60', '99', 'abc', '7abc', '+7', '07', '7.0', '']) {
    const h = parsed(`?days=${bad}`);
    assert.equal(h.days, null, bad);
    assert.equal(h.daysReq, null, `${bad}: a bad link is not a traveller request`);
  }
});

test('parse: days_req is meaningful only for 1-2 or 15-60, and only when the days key is absent', () => {
  for (const n of [1, 2, 15, 20, 59, 60]) assert.equal(parsed(`?days_req=${n}`).daysReq, n, String(n));
  for (const n of [3, 7, 14]) assert.equal(parsed(`?days_req=${n}`).daysReq, null, `${n} is in range: no warning, no gate`);
  for (const bad of ['0', '61', '100', '20abc', '+20', ' 20', '2.0', '1e1', '020', '']) {
    assert.equal(parsed(`?days_req=${bad}`).daysReq, null, bad);
  }
});

test('parse: a valid days wins over days_req; an invalid or empty days key still counts as present', () => {
  const both = parsed('?days=7&days_req=20');
  assert.equal(both.days, 7);
  assert.equal(both.daysReq, null, 'no contradictory notice');
  assert.equal(parsed('?days=abc&days_req=20').daysReq, null, 'present but invalid is still present');
  assert.equal(parsed('?days=&days_req=20').daysReq, null, 'present but empty is still present');
  assert.equal(parsed('?days_req=20').daysReq, 20, 'absent key: the request stands');
});

test('parse: the first occurrence of a repeated key wins, and an invalid first is not rescued by a second', () => {
  assert.equal(parsed('?month=3&month=9').month, '3');
  assert.equal(parsed('?month=abc&month=9').month, null);
  assert.equal(parsed('?party=two&party=family').party, 'two');
  assert.equal(parsed('?days=5&days=9').days, 5);
  assert.equal(parsed('?days=99&days=9').days, null);
  assert.equal(parsed('?dest_q=Peru&dest_q=Japan').destQ, 'Peru');
  assert.equal(parsed('?days=abc&days=7&days_req=20').daysReq, null, 'a first-invalid duplicate does not make days absent');
});

test('parse: dest_q is bounded text; dest_id is a short opaque token', () => {
  assert.equal(parsed('?dest_q=%20%20Lima%20%20').destQ, 'Lima');
  assert.equal(parsed('?dest_q=').destQ, null);
  assert.equal(parsed('?dest_q=%20%20').destQ, null);
  const long = 'x'.repeat(500);
  assert.equal(parsed(`?dest_q=${long}`).destQ.length, DEST_Q_MAX);
  assert.equal(parsed('?dest_q=a%00b%1fc').destQ, 'a b c', 'control characters never survive');
  assert.equal(parsed('?dest_q=%3Cscript%3E').destQ, '<script>', 'carried as text; rendering escapes it');
  assert.equal(parsed('?dest_id=64f0a1b2c3d4e5f60718293a').destId, '64f0a1b2c3d4e5f60718293a');
  for (const bad of ['', 'a b', '../x', 'x'.repeat(65), '<x>', 'a/b']) assert.equal(parsed(`?dest_id=${encodeURIComponent(bad)}`).destId, null, bad);
});

test('parse: one bad parameter never discards the others', () => {
  const h = parsed('?dest_q=Lima&month=13&days=99&party=two');
  assert.equal(h.destQ, 'Lima');
  assert.equal(h.month, null);
  assert.equal(h.days, null);
  assert.equal(h.party, 'two');
  assert.equal(h.active, true);
});

test('parse: reserved Base44 bootstrap names are never read as handoff fields', () => {
  const h = parsed('?from_url=https%3A%2F%2Fexample.com&access_token=x&app_id=y');
  assert.equal(h.active, false);
});

// ── the /plan side ───────────────────────────────────────────────────────────

const search = (href) => href.slice(href.indexOf('?'));

test('build: month is the plain integer string; party maps to the classic key', () => {
  const { href, carried } = buildClassicHandoff({ destination: 'country:PE', totalDays: 10, travelMonth: 10, travellerType: 'couple' });
  assert.deepEqual([...new URLSearchParams(search(href))].sort(), [['days', '10'], ['dest_q', 'Peru'], ['month', '10'], ['party', 'two'], ['route', 'peru']]);
  assert.deepEqual(carried, { query: true, month: true, days: true, party: true, outOfRange: false, route: 'peru' });
  for (const [plan, classic] of [['solo', 'just-me'], ['couple', 'two'], ['friends', 'friends'], ['family', 'family']]) {
    assert.equal(new URLSearchParams(search(buildClassicHandoff({ destination: 'country:PE', totalDays: 7, travelMonth: 3, travellerType: plan }).href)).get('party'), classic);
  }
});

test('build: a length the classic planner offers is carried as days', () => {
  for (const n of [3, 7, 14]) {
    const q = new URLSearchParams(search(buildClassicHandoff({ destination: 'country:CA', totalDays: n, travelMonth: 5, travellerType: 'solo' }).href));
    assert.equal(q.get('days'), String(n));
    assert.equal(q.has('days_req'), false);
  }
});

test('build: a length it cannot offer is never carried as days, and never changed', () => {
  for (const n of [1, 2, 15, 20, 60]) {
    const { href, carried } = buildClassicHandoff({ destination: 'country:PE', totalDays: n, travelMonth: 5, travellerType: 'solo' });
    const q = new URLSearchParams(search(href));
    assert.equal(q.has('days'), false, `${n}: not carried as days`);
    assert.equal(q.get('days_req'), String(n), `${n}: the original request, unchanged`);
    assert.equal(carried.days, false);
    assert.equal(carried.outOfRange, true);
  }
});

test('build: nothing is carried for a length /plan itself would never produce', () => {
  for (const n of [0, 61, -3, 7.5, NaN, undefined, 'x']) {
    const q = new URLSearchParams(search(buildClassicHandoff({ destination: 'country:PE', totalDays: n, travelMonth: 5, travellerType: 'solo' }).href));
    assert.equal(q.has('days'), false, String(n));
    assert.equal(q.has('days_req'), false, String(n));
  }
});

test('build: Peru and Eastern Canada carry search text only, and never a record id', () => {
  for (const [value, text] of [['country:PE', 'Peru'], ['country:CA', 'Canada']]) {
    const q = new URLSearchParams(search(buildClassicHandoff({ destination: value, totalDays: 10, travelMonth: 10, travellerType: 'couple' }).href));
    assert.equal(q.get('dest_q'), text);
    assert.equal(q.has('dest_id'), false, `${value} must never select a partial match`);
  }
});

test('build: every individual place carries its own name as search text only', () => {
  const expected = {
    'place:lima': 'Lima', 'place:cusco': 'Cusco', 'place:huaraz': 'Huaraz', 'place:aguas_calientes': 'Aguas Calientes',
    'place:tokyo': 'Tokyo', 'place:niagara_falls': 'Niagara Falls', 'place:montreal': 'Montréal', 'place:quebec_city': 'Québec City',
    'place:ljubljana': 'Ljubljana', 'place:new_york': 'New York',
  };
  for (const [value, text] of Object.entries(expected)) {
    const q = new URLSearchParams(search(buildClassicHandoff({ destination: value, totalDays: 10, travelMonth: 10, travellerType: 'couple' }).href));
    assert.equal(q.get('dest_q'), text, value);
    assert.equal(q.has('dest_id'), false, value);
  }
});

test('build: no record id is written until one is verified from the live catalogue', () => {
  // brief section 11: a name is not an id. While an entry is null, that route is search text only.
  for (const [value, id] of Object.entries(VERIFIED_CLASSIC_DESTINATION_IDS)) {
    const q = new URLSearchParams(search(buildClassicHandoff({ destination: value, totalDays: 10, travelMonth: 10, travellerType: 'couple' }).href));
    assert.equal(q.get('dest_id'), id, value);
    assert.ok(q.get('dest_q'), `${value} always has the fallback text`);
  }
});

test('build: the search box alone carries only that text; an empty box carries nothing at all', () => {
  assert.equal(buildClassicHandoff({ queryText: '' }).href, '/find');
  assert.equal(buildClassicHandoff({ queryText: '   ' }).href, '/find');
  assert.equal(buildClassicHandoff({}).href, '/find');
  const typed = buildClassicHandoff({ queryText: ' Reykjavik ' });
  assert.equal(new URLSearchParams(search(typed.href)).get('dest_q'), 'Reykjavik');
  assert.deepEqual(typed.carried, { query: true, month: false, days: false, party: false, outOfRange: false, route: null });
});

test('build: carried search text is bounded', () => {
  const q = new URLSearchParams(search(buildClassicHandoff({ queryText: 'y'.repeat(900) }).href));
  assert.equal(q.get('dest_q').length, DEST_Q_MAX);
});

test('build: nothing identifying, and nothing beyond the contract, ever appears in the href', () => {
  const { href } = buildClassicHandoff({ destination: 'place:lima', totalDays: 12, travelMonth: 6, travellerType: 'family' });
  const names = [...new URLSearchParams(search(href)).keys()];
  assert.deepEqual(names.sort(), ['days', 'dest_q', 'month', 'party']);
  assert.ok(!/token|draft|trip|session|account|email/i.test(href));
});

// ── round trip: what is built is what is parsed ──────────────────────────────

test('round trip: the receiver reads exactly what the sender carried', () => {
  for (const n of [3, 7, 14]) {
    const { href } = buildClassicHandoff({ destination: 'country:PE', totalDays: n, travelMonth: 8, travellerType: 'friends' });
    assert.deepEqual(parsed(search(href)), { active: true, destQ: 'Peru', destId: null, month: '8', days: n, daysReq: null, party: 'friends', route: 'peru' });
  }
  for (const n of [1, 2, 15, 60]) {
    const { href } = buildClassicHandoff({ destination: 'country:CA', totalDays: n, travelMonth: 8, travellerType: 'solo' });
    assert.deepEqual(parsed(search(href)), { active: true, destQ: 'Canada', destId: null, month: '8', days: null, daysReq: n, party: 'just-me', route: 'eastern-canada' });
  }
});

test('destinationHandoff and durationHandoff agree with the table in section 5 and 6', () => {
  assert.deepEqual(destinationHandoff('country:US').query, 'New York City');
  assert.deepEqual(destinationHandoff('country:JP').query, 'Tokyo');
  assert.deepEqual(destinationHandoff('nonsense'), { query: '', id: null, route: null });
  assert.deepEqual(destinationHandoff('place:not_a_place'), { query: '', id: null, route: null });
  assert.deepEqual(durationHandoff(2), { days: null, daysReq: 2 });
  assert.deepEqual(durationHandoff(3), { days: 3, daysReq: null });
  assert.deepEqual(durationHandoff(14), { days: 14, daysReq: null });
  assert.deepEqual(durationHandoff(15), { days: null, daysReq: 15 });
  assert.equal(boundedQuery(undefined), '');
});

// ── route: the explanation-only parameter (owner amendment, 7 Oct 2026) ──────

test('build: only a Peru or Eastern Canada route carries a route name', () => {
  const expected = { 'country:PE': 'peru', 'country:CA': 'eastern-canada' };
  for (const [value, name] of Object.entries(expected)) {
    const built = buildClassicHandoff({ destination: value, totalDays: 10, travelMonth: 10, travellerType: 'couple' });
    assert.equal(new URLSearchParams(search(built.href)).get('route'), name, value);
    assert.equal(built.carried.route, name);
  }
  // A genuine single-record match is not a route, and neither is one place or typed text.
  for (const value of ['country:US', 'country:JP', 'place:cusco', 'place:montreal']) {
    const built = buildClassicHandoff({ destination: value, totalDays: 10, travelMonth: 10, travellerType: 'couple' });
    assert.equal(new URLSearchParams(search(built.href)).has('route'), false, value);
    assert.equal(built.carried.route, null, value);
  }
  assert.equal(new URLSearchParams(search(buildClassicHandoff({ queryText: 'Peru' }).href)).has('route'), false,
    'typing the word Peru is not choosing the Peru route');
});

test('parse: route accepts only the two known names and is otherwise ignored', () => {
  assert.equal(parsed('?route=peru').route, 'peru');
  assert.equal(parsed('?route=eastern-canada').route, 'eastern-canada');
  for (const bad of ['', 'Peru', 'PERU', 'peru ', 'japan', 'country:PE', '1', 'true', 'eastern_canada']) {
    assert.equal(parsed(`?route=${encodeURIComponent(bad)}`).route, null, JSON.stringify(bad));
  }
  // An unrecognised route alone is not a handoff at all.
  assert.equal(parsed('?route=japan').active, false);
  assert.equal(parsed('?route=peru').active, true);
});

test('parse: an unrecognised route costs nothing else, and route costs nothing either way', () => {
  const bad = parsed('?dest_q=Peru&route=japan&month=10&days=10&party=two');
  assert.deepEqual(bad, { active: true, destQ: 'Peru', destId: null, month: '10', days: 10, daysReq: null, party: 'two', route: null });
  const good = parsed('?dest_q=Peru&route=peru&month=10&days=10&party=two');
  assert.deepEqual({ ...good, route: null }, bad, 'route changes nothing but itself');
});

test('handoffNote: a route is never named as something that transferred', () => {
  const peru = buildClassicHandoff({ destination: 'country:PE', totalDays: 10, travelMonth: 10, travellerType: 'couple' });
  assert.equal(handoffNote(peru.carried), "We'll bring your month, trip length and who's coming.");
  assert.ok(!/route/i.test(handoffNote(peru.carried)));
});

// ── the sentence a link may say ──────────────────────────────────────────────

test('handoffNote: exact approved sentences', () => {
  const full = { query: true, month: true, days: true, party: true, outOfRange: false };
  assert.equal(handoffNote(full), "We'll bring your month, trip length and who's coming.");
  const out = { query: true, month: true, days: false, party: true, outOfRange: true };
  assert.equal(handoffNote(out), "We'll bring your month and who's coming. You'll need to choose a trip length there.");
  const typed = { query: true, month: false, days: false, party: false, outOfRange: false };
  assert.equal(handoffNote(typed), "We'll take what you typed with you.");
  assert.equal(handoffNote({ query: false, month: false, days: false, party: false, outOfRange: false }), '');
});

test('handoffNote: names only values that were actually carried', () => {
  assert.equal(handoffNote({ query: true, month: false, days: true, party: true, outOfRange: false }), "We'll bring your trip length and who's coming.");
  assert.equal(handoffNote({ query: true, month: true, days: false, party: false, outOfRange: false }), "We'll bring your month.");
  assert.ok(!/trip length/.test(handoffNote({ query: true, month: true, days: false, party: true, outOfRange: true }).split('. ')[0]), 'an uncarried length is not listed as carried');
});
