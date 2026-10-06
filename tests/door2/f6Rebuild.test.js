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

import * as structural from '../../src/lib/door2/restructure.js';
import * as edit from '../../src/lib/door2/edit.js';
import { tripFingerprint } from '../../src/lib/door2/fingerprint.js';
for(const [name,args] of [['previewAdjustNights',['s',1]],['previewChangeLength',[4]],['previewAddOptional',['x','p']],['previewRemoveOptional',['x']],['previewMoveOptional',['x','p']],['previewAddExcursion',['s','x']],['previewRemoveExcursion',['s','x']]])test('S7 '+name+' estimated in-memory/serialized refuses before graph',()=>{const t=estimated().value.trip;for(const trip of [t,clone(t)]){const before=JSON.stringify(trip);assert.deepEqual(structural[name](trip,...args),{ok:false,reason:'estimated_transport_rebuild_unavailable',message:'This trip uses estimated transport. Changing its route or length needs a new plan; your saved trip is unchanged.',proposals:[]});assert.equal(JSON.stringify(trip),before);}});
test('S7 apply and lists cannot bypass estimated structural guard',()=>{const t=estimated().value.trip;assert.equal(structural.applyProposal(t,{trip:t,baseFingerprint:tripFingerprint(t)}).reason,'estimated_transport_rebuild_unavailable');assert.deepEqual(structural.listMoveOptions(t,'x'),{current:null,options:[]});assert.deepEqual(structural.listExcursionMenu(t,'s'),[]);});
test('S7 known estimates allow lighter-day and Undo without changed transport/evidence',()=>{const t=estimated().value.trip;const changed=edit.makeDayLighter(t,2,[]);assert.equal(changed.ok,true);assert.deepEqual(blocks(changed.trip),blocks(t));assert.deepEqual(changed.trip.evidence,t.evidence);const back=edit.undo(changed.trip);assert.equal(back.ok,true);assert.deepEqual(back.trip.evidence,t.evidence);});
test('S5 unknown and malformed guards cover all exported edits and Undo',()=>{for(const unknown of [true,false]){const t=estimated().value.trip;if(unknown)t.evidence.rulesetVersion=t.versions.connectionEvidence='future@2';else delete t.evidence;for(const [name,args] of [['swapActivity',['x']],['rejectActivity',['x']],['pinActivity',['x']],['unpinActivity',['x']],['makeDayLighter',[2]],['swapDays',[1,2]],['undo',[]]])assert.equal(edit[name](t,...args).reason,unknown?'evidence_version_unsupported':'evidence_invalid');}});
test('S8 curated structural preview requires explicit time, regenerates evidence and Apply/Undo',()=>{const d=fixture({reverse:{durationHours:3}});const t=buildF6Trip(spec,d,{connectionContext:context(),content:[]}).value.trip;assert.equal(structural.previewAdjustNights(t,'s',1,{data:d,content:[]}).reason,'connection_context_required');const generatedAt='2026-10-05T13:00:00.000Z';const p=structural.previewAdjustNights(t,'s',1,{data:d,content:[],generatedAt});assert.equal(p.ok,true);assert.ok(p.proposals.length);const next=p.proposals.at(-1);assert.equal(next.trip.evidence.generatedAt,generatedAt);assert.equal(inspectEvidence(next.trip).ok,true);const applied=structural.applyProposal(t,next);assert.equal(applied.ok,true);assert.equal(edit.undo(applied.trip).trip.evidence.generatedAt,time);});
test('S8 invalid current experience refuses without throwing or partial proposal',()=>{const d=fixture({reverse:{durationHours:3}});const t=buildF6Trip(spec,d,{connectionContext:context()}).value.trip;d.connections[0].experiences=[experience({timeCost:'bad'})];assert.equal(structural.previewAdjustNights(t,'s',1,{data:d,generatedAt:time}).reason,'connection_content_invalid');});

test('COMPAT an unused valid reverse row does not demand a generation time for an ordinary preview', () => {
  const d = fixture();
  const trip = buildFilledTrip(spec, d, { content: [] });
  const original = structural.previewAdjustNights(trip, 's', 1, { data: d, content: [] });
  d.connections.push({ ...d.connections[0], id: 'unused', fromPlaceId: 'x', toPlaceId: 'a', reverse: { durationHours: 3 } });
  assert.deepEqual(structural.previewAdjustNights(trip, 's', 1, { data: d, content: [] }), original);
});

test('S7 pin/unpin, swap, reject, lighter and Undo preserve estimated transport and evidence', async () => {
  const { PILOT_CONTENT } = await import('../../src/lib/door2/pilotContent.js');
  const content = PILOT_CONTENT.filter(item => item.placeId === 'tokyo').map(item => ({ ...item, placeId: 'a' }));
  const d = fixture(); d.connections = [];
  const built = buildF6Trip({ ...spec, totalDays: 5 }, d, { connectionContext: context([input(), input('a', 'o')]), content });
  assert.equal(built.ok, true);
  const trip = freeze(built.value.trip);
  const day = trip.days.find(day => day.blocks.some(b => b.type === 'activity'));
  const block = day.blocks.find(b => b.type === 'activity');
  const pinned = edit.pinActivity(trip, block.id);
  const results = [pinned, edit.unpinActivity(pinned.trip, block.id), edit.swapActivity(trip, block.id, null, content), edit.rejectActivity(trip, block.id, content), edit.makeDayLighter(trip, day.dayNumber, content)];
  for (const result of results) {
    assert.equal(result.ok, true, result.message);
    assert.deepEqual(blocks(result.trip), blocks(trip));
    assert.deepEqual(result.trip.evidence, trip.evidence);
    const restored = edit.undo(result.trip);
    assert.equal(restored.ok, true);
    assert.deepEqual(blocks(restored.trip), blocks(trip));
    assert.deepEqual(restored.trip.evidence, trip.evidence);
  }
});
