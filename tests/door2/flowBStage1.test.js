// Direction B, Stage 1 — the acceptance examples of build brief B §6 (revision 3),
// driven through the real Door2Plan page.
//
// "Planner calls" here are calls to buildF6Trip, the page's one construction and
// reconstruction entry into the planner. The bundle below is the real page with
// that single function wrapped by a probe: it counts every call, and a test can
// stand in for one result (a thrown error, an invalid context, a reason the page
// has never seen) that the real catalogue cannot be made to produce on demand.
// Nothing else is replaced, and no production file or fixture is touched.
//
// The owner-approved wording is written out here on purpose, not imported from
// the page, so a later wording drift fails a test instead of passing silently.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync, rmSync } from 'node:fs';
import { build } from 'esbuild';
import { clearStorage, resetLocation, teardown, window } from './helpers/domHarness.js';
import { setDays } from './helpers/f5Flows.js';

after(teardown);
const { render, screen, cleanup, within } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;
const React = (await import('react')).default;
const { MemoryRouter } = await import('react-router-dom');

const planner = { calls: [], next: null, around: null };
globalThis.__bStage1Planner = planner;

const root = fileURLToPath(new URL('../../', import.meta.url));
const outfile = fileURLToPath(new URL(`./.flowBStage1.bundle.${process.pid}.mjs`, import.meta.url));
await build({
  plugins: [{
    name: 'b-stage1-planner-probe',
    setup(b) {
      b.onLoad({ filter: /connectionBuild\.js$/ }, (args) => {
        const source = readFileSync(args.path, 'utf8');
        const entry = 'export function buildF6Trip(';
        if (source.split(entry).length !== 2) throw new Error('flowBStage1: buildF6Trip not found exactly once');
        return {
          loader: 'js',
          contents: `${source.replace(entry, 'function realBuildF6Trip(')}
export function buildF6Trip(spec, data, options) {
  const probe = globalThis.__bStage1Planner;
  probe.calls.push(JSON.parse(JSON.stringify(spec)));
  const stand = probe.next ?? probe.around;
  probe.next = null;
  return stand ? stand(realBuildF6Trip, spec, data, options) : realBuildF6Trip(spec, data, options);
}`,
        };
      });
    },
  }],
  stdin: {
    contents: `
      export { default as Door2Plan, refusalKind } from './src/pages/Door2Plan.jsx';
      export { PILOT_DATA, buildFilledTrip } from './src/lib/door2/planner.js';
      export { listDraftTrips, loadDraftTrip, saveDraftTrip } from './src/lib/door2/draftStorage.js';
      export { previewAddExcursion, applyProposal } from './src/lib/door2/restructure.js';`,
    resolveDir: root,
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  alias: { '@': root + 'src' },
  loader: { '.jsx': 'jsx', '.js': 'jsx' },
  jsx: 'automatic',
  define: { 'import.meta.env': '{}' },
  packages: 'external',
  logLevel: 'silent',
});
const P = await import(outfile);
rmSync(outfile);

// ── Owner-approved wording, build brief B §8.1 and §8.4 ──────────────────────
const LIMITS = 'Plan selected routes from Vancouver: New York City, Tokyo with Kyoto options, Peru classic with Huaraz options, and the Eastern Canada corridor. Other destinations or departure cities? Use the classic planner. Trips made here are saved only in this browser; the classic planner supports account saving when you sign in.';
const QUESTION = 'Are you departing from Vancouver?';
const YES = 'Yes, from Vancouver';
const NO = 'No, another city';
const DECLINED = 'This planner currently plans from Vancouver. You can continue in the classic planner.';
const BEFORE_SAVE = 'When you save, your trip stays in this browser on this device. These trips do not sync to your account.';
const AFTER_SAVE = 'Saved in this browser on this device. These trips do not sync to your account.';
const FEEDBACK_TEXT = 'Send feedback';
const FEEDBACK_TARGET = 'mailto:backstage.innovators@gmail.com';

// Implementation wording (not owner-approved text): the classic links.
const CLASSIC_LINK = 'Go to the classic planner';
const CLASSIC_ESCAPE = 'Use the classic planner instead';
const REENTRY = "You'll need to enter your trip details again there.";

const KEY = 'door2_drafts_v1';
const bytes = () => window.localStorage.getItem(KEY);
const GLANCE = 'Your trip at a glance';
const glanceText = () => screen.getByText(GLANCE).closest('div').textContent;
const itineraryText = () => [...document.querySelectorAll('h3.uppercase')].map((h) => h.parentElement.textContent).join('|');
const pressed = (name) => screen.getByRole('button', { name }).getAttribute('aria-pressed');
const dialog = () => screen.queryByRole('dialog', { name: QUESTION });
const stopsOf = (trip) => trip.spec.stops.filter((s) => s.nights > 0).map((s) => [s.placeId, s.nights]);

const spec = (id, totalDays, extra = {}) => ({
  originPlaceId: 'vancouver', destination: { kind: 'country', id }, travelMonth: 10, totalDays,
  travellerType: 'couple', interests: [], pace: 'balanced', budget: 'mid', routeTemplateId: null,
  stops: [], requiredPlaceIds: [], choices: { pinned: [], rejected: [], placed: [] }, ...extra,
});
const builtTrip = (id, totalDays) => P.buildFilledTrip(spec(id, totalDays), P.PILOT_DATA, { reviewPolicy: 'allow_drafts' });

/** A page load at `path`: a brand-new page instance. Storage is cleared unless kept. */
function open({ path = '/plan', keepStorage = false } = {}) {
  cleanup();
  resetLocation(path);
  if (!keepStorage) clearStorage();
  planner.calls.length = 0;
  planner.next = null;
  planner.around = null;
  render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(P.Door2Plan)));
  return userEvent.setup();
}

