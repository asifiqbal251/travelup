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

test('X1/S2 resolved list only in evidence, forward and return/repeated traversals',()=>{const d=fixture({experiences:[experience()]});const r=buildF6Trip(spec,d,{connectionContext:context(),content:[]});assert.equal(r.ok,true);assert.equal(r.value.trip.evidence.entries.length,2);for(const b of blocks(r.value.trip)){assert.equal(connectionDisplay(r.value.trip,b).experiences[0].title,'Fictional train view');assert.equal(b.experiences,undefined);}assert.equal(r.value.trip.evidence.entries[1].values.direction,'reverse');d.connections[0].experiences[0].appliesTo='forward';const t=buildF6Trip(spec,d,{connectionContext:context(),content:[]}).value.trip;assert.equal(t.evidence.entries[1].values.experiences.length,0);assert.equal(t.evidence.entries[1].values.deferredExperiences[0].reason,'direction_mismatch');});
for(const [name,patch] of [['missing source',x=>delete x.review.sourceUrl],['missing provenance',x=>delete x.provenance.sourceFragmentId],['missing reviewer',x=>x.review.reviewedBy=null],['bad timeCost',x=>x.timeCost='extra'],['bad direction',x=>x.appliesTo='any']])test('X2/X4 rejects '+name,()=>{const x=experience();patch(x);assert.equal(buildF6Trip(spec,fixture({experiences:[x]}),{connectionContext:context()}).detail.reason,'connection_content_invalid');});
for(const [status,reason] of [['pending_review','pending_review'],['rejected','rejected']])test('X3 '+status+' withheld',()=>{const x=experience();x.review.status=status;const t=buildF6Trip(spec,fixture({experiences:[x]}),{connectionContext:context()}).value.trip;assert.equal(t.evidence.entries[0].values.experiences.length,0);assert.equal(t.evidence.entries[0].values.deferredExperiences[0].reason,reason);});
test('X3/X4 owner draft and additional time deferred honestly',()=>{let t=buildF6Trip(spec,fixture({reviewedAt:null,experiences:[experience()]}),{connectionContext:context(),reviewPolicy:'allow_drafts'}).value.trip;assert.equal(t.evidence.entries[0].values.deferredExperiences[0].reason,'owner_unreviewed');t=buildF6Trip(spec,fixture({experiences:[experience({timeCost:'requires_additional'})]}),{connectionContext:context()}).value.trip;assert.equal(t.evidence.entries[0].values.deferredExperiences[0].reason,'additional_time_not_modelled');assert.equal(t.evidence.entries[0].values.experiences.length,0);});
test('X5 global ID/triple duplicates include held declarations and place content',()=>{const x=experience();for(const duplicate of [x,experience({id:'cx_other'})])assert.throws(()=>validateCatalogue(fixture({experiences:[x,duplicate]}).connections,[],time));assert.throws(()=>validateCatalogue(fixture({experiences:[x]}).connections,[{provenance:x.provenance}],time));});
test('X6 estimated row cannot carry even empty experiences',()=>assert.throws(()=>validateConnection({...estimateConnection(input(),context()),experiences:[]})));
test('X7 empty shelf and fill scores unchanged with connection experience',()=>{const ordinary=buildF5Trip(spec,fixture(),{content:[]}).value.trip;const t=buildF6Trip(spec,fixture({experiences:[experience()]}),{connectionContext:context(),content:[]}).value.trip;assert.deepEqual(t.days,ordinary.days);assert.deepEqual(t.contentGaps,ordinary.contentGaps);});
test('X8 stored malformed experience cannot render or promote extra-time',()=>{const t=buildF6Trip(spec,fixture({experiences:[experience()]}),{connectionContext:context()}).value.trip;t.evidence.entries[0].values.experiences[0].timeCost='requires_additional';assert.equal(inspectEvidence(t).ok,false);assert.ok(connectionDisplay(t,blocks(t)[0]).error);});

test('X1/X5 saved repeated occurrences must retain one consistent authored experience', () => {
  const d = fixture({ experiences: [experience()] });
  const t = buildF6Trip(spec, d, { connectionContext: context() }).value.trip;
  assert.equal(inspectEvidence(t).ok, true);
  d.connections[0].experiences[0].title = 'Changed catalogue';
  assert.equal(t.evidence.entries[0].values.experiences[0].title, 'Fictional train view');
  t.evidence.entries[1].values.experiences[0].description = 'Inconsistent stored copy';
  assert.equal(inspectEvidence(t).ok, false);
});
