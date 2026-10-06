import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildF6Trip, preflightConnectionContext } from '../../src/lib/door2/connectionBuild.js';
import { buildF5Trip, buildFilledTrip, buildSkeletonTrip, buildTripFromRoutePlan, PILOT_DATA } from '../../src/lib/door2/planner.js';
import { decorateConnections, inspectEvidence, connectionDisplay } from '../../src/lib/door2/connectionEvidence.js';
import { estimateConnection, distanceKm, isAdmitted } from '../../src/lib/door2/connectionEstimator.js';
import { orientConnection, DEFAULT_BUFFER_RULESET } from '../../src/lib/door2/bufferRuleset.js';
import { buildRouteResult, selectRoutes } from '../../src/lib/door2/route.js';
import { scheduleRoute } from '../../src/lib/door2/schedule.js';
import { validateSkeleton } from '../../src/lib/door2/validate.js';
import { tripSequenceFromTrip } from '../../src/lib/door2/tripSequence.js';
import { materialiseTripSequence } from '../../src/lib/door2/materialise.js';
import { validateConnection, validateCatalogue } from '../../src/lib/door2/connectionModel.js';
const time = '2026-10-05T12:00:00.000Z';
const source = { sourceUrl: 'https://example.invalid/fictional', observedAt: time };
const clone = v => structuredClone(v);
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const context = estimates => ({ schemaVersion: 1, sequenceId: 'fixture-session-1', generatedAt: time, estimatorRulesetVersion: 'flight-gc-v1', estimates: estimates ?? [] });
const spec = { originPlaceId: 'o', destination: {kind:'country', id:'JP'}, totalDays:3, requiredPlaceIds:[], routeTemplateId:null, travellerType:'solo', interests:[], pace:'balanced', budget:'mid', choices:{pinned:[],rejected:[],placed:[]} };
function fixture(connection = {}) {
 const place = (id,lng) => ({id,name:id,countryId:'JP',coordinates:{lat:0,lng},utcOffsetHours:0,visitKind:'base',aliases:[]});
 const row={id:'c',fromPlaceId:'o',toPlaceId:'a',direction:'bidirectional',mode:'train',inVehicleHours:2,localTransferHours:{origin:.5,destination:.25},reviewedBy:'fixture reviewer',reviewedAt:time,version:1,...connection};
 const pkg={id:'r',name:'Fixture',countryId:'JP',placeIds:['a'],stops:[{id:'s',placeId:'a',minNights:2,maxNights:5,excursions:[]}]};
 return {places:{o:place('o',0),a:place('a',9),x:{...place('x',10),visitKind:'attraction'}},connections:[row],routePackages:[pkg]};
}
function input(from='o',to='a',points=[[0,0],[0,9]]) {
 const airport=(point,i)=>({key:'airport-'+point.join('-'),lat:point[0],lng:point[1],countryId:'JP',...source});
 return {fromPlaceId:from,toPlaceId:to,mode:'flight_international',segments:points.slice(1).map((p,i)=>({fromAirport:airport(points[i],i),toAirport:airport(p,i+1),serviceSourceUrl:source.sourceUrl,observedAt:time})),layoverHours:points.length===3?1.5:0,...(points.length===3?{layoverSource:{...source}}:{}),localTransferHours:{origin:.5,destination:.5},localTransferSources:{origin:{...source},destination:{...source}},...source};
}
function estimated(days=3) { const data=fixture();data.connections=[];return buildF6Trip({...spec,totalDays:days},data,{connectionContext:context([input(),input('a','o',[[0,9],[0,0]])]),content:[]}); }
const blocks = t => t.days.flatMap(d=>d.blocks).filter(b=>b.type==='travel');
const experience=(patch={})=>({id:'cx_fixture_view',title:'Fictional train view',description:'A synthetic view during this journey.',appliesTo:'both',timeCost:'within_connection',review:{status:'approved',reviewedBy:'fixture reviewer',reviewedAt:time,sourceUrl:source.sourceUrl},provenance:{sourceBundleId:'fixture',sourceTemplateTitle:'transfer',sourceFragmentId:'view'},...patch});