async function toBasics(user, destination, days) {
  await user.click(await screen.findByText(destination));
  if (days) await setDays(user, days);
}

/** Destination → Basics → the traveller's own "Yes, from Vancouver" → Build. */
async function buildConfirmed(destination, days, options) {
  const user = open(options);
  await toBasics(user, destination, days);
  await user.click(screen.getByRole('button', { name: YES }));
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  return user;
}

/** Seed one saved trip and reopen it through "My saved trips → Continue". */
async function reopenSaved(trip) {
  const user = open();
  P.saveDraftTrip({ ...trip, history: [] }, 'Seeded trip');
  cleanup();
  render(React.createElement(MemoryRouter, { initialEntries: ['/plan'] }, React.createElement(P.Door2Plan)));
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
  await screen.findByText(GLANCE);
  return user;
}

async function save(user) {
  const before = new Set(P.listDraftTrips().map((d) => d.id));
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Saved');
  const added = P.listDraftTrips().filter((d) => !before.has(d.id));
  assert.equal(added.length, 1, 'Save stored exactly one draft');
  return added[0].trip;
}

async function refineAndApply(user, days) {
  await user.click(screen.getByRole('button', { name: 'Refine' }));
  await screen.findByText('Make it yours');
  if (days) await setDays(user, days);
  await user.click(screen.getByRole('button', { name: 'Apply and rebuild' }));
}

function assertClassicLink(scope, label = CLASSIC_LINK) {
  const link = within(scope).getByRole('link', { name: label });
  assert.equal(link.getAttribute('href'), '/find', 'a plain /find link, with no parameters');
  assert.ok(within(scope).getAllByText(REENTRY).length > 0, 'says the details must be entered again');
  assert.doesNotMatch(scope.textContent, /pre-?fill|carried over|transferred/i, 'promises no prefill');
}

const assertFeedbackLink = () =>
  assert.equal(screen.getByRole('link', { name: FEEDBACK_TEXT }).getAttribute('href'), FEEDBACK_TARGET);

// ── #1, #15, #16 and the stated limits ───────────────────────────────────────

test('#1: /plan with no key loads the planner, not "page not found"', async () => {
  open({ path: '/plan' });
  assert.ok(await screen.findByText('Where are you going?'));
  assert.ok(screen.getByText('Peru'), 'the destination step is usable');
  assert.equal(window.location.search, '', 'no key in the address');
});

test('header: the page header reads "WhereNova · Early access", and the old "Pilot preview" header is gone', async () => {
  open({ path: '/plan' });
  assert.ok(await screen.findByText('WhereNova · Early access'));
  assert.doesNotMatch(document.body.textContent, /WhereNova · Pilot preview/);
});

test('#1/§3.1: the limits text is shown verbatim on the destination step, with a classic link that needs no refusal first', async () => {
  open();
  const limits = await screen.findByText(LIMITS);
  assertClassicLink(limits.parentElement);
  assert.equal(planner.calls.length, 0);
});

test('§3.1: a country selector names its selected route, not the whole country', async () => {
  const user = open();
  await screen.findByText('Where are you going?');
  const chip = (country) => screen.getByText(country).closest('button').textContent;
  assert.equal(chip('Peru'), 'Peru · Peru classic with Huaraz options');
  assert.equal(chip('United States'), 'United States · New York City');
  assert.equal(chip('Japan'), 'Japan · Tokyo with Kyoto options');
  assert.equal(chip('Canada'), 'Canada · Eastern Canada corridor');
  // The same in search results.
  await user.type(screen.getByPlaceholderText('Search a country or place'), 'japan');
  assert.equal(screen.getByText('Japan').closest('button').textContent, 'Japan · Tokyo with Kyoto options');
});

test('#15: "Send feedback" is present on every view and opens an email to the project address, with nothing added', async () => {
  const user = open();
  await screen.findByText('Where are you going?');
  assertFeedbackLink();
  await toBasics(user, 'Japan', 19);
  assertFeedbackLink();
  await user.click(screen.getByRole('button', { name: YES }));
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  await screen.findByText(/can't be built yet/);
  assertFeedbackLink();
  await user.click(screen.getByRole('button', { name: 'Use 18 days' }));
  await screen.findByText(GLANCE);
  assertFeedbackLink();
  assert.equal(screen.getAllByRole('link', { name: FEEDBACK_TEXT }).length, 1);
});

test('#16 (source check only): /find still routes to the classic planner and /plan to this page', () => {
  // The classic planner needs the Base44 client and cannot be mounted in this
  // harness, so this reads the router. It is not a rendered check of /find.
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /<Route path="\/find" element=\{<DoorB \/>\} \/>/);
  assert.match(app, /<Route path="\/plan" element=\{<Door2Plan \/>\} \/>/);
});

// ── Wording, as rendered ─────────────────────────────────────────────────────

test('wording: the departure question and both answers, unanswered at first; the declined copy on "No"', async () => {
  const user = open();
  await toBasics(user, 'Peru');
  assert.ok(screen.getByText(QUESTION));
  assert.equal(pressed(YES), 'false', 'nothing preselected');
  assert.equal(pressed(NO), 'false', 'nothing preselected');
  assert.equal(screen.queryByText(DECLINED), null);

  await user.click(screen.getByRole('button', { name: NO }));
  assert.equal(pressed(NO), 'true');
  assert.equal(pressed(YES), 'false');
  const declined = screen.getByText(DECLINED);
  assertClassicLink(declined.parentElement);

  await user.click(screen.getByRole('button', { name: YES }));
  assert.equal(pressed(YES), 'true');
  assert.equal(screen.queryByText(DECLINED), null, 'the answer can be corrected');
});

