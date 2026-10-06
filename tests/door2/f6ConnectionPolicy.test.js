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

for(const policy of ['strict','allow_drafts'])for(const kind of ['reviewed','draft','admitted','copied','spoofed'])test('P1–P3 policy '+policy+'/'+kind,()=>{
 const d=fixture();if(kind==='draft')d.connections[0].reviewedAt=null;
 if(['admitted','copied','spoofed'].includes(kind))d.connections=[estimateConnection(input(),context()),estimateConnection(input('a','o'),context())].map(r=>kind==='admitted'?r:kind==='copied'?clone(r):{...clone(r),reviewedAt:time,approved:true});
 const allowed=kind==='reviewed'||kind==='admitted'||kind==='draft'&&policy==='allow_drafts';
 for(const result of [selectRoutes(spec,d,{reviewPolicy:policy}),buildF5Trip(spec,d,{reviewPolicy:policy,content:[]}),buildF6Trip(spec,d,{connectionContext:context(),reviewPolicy:policy,content:[]})]) assert.equal(result.ok,allowed);
 const skeleton=buildSkeletonTrip(spec,d,{reviewPolicy:policy});assert.equal(skeleton.ok!==false,allowed);
 if(allowed){assert.equal(skeleton.status,kind==='draft'?'draft':'valid');const seq=tripSequenceFromTrip(skeleton,{id:'s',data:d});assert.equal(materialiseTripSequence(seq,d).ok,true);assert.equal(buildTripFromRoutePlan(spec,skeleton.routePlan,d,{reviewPolicy:policy}).ok!==false,true);}
 else if(kind!=='draft'){const legacy=buildSkeletonTrip(spec,fixture());const seq=tripSequenceFromTrip(legacy,{id:'s',data:fixture()});seq.entries[0].inboundConnectionId=d.connections[0].id;seq.returnConnectionId=d.connections[1].id;assert.throws(()=>materialiseTripSequence(seq,d),/estimator_not_admitted/);}
});
test('R8 independent validator catches shortened reverse despite consistent arrival',()=>{
 const d=fixture({reverse:{durationHours:3}});const route=buildRouteResult(d.routePackages[0],spec,d).routeResult;const scheduled=scheduleRoute(route,spec,d);const back=scheduled.value.days[2].blocks.find(b=>b.type==='travel');back.durationHours-=1;back.transport.inVehicleHours-=1;back.transport.computedUsableTimeLost-=1;back.transport.arriveTime='12:30';scheduled.value.homeArrival.time='12:30';assert.throws(()=>validateSkeleton(scheduled.value,route,spec,d),/F6 directional/);
});
test('R8 independent validator honors custom buffers',()=>{const d=fixture({reverse:{durationHours:3}});const route=buildRouteResult(d.routePackages[0],spec,d).routeResult;const bufferRuleset={...DEFAULT_BUFFER_RULESET,modes:{...DEFAULT_BUFFER_RULESET.modes,train:{preHours:1,postHours:1}}};const s=scheduleRoute(route,spec,d,{bufferRuleset});assert.equal(s.value.days[0].blocks[0].durationHours,4.75);assert.equal(validateSkeleton(s,route,spec,d,{bufferRuleset}).ok,true);assert.throws(()=>validateSkeleton(s,route,spec,d),/F6 directional/);});
test('P4 absent context preserves successes and failures, null refuses',()=>{for(const days of [1,3,20])assert.deepEqual(buildF6Trip({...spec,totalDays:days},fixture()),buildF5Trip({...spec,totalDays:days},fixture()));assert.equal(buildF6Trip(spec,fixture(),{connectionContext:null}).detail.phase,'pre_validation');});
test('CTX1–CTX3 exact malformed time/endpoints and first-error order',()=>{
 const c=context();c.generatedAt='not-a-date';c.estimates=[{toPlaceId:'a'}];let r=preflightConnectionContext(c);assert.deepEqual(r,{ok:false,state:'route_not_supported',message:"We couldn't start this plan because required planning information is missing or invalid. Your trip has not changed.",options:[{action:'check_back_later',detail:'Start a new plan to try again.'}],detail:{reason:'connection_context_invalid',phase:'pre_validation',field:'connectionContext.generatedAt',issue:'invalid'}});
 c.generatedAt=time;r=preflightConnectionContext(c);assert.equal(r.detail.field,'connectionContext.estimates[0].fromPlaceId');assert.equal(r.detail.issue,'missing');c.sequenceId=' ';assert.equal(preflightConnectionContext(c).detail.field,'connectionContext.sequenceId');c.z=1;c.a=2;assert.equal(preflightConnectionContext(c).detail.field,'connectionContext.a');
});
test('CTX4 preflight does not inspect graph or construct evidence',()=>{const graph=new Proxy({}, {get(){throw Error('graph touched');}});const r=buildF6Trip(spec,graph,{connectionContext:{...context(),generatedAt:'bad'}});assert.equal(r.evidence,undefined);assert.equal(r.sequence,undefined);});
test('CTX5 later domain refusal retains real identifiers and time',()=>{const i=input();i.mode='train';const r=buildF6Trip(spec,fixture(),{connectionContext:context([i])});assert.equal(r.detail.reason,'estimation_domain_unsupported');assert.equal(r.evidence.generatedAt,time);assert.equal(r.evidence.entries[0].values.suppliedPair.fromPlaceId,'o');});
test('CTX5 estimated duration refusal retains facts for adjustment',()=>{const r=estimated(1);assert.equal(r.ok,false);assert.ok(r.options.some(o=>o.action==='extend'));assert.equal(r.evidence.entries.length,2);assert.equal(r.evidence.entries[0].values.blockId,null);assert.equal(r.evidence.entries[0].values.assessedRoutePackageId,'r');});

