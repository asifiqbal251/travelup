// R1: Refine after reopening a saved trip. A reload gives the page a fresh intake
// form (DEFAULT_FORM, destination ""); Continue restores the trip but, before R1,
// not the form, so Refine -> Rebuild built a spec with destination {kind: "",
// id: undefined} and selectRoutes rejected it ("Something went wrong").
// The fix restores the form from the trip's own spec (formFromSpec) and must not
// rebuild or otherwise disturb the loaded trip.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { confirmDepartureOnReopenedTrip, loadDoor2PlanModule, mountAndBuildViaIntake, resetLocation, teardown } from './helpers/domHarness.js';
import { addDayTrip, savedTrip } from './helpers/dayTrips.js';

const M = await loadDoor2PlanModule();
after(teardown);
const { screen, render, cleanup } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;

// The page's own exports (formFromSpec, DEFAULT_FORM) for the pure round-trip.
// A namespace export, so a missing name fails the test that uses it rather than
// the bundle build for the whole file.
const root = fileURLToPath(new URL('../../', import.meta.url));
const outfile = fileURLToPath(new URL(`./.flowRefineAfterReload.bundle.${process.pid}.mjs`, import.meta.url));
buildSync({
  stdin: { contents: `export * as Page from './src/pages/Door2Plan.jsx';`, resolveDir: root },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  alias: {
    '@/lib/PageNotFound': fileURLToPath(new URL('./helpers/stubPageNotFound.js', import.meta.url)),
    '@': root + 'src',
  },
  loader: { '.jsx': 'jsx', '.js': 'jsx' },
  jsx: 'automatic',
  define: { 'import.meta.env': '{}' },
  packages: 'external',
  logLevel: 'silent',
});
const { Page } = await import(outfile);
rmSync(outfile);

/** A page reload: a brand-new page instance (fresh form state) over the SAME localStorage. */
async function reloadAndContinue() {
  cleanup();
  resetLocation('/plan?key=door2');
  render(M.React.createElement(M.MemoryRouter, { initialEntries: ['/plan?key=door2'] }, M.React.createElement(M.Door2Plan)));
  const user = userEvent.setup();
  await user.click(await screen.findByText('Continue'));
  await screen.findByText('Your trip at a glance');
  return { user };
}

async function openRefine(user) {
  await user.click(screen.getByRole('button', { name: 'Refine' }));
  await screen.findByText('Make it yours');
}

const itineraryText = () => [...document.querySelectorAll('h3')].map((h) => h.parentElement.textContent).join('|');
// Boolean on purpose: a failing assert.equal on a DOM node makes node diff a jsdom element and run out of memory.
const noErrorPanel = () => assert.ok(!document.body.textContent.includes('Something went wrong'), `error panel shown: ${document.body.textContent.slice(0, 200)}`);

test('R1-T1: Japan 10 days -> day trip -> Save -> reload -> Continue -> Refine -> Rebuild: no error, same Japan trip', async () => {
  const first = await mountAndBuildViaIntake(M, { destination: 'Japan', totalDays: 10 });
  await addDayTrip(first.user, 'Tokyo', 'Nikko');
  const original = await savedTrip(M, first.user);

  const { user } = await reloadAndContinue();
  await confirmDepartureOnReopenedTrip(user); // a reopened trip is not rebuilt until the departure is confirmed
  await openRefine(user);
  await user.click(screen.getByRole('button', { name: 'Apply and rebuild' }));
  assert.ok(await screen.findByText('Refine your trip'), 'the day trip is about to be thrown away, so it confirms');
  await user.click(screen.getByRole('button', { name: 'Rebuild' }));

  noErrorPanel();
  assert.ok(await screen.findByText('Your trip at a glance'), 'a trip is shown');
  const rebuilt = await savedTrip(M, user);
  assert.deepEqual(rebuilt.spec.destination, original.spec.destination, 'same destination');
  assert.deepEqual(rebuilt.spec.destination, { kind: 'country', id: 'JP' }, 'a Japan trip');
  assert.equal(rebuilt.spec.totalDays, original.spec.totalDays, 'same length');
  assert.equal(rebuilt.days.length, 10, 'ten days');
  assert.equal(rebuilt.spec.travelMonth, original.spec.travelMonth, 'same month');
  assert.equal(rebuilt.spec.travellerType, original.spec.travellerType, 'same traveller type');
});

