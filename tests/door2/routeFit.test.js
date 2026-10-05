import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildF5Trip, buildFilledTrip, PILOT_DATA, resolveExcursions } from '../../src/lib/door2/planner.js';
import { selectRoutes } from '../../src/lib/door2/route.js';
import { previewAdjustNights } from '../../src/lib/door2/restructure.js';
import { compileFamilies } from '../../src/lib/door2/families.js';
import { DEFAULT_BUFFER_RULESET } from '../../src/lib/door2/bufferRuleset.js';
import { SCHEDULE_CONFIG } from '../../src/lib/door2/scheduleConfig.js';
import { synBundle, synSpec } from './helpers/syntheticHub.js';

const spec = (id, totalDays, routeTemplateId = null, extra = {}) => ({
  originPlaceId: 'vancouver', destination: { kind: 'country', id }, totalDays,
  travelMonth: 10, travellerType: 'couple', interests: [], pace: 'balanced', budget: 'mid',
  routeTemplateId, requiredPlaceIds: [], stops: [], choices: { pinned: [], rejected: [], placed: [] }, ...extra
});
const jp = 'tokyo_city', kyoto = `${jp}+kyoto@after_tokyo`;
const core = 'ec_corridor#west_to_east', reverse = 'ec_corridor#east_to_west';
const both = `${core}+ottawa@corridor+niagara@toronto_spur`;
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const tripOf = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r.value.trip; };
function freeze(v) { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }

for (const [country, days, expected] of [
  ['JP', 7, jp], ['JP', 10, kyoto], ['JP', 14, kyoto], ['JP', 18, kyoto],
  ['PE', 10, 'peru_classic'], ['PE', 12, 'peru_classic+huaraz@after_lima_in'], ['CA', 12, both]
]) test(`F5 defaults: ${country}/${days} → ${expected}`, () => {
  const r = buildF5Trip(spec(country, days));
  assert.equal(tripOf(r).routePlan.variantId, expected);
  assert.ok(r.value.alternatives.every((a) => a.routePackageId !== expected));
  assert.ok(!tripOf(r).warnings.includes('nights_above_package_max'));
});

test('F5 all served route boundaries are inclusive, with usable lower/upper adjustments', () => {
  const measured = [ [jp, 'JP', 5, 12], [kyoto, 'JP', 8, 18], ['peru_classic', 'PE', 8, 14],
    ['peru_classic+huaraz@after_lima_in', 'PE', 11, 18], ['peru_classic+huaraz@after_machu_picchu', 'PE', 11, 19],
    ['nyc_city', 'US', 3, 11] ];
  for (const direction of [core, reverse]) for (const [suffix, min, max] of [['',6,12], ['+ottawa@corridor',7,14], ['+niagara@toronto_spur',8,15], ['+ottawa@corridor+niagara@toronto_spur',9,17]]) {
    measured.push([direction + suffix, 'CA', min, max]);
  }
  assert.equal(measured.length, PILOT_DATA.routePackages.length);
  for (const [id, country, min, max] of measured) {
    for (const n of [min, max]) {
      const t = tripOf(buildF5Trip(spec(country, n, id)));
      assert.equal(t.routePlan.variantId, id); assert.equal(t.routePlan.minDays, min); assert.equal(t.routePlan.maxDays, max);
    }
    const short = buildF5Trip(spec(country, min - 1, id));
    assert.equal(short.state, 'duration_too_short', id);
    assert.equal(short.options.find((o) => o.action === 'extend').days, 1);
    const long = buildF5Trip(spec(country, max + 1, id));
    assert.equal(long.state, 'route_not_supported', id);
    assert.deepEqual(long.options.filter((o) => o.action === 'set_duration').map((o) => o.totalDays), [max]);
  }
});

test('F5 skips missing first-route transport; legacy refusal and explicit refusal remain', () => {
  const data = { ...PILOT_DATA, connections: PILOT_DATA.connections.filter((c) => c.id !== 'conn_yyz_yul_train') };
  assert.equal(selectRoutes(spec('CA',12), data).state, 'connection_unreviewed');
  assert.equal(tripOf(buildF5Trip(spec('CA',12), data)).routePlan.variantId, both);
  const r = buildF5Trip(spec('CA',12,core), data);
  assert.equal(r.state, 'connection_unreviewed'); assert.equal(r.detail.reason, 'missing');
  assert.ok(r.options.some((o) => o.action === 'alternate_route' && o.routePackageId === both));
});