test('R8 segmented and excursion corruption cannot pass independent duration or arrival checks', () => {
  const d = fixture({ mode: 'flight_international', inVehicleHours: 5, segments: [{ mode: 'flight_international', inVehicleHours: 2 }, { mode: 'flight_international', inVehicleHours: 3 }], reverse: { durationHours: 6, segments: [{ mode: 'flight_international', inVehicleHours: 3.5 }, { mode: 'flight_international', inVehicleHours: 2.5 }] } });
  const route = buildRouteResult(d.routePackages[0], spec, d).routeResult;
  const good = scheduleRoute(route, spec, d);
  for (const clockOnly of [true, false]) {
    const bad = clone(good);
    const b = bad.value.days[2].blocks.find(b => b.type === 'travel');
    b.transport.arriveTime = '18:15'; bad.value.homeArrival.time = '18:15';
    if (!clockOnly) { b.transport.inVehicleHours--; b.transport.computedUsableTimeLost--; b.durationHours--; }
    assert.throws(() => validateSkeleton(bad, route, spec, d), /F6/);
  }
  const exData = fixture();
  exData.connections.push({ id: 'ex', fromPlaceId: 'a', toPlaceId: 'x', direction: 'bidirectional', mode: 'road_private_transfer', inVehicleHours: .5, reverse: { durationHours: 1 }, localTransferHours: { origin: .25, destination: .25 }, reviewedAt: time, reviewedBy: 'fixture reviewer' });
  exData.routePackages[0].stops[0].excursions = [{ placeId: 'x', connectionId: 'ex', hoursOnSite: 2 }];
  const exRoute = buildRouteResult(exData.routePackages[0], spec, exData).routeResult;
  const bad = scheduleRoute(exRoute, spec, exData);
  const back = bad.value.days[0].blocks.find(b => b.id.endsWith(':back'));
  back.transport.inVehicleHours = .5; back.transport.computedUsableTimeLost = 1.2; back.durationHours = 1.2; back.transport.arriveTime = '16:54';
  assert.throws(() => validateSkeleton(bad, exRoute, spec, exData), /F6 directional/);
});