for (const [points,km,hours,minutes] of [ [[[0,0],[0,9]],1000.754339801027,1.743679834518,375], [[[0,0],[0,18]],2001.508679602058,2.987359669035,449], [[[0,179],[0,-179]],222.389853289112,.776373296559,317], [[[40,-73],[51,0]],5578.84341002593,7.433065161986,716] ]) test('E1 reference '+JSON.stringify(points),()=>{
 const i=input('o','a',points);const r=estimateConnection(i,context());assert.ok(Math.abs(distanceKm(i.segments[0].fromAirport,i.segments[0].toAirport)-km)<1e-6);assert.ok(Math.abs(r.inVehicleHours-hours)<1e-8);
 const d=fixture();d.connections=[r,estimateConnection(input('a','o',[...points].reverse()),context())];const s=buildSkeletonTrip(spec,d);assert.equal(blocks(s)[0].durationHours*60,minutes);
});
test('E1 two segments round once and use explicit layover',()=>{const row=estimateConnection(input('o','a',[[0,0],[0,9],[0,18]]),context());assert.ok(Math.abs(row.inVehicleHours-3.487359669035)<1e-8);const d=fixture();d.connections=[row,estimateConnection(input('a','o'),context())];assert.equal(blocks(buildSkeletonTrip(spec,d))[0].durationHours*60,569);});
test('E2 poles, antipodes and date line use short arc',()=>{assert.ok(Math.abs(distanceKm({lat:0,lng:0},{lat:0,lng:180})-Math.PI*6371)<1e-8);assert.ok(Number.isFinite(distanceKm({lat:90,lng:0},{lat:-90,lng:180})));});
for(const [name,mutate] of [ ['zero',i=>i.segments[0].toAirport=clone(i.segments[0].fromAirport)],['latitude',i=>i.segments[0].fromAirport.lat=91],['source',i=>i.sourceUrl='http://example.invalid'],['unknown mode',i=>i.mode='train'],['mixed segment',i=>i.segments[0].mode='train'],['missing local',i=>delete i.localTransferHours.origin],['extra segment',i=>i.segments.push(...clone(i.segments),...clone(i.segments))],['layover',i=>i.layoverHours=1],['extra property',i=>i.approved=true] ]) test('E3/E5 reject '+name,()=>{const i=input();mutate(i);assert.throws(()=>estimateConnection(i,context()));});
for(const mutate of [i=>delete i.layoverHours,i=>i.layoverHours=0,i=>delete i.layoverSource,i=>i.segments[1].fromAirport.key='wrong'])test('E4 connecting input invalid '+mutate.toString(),()=>{const i=input('o','a',[[0,0],[0,9],[0,18]]);mutate(i);assert.throws(()=>estimateConnection(i,context()));});
test('E6 identical context yields identical trips without mutating facts',()=>{assert.deepEqual(estimated(),estimated());const d=freeze(fixture());const c=freeze(context());buildF6Trip(spec,d,{connectionContext:c});});
test('E7 curated draft wins over estimate facts; one-way opposite does not',()=>{
 const d=fixture({reviewedAt:null});const c=context([input(),input('a','o')]);assert.equal(buildF6Trip(spec,d,{connectionContext:c}).state,'connection_unreviewed');assert.equal(buildF6Trip(spec,d,{connectionContext:c,reviewPolicy:'allow_drafts'}).value.trip.evidence,undefined);
 d.connections[0].direction='oneway';d.connections[0].reviewedAt=time;const r=buildF6Trip(spec,d,{connectionContext:c});assert.equal(r.ok,true);assert.equal(r.value.trip.evidence.entries.length,1);assert.equal(r.value.trip.evidence.entries[0].values.fromPlaceId,'a');
});
test('E8 complete automatic candidate survives missing optional facts; explicit remains refused',()=>{
 const d=fixture();d.places.b={...d.places.a,id:'b'};const broken={...clone(d.routePackages[0]),id:'broken',placeIds:['b'],stops:[{...clone(d.routePackages[0].stops[0]),placeId:'b'}]};d.routePackages.unshift(broken);
 assert.equal(buildF6Trip(spec,d,{connectionContext:context()}).value.trip.routePlan.variantId,'r');assert.equal(buildF6Trip({...spec,routeTemplateId:'broken'},d,{connectionContext:context()}).ok,false);
});
test('E3 supplied origin validates fixed offsets and cannot override catalogue',()=>{
 const d=fixture();const origin={...d.places.o,...source,offsetBasis:'fixed-pilot'};for(const offset of [15,.0001,NaN])assert.equal(buildF6Trip(spec,d,{connectionContext:{...context(),origin:{...origin,utcOffsetHours:offset}}}).detail.reason,'estimation_input_invalid');
 assert.equal(buildF6Trip(spec,d,{connectionContext:{...context(),origin:{...origin,name:'replacement'}}}).ok,false);
});

test('E1 supplied offsets affect actual outbound and return clocks', () => {
  const d = fixture(); d.places.a.utcOffsetHours = 2; d.connections = [];
  const result = buildF6Trip(spec, d, { connectionContext: context([input(), input('a', 'o', [[0, 9], [0, 0]])]), content: [] });
  assert.equal(result.ok, true);
  assert.deepEqual(blocks(result.value.trip).map(b => b.transport.arriveTime), ['17:15', '13:15']);
});

test('E7 preferred curated gateway remains authoritative and no estimate bypasses its draft', () => {
  const d = fixture({ gatewayId: 'first' });
  d.connections.push({ ...d.connections[0], id: 'preferred', gatewayId: 'preferred', reviewedAt: null });
  d.routePackages[0].preferredGatewayId = 'preferred';
  const ctx = context([input(), input('a', 'o')]);
  assert.equal(buildF6Trip(spec, d, { connectionContext: ctx }).state, 'connection_unreviewed');
  const allowed = buildF6Trip(spec, d, { connectionContext: ctx, reviewPolicy: 'allow_drafts' });
  assert.deepEqual(allowed.value.trip.routePlan.connectionIds, ['preferred', 'preferred']);
  assert.equal(allowed.value.trip.evidence, undefined);
});

test('E3/P5 arbitrary source-backed origin is request-local and retained only as display evidence', () => {
  const d = fixture(); delete d.places.o; d.connections = [];
  const origin = { id: 'o', name: 'Fictional new origin', aliases: [], countryId: 'JP', coordinates: { lat: 0, lng: 0 }, visitKind: 'base', utcOffsetHours: 0, ...source, offsetBasis: 'fixed-pilot' };
  const c = freeze({ ...context([input(), input('a', 'o')]), origin });
  const before = JSON.stringify(d);
  const result = buildF6Trip(spec, d, { connectionContext: c, content: [] });
  assert.equal(result.ok, true); assert.equal(JSON.stringify(d), before);
  assert.deepEqual(result.value.trip.evidence.entries[0].values.originSnapshot, origin);
  const without = buildF6Trip(spec, d, { connectionContext: context() });
  assert.equal(without.detail.reason, 'origin_unknown');
});