test('F5 explicit route, aliases, required-place recovery, unknown and held constraints', () => {
  assert.equal(tripOf(buildF5Trip(spec('JP',10,jp))).routePlan.variantId, jp);
  const pkg = PILOT_DATA.routePackages.find((p) => p.id === 'peru_classic+huaraz@after_lima_in');
  assert.ok(pkg.aliases.length > 0, 'exercise actual legacy aliases');
  for (const alias of pkg.aliases) assert.equal(tripOf(buildF5Trip(spec('PE',12,alias))).routePlan.variantId, pkg.id);
  const r = buildF5Trip(spec('JP',10,jp,{requiredPlaceIds:['kyoto']}));
  assert.equal(r.state, 'route_not_supported'); assert.equal(r.detail.reason, 'route_constraint_incompatible');
  assert.deepEqual(r.options.filter((o) => o.action === 'remove_place').map((o) => o.placeId), ['kyoto']);
  assert.equal(tripOf(buildF5Trip(spec('JP',10,null,{requiredPlaceIds:['kyoto']}))).routePlan.variantId, kyoto);
  assert.equal(buildF5Trip(spec('JP',10,'nonexistent')).state, 'route_not_supported');
  const data = { ...PILOT_DATA, routePackages: PILOT_DATA.routePackages.map((p) => p.id === kyoto ? {...p, held:true} : p) };
  assert.equal(tripOf(buildF5Trip(spec('JP',10), data)).routePlan.variantId, jp);
  assert.equal(buildF5Trip(spec('JP',10,kyoto), data).state, 'route_not_supported');
});

test('F5 coverage and review failures stay distinct from length failures', () => {
  for (const [s, state, reason] of [
    [spec('JP',10,null,{originPlaceId:'unknown'}), 'route_not_supported', 'origin_unknown'],
    [spec('XX',10), 'destination_not_covered', 'country_unknown'],
    [spec('JP',10,null,{requiredPlaceIds:['unknown']}), 'destination_not_covered', 'place_unknown']
  ]) { const r=buildF5Trip(s); assert.equal(r.state,state); assert.equal(r.detail.reason,reason); }
  const data = { ...PILOT_DATA, connections: PILOT_DATA.connections.map((c) => c.id === 'conn_yyz_yul_train' ? {...c, reviewedAt:null} : c) };
  assert.equal(buildF5Trip(spec('CA',12,core),data).state,'connection_unreviewed');
  assert.equal(tripOf(buildF5Trip(spec('CA',12),data)).routePlan.variantId,both);
  assert.equal(tripOf(buildF5Trip(spec('CA',12,core),data,{reviewPolicy:'allow_drafts'})).routePlan.variantId,core);
  assert.throws(() => buildF5Trip(spec('JP',10),PILOT_DATA,{reviewPolicy:'typo'}), /reviewPolicy/);
});

test('F5 disjoint 5–7/10–12 ranges refuse eight honestly; every adjustment works', () => {
  const base = PILOT_DATA.routePackages.find((p) => p.id === jp);
  const packages = [[jp,3,5],[kyoto,8,10]].map(([id,minNights,maxNights]) => ({...base,id,variantId:id,
    stops:base.stops.map((s)=>({...s,minNights,maxNights}))}));
  const data = {...PILOT_DATA,routePackages:packages,allRoutePackages:packages};
  const r = buildF5Trip(spec('JP',8),data);
  assert.equal(r.state,'route_not_supported'); assert.equal(r.detail.reason,'duration_gap');
  assert.equal(r.detail.requestedDays,8);
  assert.deepEqual(r.detail.supportedRanges,[{routePackageId:jp,minDays:5,maxDays:7},{routePackageId:kyoto,minDays:10,maxDays:12}]);
  assert.match(r.message,/5–7 or 10–12/);
  assert.deepEqual(r.options.map((o)=>[o.action,o.totalDays]),[['set_duration',7],['set_duration',10]]);
  for (const o of r.options) assert.equal(tripOf(buildF5Trip(spec('JP',o.totalDays),data)).spec.totalDays,o.totalDays);
  assert.deepEqual(buildF5Trip(spec('JP',8,jp),data).options.filter(o=>o.action==='set_duration').map(o=>o.totalDays),[7]);
});

test('F5 scheduler options and resolved effective excursion minima determine ranking', () => {
  const B=synBundle(compileFamilies), request=synSpec(7,{routeTemplateId:null});
  const pkg=B.data.routePackages.find(p=>p.id==='syn_hub+spur@after_base');
  const resolved=resolveExcursions(pkg,{pt_base:['douro']},request,B.data);
  assert.equal(resolved.ok,true); assert.equal(resolved.effectiveMinNights.pt_base,3);
  const competitor={...pkg,id:'competitor',variantId:'competitor',aliases:[]};
  const data={...B.data,routePackages:[competitor,resolved.pkg],allRoutePackages:[competitor,resolved.pkg]};
  const six=buildF5Trip({...request,totalDays:6},data,{content:B.content});
  assert.equal(tripOf(six).routePlan.variantId,'competitor');
  const seven=tripOf(buildF5Trip(request,data,{content:B.content}));
  assert.equal(seven.routePlan.variantId,pkg.id,'effective min7 outranks authored min6 despite catalogue order');
  assert.equal(seven.routePlan.minDays,7);
  assert.ok(seven.days.some(d=>d.blocks.some(b=>b.id.includes('douro') && b.id.endsWith(':site'))));
  const config={...SCHEDULE_CONFIG,dayStartHour:11};
  const normal=tripOf(buildF5Trip(spec('JP',7),PILOT_DATA,{config}));
  assert.deepEqual(normal,buildFilledTrip(spec('JP',7,jp),PILOT_DATA,{config}));
});

