import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildF6Trip, preflightConnectionContext } from '../../src/lib/door2/connectionBuild.js';
import { buildF5Trip, buildFilledTrip, buildSkeletonTrip, buildTripFromRoutePlan, PILOT_DATA } from '../../src/lib/door2/planner.js';
import { decorateConnections, inspectEvidence, connectionDisplay } from '../../src/lib/door2/connectionEvidence.js';
import { estimateConnection, distanceKm, isAdmitted } from '../../src/lib/door2/connectionEstimator.js';
import { orientConnection, DEFAULT_BUFFER_RULESET } from '../../src/lib/door2/bufferRuleset.js';
import { buildRouteResult, selectRoutes } from '../../src/lib/door2/route.js';
import { SCHEDULE_CONFIG } from '../../src/lib/door2/scheduleConfig.js';
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

test('R1 direct reverse actual clocks, return home and immutable input',()=>{
 const data=freeze(fixture({reverse:{durationHours:3}}));const before=JSON.stringify(data);
 const r=buildF6Trip(spec,data,{connectionContext:context(),content:[]});assert.equal(r.ok,true);
 const [out,back]=blocks(r.value.trip);assert.equal(out.transport.arriveTime,'12:30');assert.equal(back.transport.arriveTime,'13:30');assert.equal(back.transport.arriveDayNumber,3);
 assert.equal(out.durationHours,3.5);assert.equal(back.durationHours,4.5);assert.deepEqual(orientConnection(data.connections[0],'a','o').localTransferHours,{origin:.25,destination:.5});assert.equal(JSON.stringify(data),before);
});
test('R2 segmented reverse actual outbound/home clocks',()=>{
 const data=fixture({mode:'flight_international',inVehicleHours:5,segments:[{mode:'flight_international',inVehicleHours:2},{mode:'flight_international',inVehicleHours:3}],layoverHours:1,localTransferHours:{origin:.5,destination:.75},reverse:{durationHours:6,segments:[{mode:'flight_international',inVehicleHours:3.5},{mode:'flight_international',inVehicleHours:2.5}],layoverHours:.5,transfers:1}});
 const r=buildF6Trip(spec,data,{connectionContext:context(),content:[]});assert.equal(r.ok,true);const [a,b]=blocks(r.value.trip);assert.equal(a.durationHours*60,645);assert.equal(b.durationHours*60,675);assert.equal(a.transport.arriveTime,'19:45');assert.equal(b.transport.arriveTime,'20:15');
});
test('R3 omitted reverse exact F5 and facade parity',()=>{const d=fixture();assert.deepEqual(buildF6Trip(spec,d,{connectionContext:context(),content:[]}),buildF5Trip(spec,d,{content:[]}));});
test('R4 inherited segment movement mismatch refuses before scheduling',()=>{const d=fixture({inVehicleHours:5,segments:[{mode:'train',inVehicleHours:2},{mode:'train',inVehicleHours:3}],reverse:{durationHours:6}});assert.equal(buildF6Trip(spec,d,{connectionContext:context()}).detail.reason,'connection_content_invalid');});
for(const patch of [{reverse:{durationHours:3,segments:[]}},{reverse:{durationHours:3,layoverHours:1}},{reverse:{durationHours:3,transfers:1}},{reverse:{durationHours:3,mode:'train'}},{direction:'oneway',reverse:{durationHours:3}},{reverse:{durationHours:0}},{transfers:-1}])test('R5/R6 invalid reverse '+JSON.stringify(patch),()=>assert.throws(()=>validateConnection(fixture(patch).connections[0])));
test('R5 explicit direct clear removes segments and layover',()=>{const c=fixture({inVehicleHours:5,segments:[{mode:'train',inVehicleHours:2},{mode:'train',inVehicleHours:3}],layoverHours:1,reverse:{durationHours:3,segments:null,layoverHours:0,transfers:0}}).connections[0];const r=orientConnection(c,'a','o');assert.equal(r.segments,null);assert.equal(r.inVehicleHours,3);assert.equal(r.layoverHours,0);});
test('R7 excursion uses asymmetric 294-minute window',()=>{
 const d=fixture();d.connections.push({id:'ex',fromPlaceId:'a',toPlaceId:'x',direction:'bidirectional',mode:'road_private_transfer',inVehicleHours:.5,localTransferHours:{origin:.25,destination:.25},reverse:{durationHours:1},reviewedAt:time,reviewedBy:'fixture reviewer'});
 d.routePackages[0].stops[0].excursions=[{placeId:'x',connectionId:'ex',hoursOnSite:2}];
 const route=buildRouteResult(d.routePackages[0],spec,d).routeResult;
 const ok=scheduleRoute(route,spec,d);assert.equal(ok.ok,true);const ex=ok.value.days.flatMap(d=>d.blocks).filter(b=>b.id.startsWith('ex:'));
 assert.deepEqual(ex.map(b=>[b.startTime,Math.round(b.durationHours*60)]),[['12:30',72],['13:42',120],['15:42',102]]);assert.equal(ex.at(-1).transport.arriveTime,'17:24');
 const limited=clone(route);limited.stops[0].minNights=1;limited.stops[0].maxNights=1;
 const config={...SCHEDULE_CONFIG,dayEndHour:17+24/60};
 assert.equal(scheduleRoute(limited,{...spec,totalDays:2},d,{config}).ok,true);
 assert.throws(()=>scheduleRoute(limited,{...spec,totalDays:2},d,{config:{...config,dayEndHour:17+23/60}}),e=>e.reason==='excursion_does_not_fit');
});

test('R6 reorientation always derives from original asymmetric row', () => {
  const original = fixture({ reverse: { durationHours: 3 } }).connections[0];
  const reverse = orientConnection(original, 'a', 'o');
  assert.equal(orientConnection(reverse, 'a', 'o').inVehicleHours, 3);
  assert.equal(orientConnection(reverse, 'o', 'a').inVehicleHours, 2);
  assert.deepEqual(orientConnection(reverse, 'o', 'a').localTransferHours, original.localTransferHours);
});
for (const key of ['layoverHours', 'transfers']) test(`R5 explicit null ${key} is invalid`, () => {
  assert.throws(() => validateConnection(fixture({ reverse: { durationHours: 3, [key]: null } }).connections[0]));
});