test('P1/P2 independent validation refuses copied estimates under both policies', () => {
  const d = fixture(); d.connections = [estimateConnection(input(), context()), estimateConnection(input('a', 'o'), context())];
  const route = buildRouteResult(d.routePackages[0], spec, d).routeResult;
  const result = scheduleRoute(route, spec, d);
  for (const reviewPolicy of ['strict', 'allow_drafts']) {
    assert.equal(validateSkeleton(result, route, spec, d, { reviewPolicy }).ok, true);
    assert.equal(validateSkeleton(result, route, spec, { ...d, connections: clone(d.connections) }, { reviewPolicy }).detail.reason, 'estimator_not_admitted');
  }
});


test('review regression: explicit curated route retains estimated alternatives assessed by F5', () => {
  const d = fixture();
  d.places.b = { ...d.places.a, id: 'b', name: 'b', coordinates: { lat: 0, lng: 18 } };
  d.routePackages.push({ ...clone(d.routePackages[0]), id: 'B', name: 'B', placeIds: ['b'], stops: [{ id: 'sb', placeId: 'b', minNights: 2, maxNights: 5, excursions: [] }] });
  const c = context([input('o', 'b', [[0,0],[0,18]]), input('b', 'o', [[0,18],[0,0]])]);
  const before = clone({ d, c });
  const prepared = { ...d, connections: [...d.connections, ...c.estimates.map(i => estimateConnection(i, c))] };
  for (const routeTemplateId of [null, 'r']) {
    const request = { ...spec, totalDays: 5, routeTemplateId };
    const actual = buildF6Trip(request, d, { connectionContext: c, content: [] });
    const expected = buildF5Trip(request, prepared, { content: [] });
    assert.equal(actual.ok, true);
    assert.deepEqual(actual.value.alternatives, expected.value.alternatives);
    assert.ok(actual.value.alternatives.some(r => r.routePackageId === 'B'));
    if (routeTemplateId) { assert.equal(actual.value.trip.spec.routeTemplateId, 'r'); assert.deepEqual(actual.value.trip.routePlan, expected.value.trip.routePlan); }
  }
  // A duration refusal must retain A as the constraint while offering fitting B.
  d.routePackages[0].stops[0].minNights = 6;
  d.routePackages[0].stops[0].maxNights = 8;
  const refused = buildF6Trip({ ...spec, totalDays: 5, routeTemplateId: 'r' }, d, { connectionContext: c, content: [] });
  assert.equal(refused.ok, false);
  assert.ok(refused.options.some(o => o.action === 'alternate_route' && o.routePackageId === 'B'));
  assert.equal(refused.evidence.entries.length, 2);
  assert.ok(refused.evidence.entries.every(e => e.values.assessedRoutePackageId === 'B' && e.values.blockId === null));
  d.routePackages[0].stops[0].minNights = 2;
  d.routePackages[0].stops[0].maxNights = 5;
  assert.deepEqual({ d, c }, before);
});

test('review regression: unavailable estimator preserves every supplied directed pair without timing', () => {
  const c = { ...context([input(), input('a', 'o', [[0,9],[0,0]])]), estimatorRulesetVersion: 'flight-gc-v2' };
  const r = buildF6Trip(spec, fixture(), { connectionContext: c, content: [] });
  assert.equal(r.ok, false);
  assert.equal(r.detail.reason, 'estimation_domain_unsupported');
  assert.equal(r.evidence.generatedAt, time);
  assert.equal(r.evidence.entries.length, 2);
  for (const [i, e] of r.evidence.entries.entries()) {
    const supplied = c.estimates[i];
    assert.equal(e.code, 'connection_estimation_refused');
    assert.equal(e.refId, `est:flight-gc-v2:${supplied.fromPlaceId}:${supplied.toPlaceId}`);
    assert.deepEqual(e.values.suppliedPair, { fromPlaceId: supplied.fromPlaceId, toPlaceId: supplied.toPlaceId });
    assert.equal(e.values.estimatorRulesetVersion, 'flight-gc-v2');
    assert.equal(e.values.blockId, null);
    assert.equal(e.values.field, 'estimatorRulesetVersion');
    assert.equal(e.values.reason, 'estimation_domain_unsupported');
    assert.equal(e.values.timing, undefined);
  }
});