test('wording: the before-save text until the traveller saves, the after-save text once they have, and before-save again after a change', async () => {
  const user = await buildConfirmed('Peru', 10);
  await screen.findByText(GLANCE);
  assert.ok(screen.getByText(BEFORE_SAVE));
  assert.equal(screen.queryByText(AFTER_SAVE), null, 'never reads as already saved');
  assert.equal(P.listDraftTrips().length, 0, 'and nothing is saved yet');

  await save(user);
  assert.ok(screen.getByText(AFTER_SAVE));
  assert.equal(screen.queryByText(BEFORE_SAVE), null);

  await user.click(screen.getAllByText('Swap')[0]);
  await screen.findByText('Swapped');
  assert.ok(screen.getByText(BEFORE_SAVE), 'the changed trip is not the saved one');
  assert.equal(screen.queryByText(AFTER_SAVE), null);
});

// ── #2, #3: no confirmation, no planner call ─────────────────────────────────

test('#2: confirmation unanswered → Build makes zero planner calls and no trip', async () => {
  const user = open();
  await toBasics(user, 'Peru', 10);
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  assert.equal(planner.calls.length, 0, 'zero planner calls');
  assert.equal(screen.queryByText(GLANCE), null, 'no trip');
  assert.equal(screen.queryByText(/can't be built yet/), null, 'and no refusal either');
  assert.ok(screen.getByRole('button', { name: 'Build my trip' }), 'still on the Basics step');
  assert.equal(screen.getByRole('alert').textContent, QUESTION, 'the unanswered question is pointed out');
  assert.equal(pressed(YES), 'false');
  assert.equal(pressed(NO), 'false');
});

test('#3: confirmation declined → Build makes zero planner calls, explains the limit and offers the classic planner', async () => {
  const user = open();
  await toBasics(user, 'Peru', 10);
  await user.click(screen.getByRole('button', { name: NO }));
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  assert.equal(planner.calls.length, 0, 'zero planner calls');
  assert.equal(screen.queryByText(GLANCE), null, 'no trip');
  assertClassicLink(screen.getByText(DECLINED).parentElement);
});

/** A reopened Japan trip with one day trip, so every structural control is on screen. */
async function reopenJapanWithDayTrip() {
  const base = builtTrip('JP', 10);
  const preview = P.previewAddExcursion(base, 'tokyo_base', 'nikko');
  assert.equal(preview.ok, true);
  return reopenSaved(P.applyProposal(base, preview.proposals[0]).trip);
}

const dayTripRow = (place) => screen.getAllByRole('button').find((b) => b.textContent.startsWith(place));
const STRUCTURAL_CONTROLS = [
  ['Refine → Apply and rebuild', (user) => refineAndApply(user)],
  ['a nights chip', (user) => user.click(screen.getAllByRole('button', { name: /^\d+ nights?$/ })[0])],
  ['adding a day trip', (user) => user.click(dayTripRow('Kamakura'))],
  ['removing a day trip', (user) => user.click(within(screen.getByText('Day trip: Nikko').parentElement).getByRole('button', { name: 'Remove' }))],
];
const assertNothingRebuilt = (before, label) => {
  assert.equal(planner.calls.length, 0, `${label}: zero planner calls`);
  assert.equal(screen.queryByText('How this would look'), null, `${label}: no preview was computed`);
  assert.equal(screen.queryByRole('button', { name: 'Use this plan' }), null, `${label}: nothing to apply`);
  assert.equal(screen.queryByRole('button', { name: /More time here/ }), null, `${label}: the nights sheet did not open`);
  assert.equal(glanceText(), before.glance, `${label}: trip retained`);
  assert.equal(itineraryText(), before.itinerary, `${label}: itinerary retained`);
  assert.equal(bytes(), before.bytes, `${label}: saved bytes retained`);
};

test('#3: declined → Refine and every structural control make zero planner calls, with the declined copy and the classic planner offered', async () => {
  const user = await reopenJapanWithDayTrip();
  const before = { glance: glanceText(), itinerary: itineraryText(), bytes: bytes() };

  for (const [label, act] of STRUCTURAL_CONTROLS) {
    await act(user);
    const prompt = dialog();
    assert.ok(prompt, `${label}: asks`);
    if (label === STRUCTURAL_CONTROLS[0][0]) {
      assert.equal(within(prompt).queryByText(DECLINED), null, 'not declined until the traveller says so');
      await user.click(within(prompt).getByRole('button', { name: NO }));
    }
    assertClassicLink(within(prompt).getByText(DECLINED).parentElement);
    assertNothingRebuilt(before, label);
    await user.click(within(prompt).getByRole('button', { name: 'Close' }));
    assert.equal(dialog(), null);
    if (label === STRUCTURAL_CONTROLS[0][0]) await user.click(screen.getByRole('button', { name: '×' })); // the Refine sheet
  }
  assertNothingRebuilt(before, 'afterwards');
});

test('#3/#8: unanswered → every structural control asks first and rebuilds nothing; "Add a place" too', async () => {
  let user = await reopenJapanWithDayTrip();
  let before = { glance: glanceText(), itinerary: itineraryText(), bytes: bytes() };
  for (const [label, act] of STRUCTURAL_CONTROLS) {
    await act(user);
    const prompt = dialog();
    assert.ok(prompt, `${label}: asks`);
    assert.equal(within(prompt).getByRole('button', { name: YES }).getAttribute('aria-pressed'), 'false');
    assert.equal(within(prompt).getByRole('button', { name: NO }).getAttribute('aria-pressed'), 'false');
    assertNothingRebuilt(before, label);
    await user.click(within(prompt).getByRole('button', { name: 'Close' }));
    if (label === STRUCTURAL_CONTROLS[0][0]) await user.click(screen.getByRole('button', { name: '×' }));
  }

  // Peru carries the optional place ("+ Add a place").
  user = await reopenSaved(builtTrip('PE', 10));
  before = { glance: glanceText(), itinerary: itineraryText(), bytes: bytes() };
  await user.click(screen.getByText('Huaraz & the Cordillera Blanca'));
  assert.ok(dialog(), 'adding a place asks');
  assert.equal(screen.queryByText('Add Huaraz & the Cordillera Blanca'), null, 'the add sheet did not open');
  assertNothingRebuilt(before, 'adding a place');
});

// ── #4, #5: confirmed builds (regression guards) ─────────────────────────────

test('#4: Vancouver confirmed → Peru 10 days builds the core route, as today', async () => {
  const user = await buildConfirmed('Peru', 10);
  await screen.findByText(GLANCE);
  assert.equal(planner.calls.length, 1);
  assert.equal(planner.calls[0].originPlaceId, 'vancouver');
  assert.deepEqual(planner.calls[0].destination, { kind: 'country', id: 'PE' });
  const trip = await save(user);
  assert.deepEqual(stopsOf(trip), [['lima', 2], ['cusco', 3], ['aguas_calientes', 1], ['lima', 1]]);
  assert.equal(trip.spec.totalDays, 10);
  assert.equal(trip.spec.originPlaceId, 'vancouver');
  assert.deepEqual(trip.days, JSON.parse(JSON.stringify(builtTrip('PE', 10).days)), 'the same itinerary the engine builds directly');
});

test('#5: Vancouver confirmed → New York at a supported length builds the New York family', async () => {
  const user = await buildConfirmed('United States');
  await screen.findByText(GLANCE);
  assert.equal(planner.calls.length, 1);
  assert.equal(screen.queryByText(/can't be built yet/), null);
  const trip = await save(user);
  assert.deepEqual(trip.spec.destination, { kind: 'country', id: 'US' });
  assert.deepEqual([...new Set(stopsOf(trip).map(([placeId]) => placeId))], ['new_york']);
  assert.equal(trip.routePlan.familyId, builtTrip('US', 10).routePlan.familyId);
});

// ── #6: the confirmation is kept for the planning session ────────────────────

test('#6: recovery, refinement and alternative selection keep the confirmation', async () => {
  const user = await buildConfirmed('Peru', 5);
  await screen.findByText(/can't be built yet/);
  assert.equal(planner.calls.length, 1);

  await user.click(screen.getByRole('button', { name: /Add 3 days/ })); // recovery
  await screen.findByText(GLANCE);
  assert.equal(planner.calls.length, 2);
  assert.equal(dialog(), null);

  await refineAndApply(user, 14); // refinement (at 14 days Peru has a second route to choose)
  await screen.findByText(GLANCE);
  assert.equal(planner.calls.length, 3);
  assert.equal(planner.calls[2].totalDays, 14);
  assert.equal(dialog(), null);

  const alternative = screen.getAllByRole('button').find((b) => /· \d+ stops/.test(b.textContent));
  assert.ok(alternative, 'a route alternative is offered');
  await user.click(alternative); // alternative selection
  await screen.findByText('Route changed');
  assert.equal(planner.calls.length, 4);
  assert.equal(dialog(), null);
  assert.ok(planner.calls.every((c) => c.originPlaceId === 'vancouver'));
});

test('#6: a retry after a fault keeps the confirmation', async () => {
  const user = await buildConfirmed('Peru', 10);
  await screen.findByText(GLANCE);
  planner.next = () => { throw new Error('fictional planner fault'); };
  await refineAndApply(user);
  await screen.findByText('fictional planner fault');
  assert.equal(planner.calls.length, 2);

  await refineAndApply(user); // retry
  assert.equal(planner.calls.length, 3);
  assert.equal(dialog(), null, 'not asked again');
  assert.equal(screen.queryByText('fictional planner fault'), null, 'the fault view clears once a rebuild succeeds');
  assert.ok(screen.getByText(GLANCE));
});

// ── #7: fresh start ──────────────────────────────────────────────────────────

/** The synthetic curated-experience catalogue of flowF6Connections: a trip that
 * records evidence, which is what makes "Start a new trip" ask before discarding. */
function withRecordedEvidence() {
  const time = '2026-10-05T12:00:00.000Z';
  const places = { ...P.PILOT_DATA.places, vancouver: { ...P.PILOT_DATA.places.vancouver, utcOffsetHours: 0 }, tokyo: { ...P.PILOT_DATA.places.tokyo, utcOffsetHours: 0 } };
  const data = {
    ...P.PILOT_DATA, places,
    routePackages: [structuredClone(P.PILOT_DATA.routePackages.find((p) => p.id === 'tokyo_city'))],
    connections: [{
      id: 'fictional_train', fromPlaceId: 'vancouver', toPlaceId: 'tokyo', direction: 'bidirectional', mode: 'train', inVehicleHours: 2,
      reviewedBy: 'fixture reviewer', reviewedAt: time, localTransferHours: { origin: 0.5, destination: 0.25 },
      experiences: [{
        id: 'cx_fixture_view', title: 'Fictional train view', description: 'A synthetic view inside travel time.', appliesTo: 'forward', timeCost: 'within_connection',
        review: { status: 'approved', reviewedBy: 'fixture reviewer', reviewedAt: time, sourceUrl: 'https://example.invalid/fictional' },
        provenance: { sourceBundleId: 'fixture', sourceTemplateTitle: 'transfer', sourceFragmentId: 'view' },
      }],
    }],
  };
  planner.around = (real, s, _data, options) =>
    real(s, data, { ...options, connectionContext: { ...options.connectionContext, generatedAt: time, estimates: [] } });
}

test('#7: a cancelled fresh start keeps the trip and the confirmation; a confirmed fresh start resets the confirmation', async () => {
  const user = open();
  withRecordedEvidence();
  await toBasics(user, 'Japan', 5);
  await user.click(screen.getByRole('button', { name: YES }));
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  await screen.findByText(GLANCE);
  await user.click(screen.getAllByRole('button', { name: 'Swap' })[0]);
  const kept = await save(user);
  assert.equal(planner.calls.length, 1);

  // Cancelled.
  await user.click(screen.getByRole('button', { name: 'Start a new trip' }));
  await user.click(await screen.findByRole('button', { name: 'Keep my trip' }));
  assert.deepEqual(await save(user), kept, 'trip retained');
  await refineAndApply(user);
  await user.click(await screen.findByRole('button', { name: 'Rebuild' })); // the edit is about to be discarded
  assert.equal(dialog(), null, 'confirmation retained: the rebuild is not asked about');
  assert.equal(planner.calls.length, 2, 'and it ran');

  // Confirmed.
  await user.click(screen.getAllByRole('button', { name: 'Swap' })[0]);
  await user.click(screen.getByRole('button', { name: 'Start a new trip' }));
  await user.click(await screen.findByRole('button', { name: 'Start over' }));
  await toBasics(user, 'Japan', 5);
  assert.equal(pressed(YES), 'false', 'confirmation reset');
  assert.equal(pressed(NO), 'false');
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  assert.equal(planner.calls.length, 2, 'no planner call until it is given again');
  await user.click(screen.getByRole('button', { name: YES }));
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  await screen.findByText(GLANCE);
  assert.equal(planner.calls.length, 3);
});

test('#7: "Start a new trip" with nothing to discard is a fresh start too, and resets the confirmation', async () => {
  const user = await buildConfirmed('Peru', 10);
  await screen.findByText(GLANCE);
  await user.click(screen.getByRole('button', { name: 'Start a new trip' }));
  await toBasics(user, 'Peru', 10);
  assert.equal(pressed(YES), 'false');
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  assert.equal(planner.calls.length, 1, 'only the first build');
  assert.equal(screen.queryByText(GLANCE), null);
});

// ── #8: reopening a saved trip (regression guard) ────────────────────────────

test('#8: a reopened trip opens, shows, takes activity edits and saves with no confirmation prompt and no planner call', async () => {
  const seeded = builtTrip('PE', 10);
  const user = await reopenSaved(seeded);
  const stored = bytes();
  assert.equal(dialog(), null, 'no prompt on opening');
  assert.equal(screen.queryByText(QUESTION), null);
  assert.equal(planner.calls.length, 0);
  assert.ok(screen.getByText(BEFORE_SAVE));

  await user.click(screen.getAllByText('Swap')[0]);
  await screen.findByText('Swapped');
  await user.click(screen.getAllByRole('button', { name: /options/ })[0]);
  await user.click(await screen.findByText('Make lighter'));
  await user.click(screen.getByRole('button', { name: 'Undo last change' }));
  await screen.findByText('Undone');
  assert.equal(dialog(), null, 'no prompt for activity edits');
  assert.equal(bytes(), stored, 'saved bytes untouched until the traveller saves');

  const saved = await save(user);
  assert.equal(dialog(), null, 'no prompt for saving');
  assert.equal(saved.spec.choices.placed.length, 1, 'the swap was saved');
  assert.equal(P.listDraftTrips().length, 2, 'saved as its own draft; the reopened one is still there');
  assert.equal(planner.calls.length, 0);
});

test('#8: the first rebuild after reopening requires confirmation; until then the trip and the saved bytes are retained', async () => {
  const user = await reopenSaved(builtTrip('PE', 10));
  const before = { glance: glanceText(), itinerary: itineraryText(), bytes: bytes() };

  await refineAndApply(user);
  const prompt = dialog();
  assert.ok(prompt, 'asked from Refine');
  assert.ok(within(prompt).getByText(QUESTION));
  assert.equal(planner.calls.length, 0);
  assert.equal(glanceText(), before.glance);
  assert.equal(itineraryText(), before.itinerary);
  assert.equal(bytes(), before.bytes);

  await user.click(within(prompt).getByRole('button', { name: YES }));
  await screen.findByText(GLANCE);
  assert.equal(dialog(), null);
  assert.equal(planner.calls.length, 1, 'the rebuild the traveller asked for then runs');
  assert.equal(planner.calls[0].originPlaceId, 'vancouver');
  assert.equal(bytes(), before.bytes, 'a rebuild alone saves nothing');

  await refineAndApply(user);
  assert.equal(dialog(), null, 'asked once per planning session');
  assert.equal(planner.calls.length, 2);
});

test('#8: after reopening, a structural control asks, then carries on with what the traveller tapped', async () => {
  const user = await reopenSaved(builtTrip('PE', 10));
  await user.click(screen.getAllByRole('button', { name: /^\d+ nights?$/ })[0]);
  const prompt = dialog();
  assert.ok(prompt);
  assert.equal(screen.queryByRole('button', { name: /More time here/ }), null);
  await user.click(within(prompt).getByRole('button', { name: YES }));
  assert.equal(dialog(), null);
  assert.ok(screen.getByRole('button', { name: /More time here/ }), 'the nights sheet opens');
  await user.click(screen.getByRole('button', { name: /More time here/ }));
  assert.ok((await screen.findAllByText('Use this plan')).length > 0, 'and structural edits work');
  assert.equal(planner.calls.length, 0, 'a nights preview is not a planner build');
});

test('#8: a confirmation given on the Basics step is not carried into a saved trip opened afterwards', async () => {
  const user = open();
  P.saveDraftTrip({ ...builtTrip('PE', 10), history: [] }, 'Seeded trip');
  cleanup();
  render(React.createElement(MemoryRouter, { initialEntries: ['/plan'] }, React.createElement(P.Door2Plan)));
  await toBasics(user, 'Japan');
  await user.click(screen.getByRole('button', { name: YES }));
  await user.click(screen.getByText('← Back'));
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
  await screen.findByText(GLANCE);
  await refineAndApply(user);
  assert.ok(dialog(), 'the reopened trip asks for itself');
  assert.equal(within(dialog()).getByRole('button', { name: YES }).getAttribute('aria-pressed'), 'false');
  assert.equal(planner.calls.length, 0);
});

// ── #9: reload ───────────────────────────────────────────────────────────────

test('#9: a reload never infers the confirmation', async () => {
  let user = await buildConfirmed('Peru', 10);
  await screen.findByText(GLANCE);
  await save(user);
  assert.equal(planner.calls.length, 1);

  // A new page instance over the same storage: a new trip is asked again.
  user = open({ keepStorage: true });
  await toBasics(user, 'Peru', 10);
  assert.equal(pressed(YES), 'false');
  assert.equal(pressed(NO), 'false');
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  assert.equal(planner.calls.length, 0);
  assert.equal(screen.queryByText(GLANCE), null);

  // And the trip saved before the reload is asked about before its first rebuild.
  user = open({ keepStorage: true });
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
  await screen.findByText(GLANCE);
  await refineAndApply(user);
  assert.ok(dialog());
  assert.equal(planner.calls.length, 0);
  assert.equal(JSON.stringify(Object.keys(window.localStorage)), JSON.stringify([KEY]), 'nothing about the answer is stored');
});

// ── A restored trip from another origin ──────────────────────────────────────

test('§3.2: a restored trip recorded from another origin is not rewritten to Vancouver; the limit is explained and the classic path offered', async () => {
  const base = builtTrip('PE', 10);
  const foreign = { ...base, spec: { ...base.spec, originPlaceId: 'another_city' } };
  const user = await reopenSaved(foreign);
  const before = { glance: glanceText(), itinerary: itineraryText(), bytes: bytes() };
  assert.equal(P.listDraftTrips()[0].trip.spec.originPlaceId, 'another_city', 'the seeded trip really records another origin');
  assertClassicLink(screen.getByText(DECLINED).parentElement);

  for (const [label, act] of [
    ['Refine', (u) => refineAndApply(u)],
    ['a nights chip', (u) => u.click(screen.getAllByRole('button', { name: /^\d+ nights?$/ })[0])],
  ]) {
    await act(user);
    const prompt = dialog();
    assert.ok(prompt, `${label}: explains`);
    assert.ok(within(prompt).getByText(DECLINED));
    assert.equal(within(prompt).queryByRole('button', { name: YES }), null, `${label}: "Yes" cannot make it a Vancouver trip`);
    assertNothingRebuilt(before, label);
    await user.click(within(prompt).getByRole('button', { name: 'Close' }));
    if (label === 'Refine') await user.click(screen.getByRole('button', { name: '×' }));
  }
  const saved = await save(user);
  assert.equal(saved.spec.originPlaceId, 'another_city', 'saving keeps the recorded origin');
});

// ── #10, #11: ordinary refusals ──────────────────────────────────────────────

test('#10: a destination search with no match keeps its message and adds a plain classic link with the re-entry disclosure', async () => {
  const user = open();
  await user.type(await screen.findByPlaceholderText('Search a country or place'), 'Bali');
  const miss = screen.getByText('No matches in the pilot catalogue yet.');
  assertClassicLink(miss.parentElement);
  assert.equal(planner.calls.length, 0);
});

for (const days of [18, 12]) {
  test(`#11: Japan 19 days is the existing too-long refusal, with a working ${days}-day recovery and the classic offer`, async () => {
    const user = await buildConfirmed('Japan', 19);
    const heading = await screen.findByText(/can't be built yet/);
    const panel = heading.closest('div').parentElement;
    assert.equal(screen.queryByText('Something went wrong'), null, 'an ordinary refusal, not the fault view');
    assert.equal(screen.queryByRole('alert'), null);
    assert.ok(within(panel).getByText('These routes support 5–12 or 8–18 days. You asked for 19.'));
    assert.ok(within(panel).getByRole('button', { name: 'Use 18 days' }));
    assert.ok(within(panel).getByRole('button', { name: 'Use 12 days' }));
    assertClassicLink(panel);
    const offer = within(panel).getByRole('link', { name: CLASSIC_LINK });
    for (const button of within(panel).getAllByRole('button')) {
      assert.ok(button.compareDocumentPosition(offer) & window.Node.DOCUMENT_POSITION_FOLLOWING, 'the classic offer sits below every recovery action');
    }
    assert.ok(screen.getByRole('button', { name: 'Back to form' }));

    await user.click(within(panel).getByRole('button', { name: `Use ${days} days` }));
    await screen.findByText(GLANCE);
    assert.equal((await save(user)).spec.totalDays, days);
    assert.equal(planner.calls.at(-1).totalDays, days);
  });
}

// ── #12, #13, #14: faults ────────────────────────────────────────────────────

const CONTEXT_MESSAGE = "We couldn't start this plan because required planning information is missing or invalid. Your trip has not changed.";
const FAULTS = [
  ['#12 invalid context', CONTEXT_MESSAGE,
    (real, s, data, options) => real(s, data, { ...options, connectionContext: { ...options.connectionContext, generatedAt: 'not-a-date' } })],
  ['#13 thrown error', 'fictional planner fault', () => { throw new Error('fictional planner fault'); }],
  ['#14 unrecognized refusal reason', 'A message only this refusal carries.',
    () => ({ ok: false, state: 'destination_not_covered', message: 'A message only this refusal carries.',
      options: [{ action: 'check_back_later', detail: 'A detail only this refusal carries.' }], detail: { reason: 'reason_added_later' } })],
];

function assertFaultView(message) {
  const fault = screen.getByRole('alert');
  assert.ok(within(fault).getByText('Something went wrong'), 'the distinct error view');
  assert.ok(within(fault).getByText(message), 'message preserved');
  assert.equal(screen.queryByText(/can't be built yet/), null, 'not presented as an ordinary refusal');
  assert.equal(screen.queryByText("We don't have trips to this destination yet."), null, 'nor as an unsupported destination');
  assert.equal(within(fault).queryByRole('link', { name: CLASSIC_LINK }), null, 'no ordinary classic offer');
  assertClassicLink(fault, CLASSIC_ESCAPE);
  assert.equal(window.location.pathname, '/plan', 'no automatic redirect');
  return fault;
}

for (const [name, message, stand] of FAULTS) {
  test(`${name}, on a first build: distinct error view, message preserved, no automatic redirect`, async () => {
    const user = open();
    await toBasics(user, 'Peru', 10);
    await user.click(screen.getByRole('button', { name: YES }));
    planner.next = stand;
    await user.click(screen.getByRole('button', { name: 'Build my trip' }));
    assertFaultView(message);
    assert.equal(planner.calls.length, 1);
    assert.equal(screen.queryByText(GLANCE), null, 'there was no trip to retain');
    assert.ok(screen.getByRole('button', { name: 'Back to form' }));
  });

  test(`${name}, on a rebuild: distinct error view, message preserved, trip retained, no automatic redirect`, async () => {
    const user = await buildConfirmed('Peru', 10);
    await screen.findByText(GLANCE);
    const kept = await save(user);
    const before = { glance: glanceText(), itinerary: itineraryText(), bytes: bytes() };

    planner.next = stand;
    await refineAndApply(user);
    assertFaultView(message);
    assert.equal(planner.calls.length, 2);
    assert.equal(glanceText(), before.glance, 'trip retained');
    assert.equal(itineraryText(), before.itinerary);
    assert.equal(bytes(), before.bytes, 'saved bytes retained');
    assert.equal(screen.queryByText('Route changed'), null);
    assert.deepEqual(await save(user), kept, 'and it is still the same trip');
  });
}

test('#14: the classification reads the explicit state, reason and phase — never the broad state or the message', () => {
  const refusal = (state, detail, message = 'any') => ({ ok: false, state, message, options: [], detail });
  for (const [state, reason] of [
    ['destination_not_covered', 'not_covered'], ['destination_not_covered', 'country_unknown'],
    ['route_not_supported', 'too_long'], ['route_not_supported', 'duration_gap'],
    ['route_not_supported', 'no_package_covers_all_required'], ['route_not_supported', 'route_constraint_incompatible'],
    ['duration_too_short', 'too_short'], ['required_place_conflict', 'too_short'],
  ]) assert.equal(P.refusalKind(refusal(state, { reason })), 'ordinary', `${state}/${reason}`);

  for (const [label, result] of [
    ['invalid context', refusal('route_not_supported', { reason: 'connection_context_invalid', phase: 'pre_validation' })],
    ['a recognized reason in a declared phase', refusal('route_not_supported', { reason: 'too_long', phase: 'pre_validation' })],
    ['an estimation fault', refusal('route_not_supported', { reason: 'estimation_input_invalid', field: null })],
    ['an authoring fault', refusal('route_not_supported', { reason: 'no_stop_can_take_nights' })],
    ['an unknown reason', refusal('route_not_supported', { reason: 'reason_added_later' })],
    ['a known reason under the wrong state', refusal('destination_not_covered', { reason: 'too_long' })],
    ['an unknown state', refusal('state_added_later', { reason: 'too_long' })],
    ['a prototype name as state', refusal('constructor', { reason: 'too_long' })],
    ['no reason', refusal('route_not_supported', {})],
    ['no detail', refusal('route_not_supported', null)],
    ['the ordinary message with an unknown reason', refusal('route_not_supported', { reason: 'other' }, 'These routes support 5–12 or 8–18 days. You asked for 19.')],
  ]) assert.equal(P.refusalKind(result), 'fault', label);
});

// ── Amendments (6 October 2026): the departure dialog's keyboard focus, and the two replaced strings ──

const active = () => document.activeElement;
const inside = (scope) => scope.contains(active());
const activeName = () => active().getAttribute('aria-label') ?? active().textContent;

test('amendment A1: the dialog takes focus when it opens, keeps Tab and Shift+Tab inside, and the background control is unreachable', async () => {
  const user = await reopenSaved(builtTrip('PE', 10));
  const apply = () => screen.getByRole('button', { name: 'Apply and rebuild' });
  await user.click(screen.getByRole('button', { name: 'Refine' }));
  await screen.findByText('Make it yours');
  await user.click(apply());
  const prompt = dialog();
  assert.ok(prompt, 'asked');
  assert.ok(inside(prompt), 'focus moved into the dialog');
  assert.notEqual(active(), apply(), 'and not left on the background control');
  assert.equal(activeName(), YES, 'on the question, not the dismissal');

  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    await user.tab();
    assert.ok(inside(prompt), `Tab ${i + 1} stays inside`);
    seen.add(activeName());
  }
  for (let i = 0; i < 8; i++) {
    await user.tab({ shift: true });
    assert.ok(inside(prompt), `Shift+Tab ${i + 1} stays inside`);
    seen.add(activeName());
  }
  assert.deepEqual([...seen].sort(), ['Close', NO, YES].sort(), 'the cycle covers exactly the dialog\'s controls');

  // The boundaries themselves: Shift+Tab from the first control wraps to the last, Tab from the last to the first.
  const first = within(prompt).getByRole('button', { name: 'Close' });
  first.focus();
  await user.tab({ shift: true });
  assert.equal(activeName(), NO, 'Shift+Tab from the first control wraps to the last');
  await user.tab();
  assert.equal(activeName(), 'Close', 'Tab from the last control wraps to the first');
  assert.equal(planner.calls.length, 0, 'no planner call while it is open');
});

test('amendment A1: Escape cancels, builds nothing, and focus returns to the control the traveller used', async () => {
  const user = await reopenSaved(builtTrip('PE', 10));
  const before = { glance: glanceText(), itinerary: itineraryText(), bytes: bytes() };
  await user.click(screen.getByRole('button', { name: 'Refine' }));
  await screen.findByText('Make it yours');
  await user.click(screen.getByRole('button', { name: 'Apply and rebuild' }));
  assert.ok(dialog());
  await user.keyboard('{Escape}');
  assert.equal(dialog(), null, 'Escape closes');
  assert.equal(active(), screen.getByRole('button', { name: 'Apply and rebuild' }), 'focus is back on Apply and rebuild');
  assertNothingRebuilt(before, 'Escape');

  // Close, by keyboard, returns it too.
  await user.keyboard('{Enter}');
  assert.ok(dialog());
  within(dialog()).getByRole('button', { name: 'Close' }).focus();
  await user.keyboard('{Enter}');
  assert.equal(dialog(), null);
  assert.equal(active(), screen.getByRole('button', { name: 'Apply and rebuild' }));
  assert.equal(planner.calls.length, 0);
});

test('amendment A1: the nights path — focus is contained, Escape returns to the nights chip, and "Yes" lands in the nights sheet', async () => {
  const user = await reopenSaved(builtTrip('PE', 10));
  const chip = screen.getAllByRole('button', { name: /^\d+ nights?$/ })[0];
  await user.click(chip);
  let prompt = dialog();
  assert.ok(prompt);
  assert.ok(inside(prompt), 'focus moved into the dialog');
  for (let i = 0; i < 5; i++) {
    await user.tab();
    assert.ok(inside(prompt), `Tab ${i + 1} stays inside`);
    assert.ok(!chip.contains(active()), 'the background nights chip is unreachable');
  }
  await user.keyboard('{Escape}');
  assert.equal(dialog(), null);
  assert.equal(active(), chip, 'focus returns to the chip');
  assert.equal(screen.queryByRole('button', { name: /More time here/ }), null, 'the sheet did not open');

  await user.click(chip);
  prompt = dialog();
  within(prompt).getByRole('button', { name: YES }).focus();
  await user.keyboard('{Enter}');
  assert.equal(dialog(), null);
  const more = screen.getByRole('button', { name: /More time here/ });
  const sheet = more.closest('div.fixed');
  assert.ok(sheet, 'the nights sheet is open');
  assert.ok(inside(sheet), 'focus is in the nights sheet, not behind it');
  assert.notEqual(active(), document.body);
});

test('amendment A1: "Yes" on the Refine path lands in the resulting interface, never on the removed dialog or the body', async () => {
  const user = await reopenSaved(builtTrip('PE', 10));
  await refineAndApply(user);
  assert.ok(dialog());
  await user.keyboard('{Enter}'); // focus starts on "Yes, from Vancouver"
  await screen.findByText(GLANCE);
  assert.equal(dialog(), null);
  assert.equal(planner.calls.length, 1, 'the rebuild ran');
  assert.ok(active().isConnected, 'focus is on something still on the page');
  assert.notEqual(active(), document.body);
  assert.equal(document.querySelector('div.fixed.inset-0.z-50'), null, 'no sheet is left open behind it');
});

test('amendment A1: a trip from another origin gets the same containment and Escape', async () => {
  const base = builtTrip('PE', 10);
  const user = await reopenSaved({ ...base, spec: { ...base.spec, originPlaceId: 'another_city' } });
  const chip = screen.getAllByRole('button', { name: /^\d+ nights?$/ })[0];
  await user.click(chip);
  const prompt = dialog();
  assert.ok(prompt);
  assert.ok(inside(prompt), 'focus moved in');
  for (let i = 0; i < 4; i++) { await user.tab(); assert.ok(inside(prompt)); }
  await user.keyboard('{Escape}');
  assert.equal(dialog(), null);
  assert.equal(active(), chip);
});

// ── Amendment A2: the two replaced strings, as rendered ──────────────────────

const FOOTER = 'Early-access planner — selected routes from Vancouver: New York City, Tokyo with Kyoto options, Peru classic with Huaraz options, and the Eastern Canada corridor.';
const DRAFT_NOTE = 'Draft itinerary — some transport details have not been reviewed. Use this for testing and feedback, not for booking.';

test('amendment A2: the results footer and the draft note render the owner-approved text, and the old text is gone', async () => {
  await buildConfirmed('Peru', 10);
  await screen.findByText(GLANCE);
  assert.ok(screen.getByText(FOOTER));
  assert.equal(screen.queryByText(DRAFT_NOTE), null, 'a reviewed trip carries no draft note');
  assert.doesNotMatch(document.body.textContent, /Pilot preview — Peru and Eastern Canada|Not for real travellers/);

  // The same trip, flagged draft: the flag decides which line shows, and nothing else changes.
  const draft = { ...builtTrip('PE', 10), status: 'draft' };
  await reopenSaved(draft);
  const note = screen.getByText(DRAFT_NOTE);
  assert.match(note.textContent, /transport details have not been reviewed/, 'still warns that transport is unreviewed');
  assert.match(note.textContent, /not for booking/, 'still carries the booking caution');
  assert.doesNotMatch(note.textContent, /verified|reviewed and|approved/i, 'does not suggest the transport has been verified');
  assert.equal(screen.queryByText(FOOTER), null, 'the draft note replaces the footer, as before');
  assert.doesNotMatch(document.body.textContent, /Not for real travellers/);
  assert.equal(P.listDraftTrips().find((d) => d.label === 'Seeded trip').trip.status, 'draft', 'the stored flag is untouched');
});