test('F5 malformed candidates: known authoring failures skipped, data-integrity errors thrown', () => {
  const base=PILOT_DATA.routePackages.find(p=>p.id===jp);
  const broken={...base,id:'broken',stops:base.stops.map(s=>({...s,minNights:0,maxNights:0,excursions:[{placeId:'nikko',connectionId:'conn_tyo_nikko_train',hoursOnSite:100}]}))};
  const data={...PILOT_DATA,routePackages:[broken,base]};
  assert.equal(tripOf(buildF5Trip(spec('JP',7),data)).routePlan.variantId,jp);
  assert.equal(buildF5Trip(spec('JP',7,'broken'),data).state,'route_not_supported');
  assert.throws(()=>buildF5Trip(spec('JP',7),{...data,routePackages:[{...base,stops:[{...base.stops[0],placeId:'missing'}]}]}),/unknown placeId/);
});

test('F5 preserves frozen input/catalogue, legacy Peru intake, and exact-maximum frozen response', () => {
  const data=freeze(structuredClone(PILOT_DATA)), request=freeze(spec('PE',12));
  const before=JSON.stringify([request,data]);
  buildF5Trip(request,data);
  assert.equal(JSON.stringify([request,data]),before);
  const peru=JSON.parse(readFileSync(new URL('./fixtures/peru-pre-c3a.json',import.meta.url)));
  // Frozen generator uses this exact spec (independently exercised by C3a-T8).
  const legacySpec={originPlaceId:'vancouver',destination:{kind:'country',id:'PE'},travelMonth:10,totalDays:12,travellerType:'couple',interests:[],pace:'balanced',budget:'mid',requiredPlaceIds:[],routeTemplateId:null,stops:[],choices:{pinned:[],rejected:[],placed:[]}};
  assert.equal(hash(buildFilledTrip(legacySpec)),peru.intake['PE:12']);
  const exact=previewAdjustNights(buildFilledTrip(spec('JP',12,jp)),'tokyo_base',1);
  assert.equal(exact.message,'10 nights is the most that works in Tokyo.');
  assert.equal(hash(exact),'123df831bb07c4857547cf83445050ff4091a62b0cf6c5380874d5307e44f66e');
  const over=previewAdjustNights(buildFilledTrip(spec('JP',14,jp)),'tokyo_base',1);
  assert.equal(over.message,"You're already staying 12 nights in Tokyo, beyond this route's usual limit of 10. We can't add another night here.");
  const pass=previewAdjustNights(buildFilledTrip(spec('PE',12)),'pc_olly_return',1);
  assert.match(pass.message,/stop on the way; the route doesn't stay overnight there/);
});


test('F5 equal-minimum ties follow catalogue order and required-place removals stay viable', () => {
  const data={...PILOT_DATA,routePackages:[...PILOT_DATA.routePackages].reverse()};
  assert.equal(tripOf(buildF5Trip(spec('CA',6),data)).routePlan.variantId,reverse);
  const constrained=spec('PE',9,null,{requiredPlaceIds:['huaraz','machu_picchu']});
  const r=buildF5Trip(constrained);
  assert.equal(r.state,'required_place_conflict');
  assert.equal(r.options.find(o=>o.action==='extend').days,2);
  assert.deepEqual(r.options.filter(o=>o.action==='remove_place').map(o=>o.placeId),['huaraz']);
  const blocked=buildF5Trip({...constrained,routeTemplateId:'peru_classic+huaraz@after_lima_in'});
  assert.equal(blocked.options.some(o=>o.action==='remove_place'),false,'dropping a requirement cannot shorten the explicit Huaraz route');
});

test('F5 custom buffer rules affect effective ranges and are also used for the final trip', () => {
  const bufferRuleset={...DEFAULT_BUFFER_RULESET,id:'f5_test_buffer',modes:{...DEFAULT_BUFFER_RULESET.modes,
    flight_international:{preHours:26.5,postHours:1}}};
  const tooShort=buildF5Trip(spec('JP',5,jp),PILOT_DATA,{bufferRuleset});
  assert.equal(tooShort.state,'duration_too_short');
  const target=5+tooShort.options.find(o=>o.action==='extend').days;
  assert.ok(target>5);
  const t=tripOf(buildF5Trip(spec('JP',target,jp),PILOT_DATA,{bufferRuleset}));
  assert.deepEqual(t,buildFilledTrip(spec('JP',target,jp),PILOT_DATA,{bufferRuleset}));
  assert.equal(t.routePlan.minDays,target);
});
