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

import { saveDraftTrip, loadDraftTrip } from '../../src/lib/door2/draftStorage.js';
import { tripFingerprint } from '../../src/lib/door2/fingerprint.js';
function store(){let value=null;globalThis.localStorage={getItem:()=>value,setItem:(k,v)=>value=v};return ()=>value;}
test('S1/ID2 complete success wrapper keeps caller identity separate and evidence owned once',()=>{const r=estimated();assert.equal(r.ok,true);assert.equal(r.value.sequence.id,'fixture-session-1');assert.notEqual(r.value.trip.id,r.value.sequence.id);assert.equal(r.value.sequence.evidence,r.value.trip.evidence);assert.equal(inspectEvidence(r.value.trip).ok,true);assert.equal(r.value.trip.evidence.entries.length,2);assert.equal(r.value.trip.evidence.entries[0].values.inputs.sourceUrl,source.sourceUrl);});
for(const id of [undefined,'',' ',' a','a ','a!','a'.repeat(129)])test('ID1 invalid caller ID '+JSON.stringify(id),()=>{const c=context();if(id===undefined)delete c.sequenceId;else c.sequenceId=id;const r=buildF6Trip(spec,fixture(),{connectionContext:c});assert.equal(r.detail.field,'connectionContext.sequenceId');assert.equal(r.detail.issue,id===undefined?'missing':'invalid');assert.equal(r.evidence,undefined);});
test('ID3 retries preserve explicitly supplied ID as trip identity changes',()=>{const d=fixture({reverse:{durationHours:3}});for(const n of [3,4,5]){const r=buildF6Trip({...spec,totalDays:n},d,{connectionContext:context()});assert.equal(r.value.sequence.id,'fixture-session-1');assert.match(r.value.trip.id,new RegExp(':'+n+':'));}});
test('S3 save/reopen preserves evidence exactly with no graph dependency',()=>{const bytes=store();const t=estimated().value.trip;const id=saveDraftTrip(t,'synthetic');const before=bytes();const r=loadDraftTrip(id);assert.equal(r.compatible,true);assert.deepEqual(r.trip.evidence,t.evidence);assert.equal(r.trip.versions.schema,'door2-v7');assert.equal(bytes(),before);assert.equal(t.versions.schema,'door2-v6');});
for(const [name,mutate] of [['missing evidence',t=>delete t.evidence],['marker mismatch',t=>t.versions.connectionEvidence='wrong'],['extra entry field',t=>t.evidence.entries[0].values.extra=1],['null occurrence',t=>t.evidence.entries[0].values.blockId=null],['wrong duration',t=>t.evidence.entries[0].values.timing.roundedMinutes++],['nonfinite',t=>t.evidence.entries[0].values.timing.inVehicleHours=Infinity]])test('S4 malformed '+name+' never writes',()=>{const bytes=store();const t=estimated().value.trip;mutate(t);assert.equal(inspectEvidence(t).ok,false);assert.throws(()=>saveDraftTrip(t,'bad'),e=>e.check==='shape');assert.equal(bytes(),null);});
test('S5 unknown evidence displays recorded reasons read-only; malformed unknown refuses load',()=>{const bytes=store();const t=estimated().value.trip;t.evidence.rulesetVersion=t.versions.connectionEvidence='future@2';t.evidence.entries[0].code='future';assert.equal(inspectEvidence(t).readOnly,true);localStorage.setItem('door2_drafts_v1',JSON.stringify([{id:'x',savedAt:time,trip:t}]));let before=bytes();const r=loadDraftTrip('x');assert.equal(r.evidenceReadOnly,true);assert.equal(bytes(),before);assert.throws(()=>saveDraftTrip(t,'new'),/evidence_version_unsupported/);t.evidence.generatedAt='invalid';localStorage.setItem('door2_drafts_v1',JSON.stringify([{id:'x',savedAt:time,trip:t}]));before=bytes();assert.equal(loadDraftTrip('x').compatible,false);assert.equal(bytes(),before);});
test('S6 optional validation also protects legacy v6 envelopes and preserves v5 refusal',()=>{store();const t=estimated().value.trip;localStorage.setItem('',JSON.stringify([{id:'x',savedAt:time,trip:t}]));assert.equal(loadDraftTrip('x').compatible,true);delete t.evidence;localStorage.setItem('',JSON.stringify([{id:'x',savedAt:time,trip:t}]));assert.equal(loadDraftTrip('x').compatible,false);t.versions.schema='door2-v5';localStorage.setItem('',JSON.stringify([{id:'x',savedAt:time,trip:t}]));assert.match(loadDraftTrip('x').reason,/older trip format/);});
test('S8 evidence changes stale fingerprint; ordinary legacy fingerprints stay same',()=>{const t=estimated().value.trip;const fp=tripFingerprint(t);t.evidence.entries[0].values.recordedText='Changed';assert.notEqual(tripFingerprint(t),fp);const legacy=buildFilledTrip(spec,fixture());assert.equal(tripFingerprint(legacy),tripFingerprint(clone(legacy)));});
