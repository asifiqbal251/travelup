import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDoor2PlanModule, mountDoor2Plan, mountAndBuildViaIntake, mountWithBuiltTrip, resetLocation, teardown } from './helpers/domHarness.js';
import { chooseCoreRoute, setDays, withGapCatalogue } from './helpers/f5Flows.js';
import { japanSpec, savedTrip } from './helpers/dayTrips.js';
const M = await loadDoor2PlanModule();
after(teardown);
const { screen, render, cleanup } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;
const jp='tokyo_city', kyoto=jp+'+kyoto@after_tokyo', rev='ec_corridor#east_to_west';
const glanceStops=()=>[...screen.getByText('Your trip at a glance').closest('div').querySelectorAll('span.text-base.font-semibold')].map(s=>s.textContent);
async function refine(user, days) {
  await user.click(screen.getByRole('button',{name:'Refine'}));
  await setDays(user,days);
  await user.click(screen.getByRole('button',{name:'Apply and rebuild'}));
}
async function start(destination,days) {
  await mountDoor2Plan(M); const user=userEvent.setup();
  await user.click(await screen.findByText(destination)); await setDays(user,days);
  await user.click(screen.getByRole('button',{name:'Build my trip'})); return user;
}
async function assertRoute(user,id,days) {
  await screen.findByText('Your trip at a glance');
  const t=await savedTrip(M,user); assert.equal(t.spec.routeTemplateId,id); assert.equal(t.spec.totalDays,days);
  assert.ok(!t.warnings.includes('nights_above_package_max')); return t;
}
for (const [destination,days,id] of [['Japan',7,jp],['Japan',10,kyoto],['Japan',14,kyoto],['Japan',18,kyoto],['Peru',12,'peru_classic+huaraz@after_lima_in'],['Canada',12,'ec_corridor#west_to_east+ottawa@corridor+niagara@toronto_spur']]) {
  test(`F5 page default ${destination}/${days}`,async()=>{
    const user=await start(destination,days); await assertRoute(user,id,days);
  });
}
test('F5 page Japan19 refusal offers a working eighteen-day adjustment',async()=>{
  const user=await start('Japan',19);
  assert.ok(await screen.findByText(/can't be built yet/));
  await user.click(screen.getByRole('button',{name:'Use 18 days'}));
  await assertRoute(user,kyoto,18);
});
test('F5 explicit Tokyo survives Refine, refuses fourteen, and changes only on the Kyoto action',async()=>{
  const {user}=await mountAndBuildViaIntake(M,{destination:'Japan',totalDays:10});
  await chooseCoreRoute(user,'Japan'); await refine(user,10); await assertRoute(user,jp,10);
  await refine(user,14);
  assert.ok(await screen.findByText(/can't be built yet/));
  assert.ok(!screen.queryByText('Your trip at a glance'));
  const alternate=screen.getAllByRole('button').find(b=>/^Try the .*Kyoto/.test(b.textContent));
  assert.ok(alternate); await user.click(alternate); await assertRoute(user,kyoto,14);
});
test('F5 explicit reverse Canada → five days → extend to six retains exact direction',async()=>{
  const {user}=await mountAndBuildViaIntake(M,{destination:'Canada',totalDays:6});
  const reverse=screen.getAllByRole('button').find(b=>b.textContent.startsWith('Québec City to Toronto ·'));
  assert.ok(reverse); await user.click(reverse); await refine(user,5);
  assert.ok(await screen.findByText(/can't be built yet/));
  await user.click(screen.getByRole('button',{name:'Add 1 day'}));
  await assertRoute(user,rev,6); assert.deepEqual(glanceStops(),['Québec City','Montréal','Toronto']);
  // A later fitting request still holds the constraint (automatic12 picks both optionals).
  await refine(user,12); await assertRoute(user,rev,12);
});
test('F5 required-place removal recovery retains the explicit Tokyo-only route',async()=>{
  const {user}=await mountAndBuildViaIntake(M,{destination:'Japan',totalDays:10});
  await chooseCoreRoute(user,'Japan');
  await user.click(screen.getByRole('button',{name:'Refine'}));
  await user.click(screen.getByRole('button',{name:'Kyoto'}));
  await user.click(screen.getByRole('button',{name:'Apply and rebuild'}));
  assert.ok(await screen.findByText(/can't be built yet/));
  await user.click(screen.getByRole('button',{name:'Drop Kyoto'}));
  const t=await assertRoute(user,jp,10); assert.deepEqual(t.spec.requiredPlaceIds,[]);
});
test('F5 explicit duration adjustment keeps Tokyo; fresh start clears the constraint',async()=>{
  const {user}=await mountAndBuildViaIntake(M,{destination:'Japan',totalDays:10});
  await chooseCoreRoute(user,'Japan'); await refine(user,14);
  await user.click(screen.getByRole('button',{name:'Use 12 days'})); await assertRoute(user,jp,12);
  await user.click(screen.getByRole('button',{name:'Start a new trip'}));
  await user.click(await screen.findByText('Japan')); await setDays(user,10);
  await user.click(screen.getByRole('button',{name:'Build my trip'})); await assertRoute(user,kyoto,10);
});
test('F5 automatic refinement can rerank; saving/reloading establishes a conservative route constraint',async()=>{
  const {user}=await mountAndBuildViaIntake(M,{destination:'Japan',totalDays:7});
  await refine(user,10); await assertRoute(user,kyoto,10);
  // Seed an older automatic Tokyo trip; Continue must neither rebuild nor write.
  await mountWithBuiltTrip(M,japanSpec(10));
  const before=localStorage.getItem('door2_drafts_v1');
  assert.ok(before, 'a real saved envelope exists before reload');
  const text=screen.getByText('Your trip at a glance').closest('div').textContent;
  cleanup(); resetLocation();
  render(M.React.createElement(M.MemoryRouter,{initialEntries:['/plan?key=door2']},M.React.createElement(M.Door2Plan)));
  const next=userEvent.setup(); await next.click(await screen.findByText('Continue'));
  assert.equal(screen.getByText('Your trip at a glance').closest('div').textContent,text);
  assert.equal(localStorage.getItem('door2_drafts_v1'),before);
  await refine(next,10); await assertRoute(next,jp,10);
});
test('F5 explicit constraint survives cancelled and confirmed destructive Refine',async()=>{
  const {user}=await mountAndBuildViaIntake(M,{destination:'Japan',totalDays:10}); await chooseCoreRoute(user,'Japan');
  await user.click(screen.getAllByText('Swap')[0]); const before=await savedTrip(M,user);
  await refine(user,11); await screen.findByText('Refine your trip');
  await user.click(screen.getByRole('button',{name:'Keep my trip'}));
  const kept=await savedTrip(M,user); assert.deepEqual(kept,before);
  await refine(user,11); await user.click(screen.getByRole('button',{name:'Rebuild'}));
  await assertRoute(user,jp,11);
});
test('F5 old stretched Tokyo trip explains twelve allocated nights against limit ten',async()=>{
  const {user}=await mountWithBuiltTrip(M,japanSpec(14));
  await user.click(screen.getByRole('button',{name:'12 nights'}));
  await user.click(screen.getByText('More time here (+1 night)'));
  assert.ok(await screen.findByText("You're already staying 12 nights in Tokyo, beyond this route's usual limit of 10. We can't add another night here."));
});
test('F5 disjoint-range page offers working seven and ten-day actions; input stays automatic',async()=>{
  await withGapCatalogue(M,async()=>{
    for (const days of [7,10]) {
      const user=await start('Japan',8);
      assert.ok(await screen.findByText('These routes support 5–7 or 10–12 days. You asked for 8.'));
      assert.ok(screen.getByRole('button',{name:'Use 7 days'})); assert.ok(screen.getByRole('button',{name:'Use 10 days'}));
      await user.click(screen.getByRole('button',{name:`Use ${days} days`}));
      await assertRoute(user,days===7?jp:kyoto,days);
      await refine(user,days===7?10:7); await assertRoute(user,days===7?kyoto:jp,days===7?10:7);
    }
  });
});