test('R1-T1b: interests and pace chosen before saving are what Refine shows and rebuilds after a reload', async () => {
  const first = await mountAndBuildViaIntake(M, { destination: 'Japan', totalDays: 10 });
  await openRefine(first.user);
  await first.user.click(screen.getByRole('button', { name: 'Food' }));
  await first.user.click(screen.getByRole('button', { name: 'Relaxed' }));
  await first.user.click(screen.getByRole('button', { name: 'Apply and rebuild' })); // nothing to lose: no confirm
  await screen.findByText('Your trip at a glance');
  const original = await savedTrip(M, first.user);
  assert.deepEqual(original.spec.interests, ['Food']);
  assert.equal(original.spec.pace, 'relaxed');

  const { user } = await reloadAndContinue();
  await confirmDepartureOnReopenedTrip(user); // without it the rebuild below would not run at all
  await openRefine(user);
  await user.click(screen.getByRole('button', { name: 'Apply and rebuild' })); // no day trips, no history: no confirm
  noErrorPanel();
  await screen.findByText('Your trip at a glance');
  const rebuilt = await savedTrip(M, user);
  assert.deepEqual(rebuilt.spec.destination, original.spec.destination);
  assert.deepEqual(rebuilt.spec.interests, ['Food'], 'interests restored, not reset to none');
  assert.equal(rebuilt.spec.pace, 'relaxed', 'pace restored, not reset to balanced');
  assert.equal(rebuilt.spec.totalDays, 10);
});

test('R1-T2: formFromSpec round-trips every DEFAULT_FORM key, from a constructed spec and from a built trip', () => {
  assert.equal(typeof Page.formFromSpec, 'function', 'the page exports formFromSpec');
  const form = {
    destination: 'country:JP',
    totalDays: 12,
    travelMonth: 4,
    travellerType: 'family',
    pace: 'relaxed',
    interests: ['Food', 'Nature'],
    required: ['kyoto'],
  };
  assert.deepEqual(Object.keys(form).sort(), Object.keys(Page.DEFAULT_FORM).sort(), 'the fixture covers exactly the DEFAULT_FORM keys');

  // The spec exactly as runBuild builds it from a form.
  const [kind, id] = form.destination.split(':');
  const spec = {
    originPlaceId: 'vancouver',
    destination: { kind, id },
    totalDays: form.totalDays,
    travelMonth: form.travelMonth,
    travellerType: form.travellerType,
    interests: form.interests,
    pace: form.pace,
    budget: 'mid',
    routeTemplateId: null,
    stops: [],
    requiredPlaceIds: form.required,
    choices: { pinned: [], rejected: [], placed: [] },
  };
  assert.deepEqual(Page.formFromSpec(spec), form, 'constructed spec round-trips');

  const trip = M.buildFilledTrip(spec, M.PILOT_DATA, { reviewPolicy: 'allow_drafts' });
  assert.ok(trip.spec, 'the trip builds');
  assert.deepEqual(Page.formFromSpec(trip.spec), form, 'the spec the engine returns round-trips too');
  for (const key of Object.keys(Page.DEFAULT_FORM)) assert.ok(key in Page.formFromSpec(trip.spec), `key ${key} present`);
});

test('R1-T2b: formFromSpec returns null for a spec with no usable destination', () => {
  assert.equal(typeof Page.formFromSpec, 'function', 'the page exports formFromSpec');
  assert.equal(Page.formFromSpec(undefined), null);
  assert.equal(Page.formFromSpec({}), null);
  assert.equal(Page.formFromSpec({ destination: { kind: '', id: undefined } }), null);
  assert.equal(Page.formFromSpec({ destination: { kind: 'country' } }), null);
});

test('R1-T3: reload -> Continue without touching Refine leaves the loaded trip exactly as saved', async () => {
  const first = await mountAndBuildViaIntake(M, { destination: 'Japan', totalDays: 10 });
  await addDayTrip(first.user, 'Tokyo', 'Nikko');
  const saved = await savedTrip(M, first.user);
  const itineraryBefore = itineraryText();
  const chipBefore = screen.getByText('Day trip: Nikko').parentElement.textContent;

  const { user } = await reloadAndContinue();
  noErrorPanel();
  assert.equal(screen.getByText('Day trip: Nikko').parentElement.textContent, chipBefore, 'the day trip is still there');
  assert.equal(itineraryText(), itineraryBefore, 'itinerary text identical');
  const reopened = await savedTrip(M, user);
  assert.equal(M.tripFingerprint(reopened), M.tripFingerprint(saved), 'trip identical to the saved one');
  assert.deepEqual(reopened.spec, saved.spec, 'spec untouched');
});
