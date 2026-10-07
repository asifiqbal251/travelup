import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDoor2PlanModule, mountDoor2Plan, resetLocation, teardown } from './helpers/domHarness.js';
const control={calls:[]};
const M=await loadDoor2PlanModule({f6Control:control});
after(teardown);
const {screen,render,cleanup,within}=await import('@testing-library/react');
const userEvent=(await import('@testing-library/user-event')).default;
const time='2026-10-05T12:00:00.000Z';
const source={sourceUrl:'https://example.invalid/fictional',observedAt:time};
const clone=v=>structuredClone(v);
function setup(estimated=true,experiences=false) {
 const data={...M.PILOT_DATA,places:{...M.PILOT_DATA.places,vancouver:{...M.PILOT_DATA.places.vancouver,utcOffsetHours:0},tokyo:{...M.PILOT_DATA.places.tokyo,utcOffsetHours:0}},connections:[],routePackages:[clone(M.PILOT_DATA.routePackages.find(p=>p.id==='tokyo_city'))]};
 const airport=(key,lng)=>({key,lat:0,lng,countryId:'JP',...source});
 const input=(from,to,a,b)=>({fromPlaceId:from,toPlaceId:to,mode:'flight_international',segments:[{fromAirport:airport(a,a==='o'?0:9),toAirport:airport(b,b==='o'?0:9),serviceSourceUrl:source.sourceUrl,observedAt:time}],layoverHours:0,localTransferHours:{origin:.5,destination:.5},localTransferSources:{origin:{...source},destination:{...source}},...source});
 control.context={generatedAt:time,estimates:estimated?[input('vancouver','tokyo','o','a'),input('tokyo','vancouver','a','o')]:[]};
 if(!estimated)data.connections=[{id:'fictional_train',fromPlaceId:'vancouver',toPlaceId:'tokyo',direction:'bidirectional',mode:'train',inVehicleHours:2,reviewedBy:'fixture reviewer',reviewedAt:time,localTransferHours:{origin:.5,destination:.25},...(experiences?{experiences:[{id:'cx_fixture_view',title:'Fictional train view',description:'A synthetic view inside travel time.',appliesTo:'forward',timeCost:'within_connection',review:{status:'approved',reviewedBy:'fixture reviewer',reviewedAt:time,sourceUrl:source.sourceUrl},provenance:{sourceBundleId:'fixture',sourceTemplateTitle:'transfer',sourceFragmentId:'view'}}]}:{})}];
 control.data=data;control.content=experiences?[]:undefined;control.calls=[];return data;
}
async function setDays(user,n){let current=Number(screen.getByText(/^\d+ days$/).textContent.match(/\d+/)[0]);while(current<n){await user.click(screen.getByRole('button',{name:'+'}));current++;}while(current>n){await user.click(screen.getByRole('button',{name:'−'}));current--;}}
async function start(n=5){await mountDoor2Plan(M);const user=userEvent.setup();await user.click(await screen.findByText('Japan'));await setDays(user,n);await user.click(screen.getByRole('button',{name:'Yes, from Vancouver'}));await user.click(screen.getByRole('button',{name:'Build my trip'}));return user;}
async function save(user){await user.click(screen.getByRole('button',{name:'Save'}));assert.ok(await screen.findByText('Saved'));return M.listDraftTrips().at(0).trip;}
async function reopen(){cleanup();resetLocation();render(M.React.createElement(M.MemoryRouter,{initialEntries:['/plan?key=door2']},M.React.createElement(M.Door2Plan)));const user=userEvent.setup();await user.click(await screen.findByText('Continue'));return user;}

test('DOM2 estimated save/reopen preserves times/reasons; structural refusal and activity Undo',async()=>{setup();let user=await start();const original=await save(user);const calls=control.calls.length;const bytes=localStorage.getItem('door2_drafts_v1');user=await reopen();assert.equal(control.calls.length,calls);assert.equal(localStorage.getItem('door2_drafts_v1'),bytes);assert.equal(screen.getAllByText(/Estimated transport ·/).length,2);assert.ok(screen.getByRole('region',{name:'Recorded reasons'}));await user.click(screen.getByRole('button',{name:'Refine'}));await user.click(screen.getByRole('button',{name:'Apply and rebuild'}));assert.ok(await screen.findByText('This trip uses estimated transport. Changing its route or length needs a new plan; your saved trip is unchanged.'));assert.equal(control.calls.length,calls);assert.equal(localStorage.getItem('door2_drafts_v1'),bytes);
 await user.click(screen.getByRole('button',{name:/Day 2 options/}));await user.click(screen.getByRole('button',{name:/Make.*lighter/i}));await user.click(await screen.findByRole('button',{name:/Undo/}));const after=await save(user);assert.deepEqual(after.evidence,original.evidence);assert.deepEqual(after.days,original.days);
});
test('DOM2 curated saved experiences come from evidence after catalogue withdrawal',async()=>{setup(false,true);let user=await start();const original=await save(user);control.data.connections[0].experiences=[];user=await reopen();assert.ok(screen.getByText('Fictional train view'));assert.equal(control.calls.length,1);assert.deepEqual((await save(user)).evidence,original.evidence);});
test('DOM2 unknown evidence read-only displays escaped recorded reasons; save/edits cannot write',async()=>{setup();let user=await start();await save(user);const list=JSON.parse(localStorage.getItem('door2_drafts_v1'));list[0].trip.evidence.rulesetVersion=list[0].trip.versions.connectionEvidence='future@2';list[0].trip.evidence.entries[0].values.recordedText='<img src=x onerror=alert(1)> recorded';localStorage.setItem('door2_drafts_v1',JSON.stringify(list));const bytes=localStorage.getItem('door2_drafts_v1');user=await reopen();assert.ok(await screen.findByText(/newer version of recorded reasons/));assert.ok(screen.getByText('<img src=x onerror=alert(1)> recorded'));assert.equal(document.querySelector('img'),null);await user.click(screen.getByRole('button',{name:'Save'}));assert.equal(localStorage.getItem('door2_drafts_v1'),bytes);assert.equal(control.calls.length,1);});
test('DOM2 malformed evidence cannot load or overwrite bytes',async()=>{setup();const user=await start();const trip=await save(user);delete trip.evidence;const bytes=localStorage.getItem('door2_drafts_v1');assert.throws(()=>M.saveDraftTrip(trip,'bad'),e=>e.check==='shape');assert.equal(localStorage.getItem('door2_drafts_v1'),bytes);const list=JSON.parse(bytes);delete list[0].trip.evidence;localStorage.setItem('door2_drafts_v1',JSON.stringify(list));const bad=localStorage.getItem('door2_drafts_v1');await reopen();assert.ok(await screen.findByText(/saved evidence is incomplete/));assert.equal(localStorage.getItem('door2_drafts_v1'),bad);});

test('DOM2 real Save click refuses an in-memory malformed payload without writing', async () => {
  setup(); const user = await start(); await save(user);
  const bytes = localStorage.getItem('door2_drafts_v1');
  // Bundler-only fault injection into the actual page's current trip.
  control.lastTrip.evidence.generatedAt = 'not-a-date';
  await user.click(screen.getByRole('button', { name: 'Save' }));
  assert.match((await screen.findByRole('alert')).textContent, /incomplete saved evidence/);
  assert.equal(localStorage.getItem('door2_drafts_v1'), bytes);
});
