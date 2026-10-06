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
async function start(n=5){await mountDoor2Plan(M);const user=userEvent.setup();await user.click(await screen.findByText('Japan'));await setDays(user,n);await user.click(screen.getByRole('button',{name:'Build my trip'}));return user;}
async function save(user){await user.click(screen.getByRole('button',{name:'Save'}));assert.ok(await screen.findByText('Saved'));return M.listDraftTrips().at(0).trip;}
async function reopen(){cleanup();resetLocation();render(M.React.createElement(M.MemoryRouter,{initialEntries:['/plan?key=door2']},M.React.createElement(M.Door2Plan)));const user=userEvent.setup();await user.click(await screen.findByText('Continue'));return user;}

test('DOM1/ID3 estimated refusal recovery retains ID, explicit route and facts',async()=>{
 setup();const user=await start(2);assert.ok(await screen.findByRole('button',{name:/Add .* day/}));assert.ok(screen.getByText('Estimated transport · approximate flight time'));assert.ok(screen.getAllByText(/Approximate flight time from supplied service facts/).length);const first=control.calls.at(-1);await user.click(screen.getByRole('button',{name:/Add .* day/}));await screen.findByText('Your trip at a glance');assert.equal(control.calls.at(-1).context.sequenceId,first.context.sequenceId);assert.deepEqual(control.calls.at(-1).context.estimates,first.context.estimates);assert.equal(screen.getAllByText(/Estimated transport ·/).length,2);const t=await save(user);assert.equal(t.evidence.entries.length,2);assert.equal(t.evidence.entries[0].values.timing.roundedMinutes,375);
});
test('DOM1 curated experience is travel-only, forward-only and does not fill an empty shelf',async()=>{setup(false,true);const user=await start();await screen.findByText('Your trip at a glance');const view=screen.getByText('Fictional train view');assert.match(view.closest('li').textContent,/train/i);assert.equal(within(view.closest('li')).queryByRole('button'),null);assert.equal(screen.getAllByText('Fictional train view').length,1);assert.ok(screen.getAllByText(/Nothing curated for this slot/).length);const t=await save(user);assert.equal(t.evidence.entries[1].values.experiences.length,0);});
test('CTX page keeps a successful trip and input when context metadata is invalid',async()=>{setup(false);const user=await start();const before=await save(user);control.context.generatedAt='not-a-date';await user.click(screen.getByRole('button',{name:'Refine'}));await user.click(screen.getByRole('button',{name:'Apply and rebuild'}));assert.ok(await screen.findByText(/required planning information is missing or invalid/));assert.ok(screen.getByText('Your trip at a glance'));assert.deepEqual(await save(user),before);});
test('ID4 fresh start allocates a new ID; curated Refine retains it',async()=>{setup(false,true);const user=await start();const first=control.calls[0].context.sequenceId;await user.click(screen.getByRole('button',{name:'Refine'}));await user.click(screen.getByRole('button',{name:'Apply and rebuild'}));assert.equal(control.calls.at(-1).context.sequenceId,first);await user.click(screen.getByRole('button',{name:'Start a new trip'}));await user.click(await screen.findByText('Japan'));await setDays(user,5);await user.click(screen.getByRole('button',{name:'Build my trip'}));assert.notEqual(control.calls.at(-1).context.sequenceId,first);});

test('ID3 explicit curated route survives F6 refusal/extension with the same session ID', async () => {
  const data = setup(false, true);
  data.routePackages.push({ ...clone(data.routePackages[0]), id: 'f6_alternate', variantId: 'f6_alternate', name: 'Fictional alternate' });
  const user = await start();
  const alternate = screen.getAllByRole('button').find(b => b.textContent.startsWith('f6_alternate'));
  assert.ok(alternate); await user.click(alternate);
  const id = control.calls.at(-1).context.sequenceId;
  await user.click(screen.getByRole('button', { name: 'Refine' })); await setDays(user, 2);
  await user.click(screen.getByRole('button', { name: 'Apply and rebuild' }));
  await user.click(await screen.findByRole('button', { name: /Add .* day/ }));
  assert.equal(control.calls.at(-1).spec.routeTemplateId, 'f6_alternate');
  assert.equal(control.calls.at(-1).context.sequenceId, id);
  assert.equal((await save(user)).routePlan.variantId, 'f6_alternate');
});

test('ID4 cancelling a fresh start keeps edits and ID; confirmation allocates only on the next build', async () => {
  setup(); const user = await start();
  const id = control.calls.at(-1).context.sequenceId;
  await user.click(screen.getAllByRole('button', { name: 'Swap' })[0]);
  const before = await save(user);
  await user.click(screen.getByRole('button', { name: 'Start a new trip' }));
  await user.click(await screen.findByRole('button', { name: 'Keep my trip' }));
  assert.deepEqual(await save(user), before); assert.equal(control.calls.at(-1).context.sequenceId, id);
  await user.click(screen.getByRole('button', { name: 'Start a new trip' }));
  await user.click(await screen.findByRole('button', { name: 'Start over' }));
  await user.click(await screen.findByText('Japan')); await setDays(user, 5);
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  assert.notEqual(control.calls.at(-1).context.sequenceId, id);
});


test('review regression: pre-validation failure shows no estimated refusal evidence', async () => {
  setup(); control.context.generatedAt = 'not-a-date';
  await start(2);
  await screen.findByText(/required planning information is missing or invalid/);
  assert.equal(screen.queryByText('Estimated transport · approximate flight time'), null);
  assert.equal(screen.queryByText(/Approximate flight time from supplied service facts/), null);
  assert.equal(screen.queryByRole('button', { name: /Add .* day/ }), null);
});


test('review regression: unavailable estimator refusal shows its recorded explanation', async () => {
  setup(); control.context.estimatorRulesetVersion = 'flight-gc-v2';
  await start();
  await screen.findByText('Transport estimate unavailable');
  assert.equal(screen.getAllByText('Supplied transport facts could not be used.').length, 2);
  assert.equal(screen.queryByText('Estimated transport · approximate flight time'), null);
  assert.equal(screen.queryByText('Your trip at a glance'), null);
});


function setupEstimatedAlternative() {
  const d = setup(false);
  d.places.kyoto = { ...d.places.kyoto, utcOffsetHours: 0 };
  d.routePackages.push({ ...clone(d.routePackages[0]), id: 'f6_estimated_alternative', variantId: 'f6_estimated_alternative', name: 'Fictional estimated Kyoto', placeIds: ['kyoto'],
    stops: [{ id: 'fixture_kyoto', placeId: 'kyoto', minNights: 2, maxNights: 10, excursions: [] }] });
  const airport = (key,lng) => ({ key, lat: 0, lng, countryId: 'JP', ...source });
  const facts = (from,to,a,b) => ({ fromPlaceId: from, toPlaceId: to, mode: 'flight_international', segments: [{ fromAirport: airport(a,a==='o'?0:9), toAirport: airport(b,b==='o'?0:9), serviceSourceUrl: source.sourceUrl, observedAt: time }], layoverHours: 0,
    localTransferHours: { origin: .5, destination: .5 }, localTransferSources: { origin: {...source}, destination: {...source} }, ...source });
  control.context.estimates = [facts('vancouver','kyoto','o','k'), facts('kyoto','vancouver','k','o')];
  return d;
}

test('second review DOM: estimated alternative is disclosed before selection and excluded from winning save', async () => {
  setupEstimatedAlternative();
  const user = await start();
  await screen.findByText('Your trip at a glance');
  const alternative = screen.getByRole('button', { name: /f6_estimated_alternative/ });
  assert.ok(within(alternative).getByText('Estimated transport · approximate flight time'));
  assert.ok(within(alternative).getByText(/Approximate flight time from supplied service facts/));
  const curated = await save(user);
  assert.equal(curated.evidence, undefined);
  assert.equal(curated.spec.routeTemplateId, 'tokyo_city');
  assert.equal(curated.alternativeEvidence, undefined);
  const first = control.calls.at(-1).context.sequenceId;
  await user.click(alternative);
  assert.equal(control.calls.at(-1).spec.routeTemplateId, 'f6_estimated_alternative');
  assert.equal(control.calls.at(-1).context.sequenceId, first);
  const estimated = await save(user);
  assert.equal(estimated.evidence.entries.length, 2);
  const curatedAlternative = screen.getByRole('button', { name: /Tokyo · 1 stops/ });
  assert.equal(within(curatedAlternative).queryByText('Estimated transport · approximate flight time'), null);
  assert.ok(estimated.evidence.entries.every(e => e.values.fromPlaceId === 'kyoto' || e.values.toPlaceId === 'kyoto'));
});

test('second review DOM: dropping a required place offers and builds the disclosed estimated recovery', async () => {
  const d = setupEstimatedAlternative();
  d.routePackages[0].stops[0].minNights = 6;
  const user = await start(7);
  await screen.findByText('Your trip at a glance');
  const first = control.calls.at(-1).context.sequenceId;
  await user.click(screen.getByRole('button', { name: 'Refine' }));
  const heading = await screen.findByText('Must include');
  await user.click(within(heading.parentElement).getByRole('button', { name: 'Tokyo' }));
  await setDays(user, 5);
  await user.click(screen.getByRole('button', { name: 'Apply and rebuild' }));
  const drop = await screen.findByRole('button', { name: 'Drop Tokyo' });
  assert.ok(screen.getByText('Estimated transport · approximate flight time'));
  assert.ok(screen.getAllByText(/Approximate flight time from supplied service facts/).length);
  await user.click(drop);
  await screen.findByText('Your trip at a glance');
  assert.deepEqual(control.calls.at(-1).spec.requiredPlaceIds, []);
  assert.equal(control.calls.at(-1).spec.routeTemplateId, null);
  assert.equal(control.calls.at(-1).context.sequenceId, first);
  assert.equal((await save(user)).spec.routeTemplateId, 'f6_estimated_alternative');
});
