import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';

// Standing rule 2 (docs/adr/README.md) for the stale-multi-stop-legs fix:
// docs/briefs/q8-p2-getter/build-brief-stale-multistop-legs-override-2026-10-27-rev2.md
// §4.3. This is the completion gate -- it renders the ACTUAL Results and
// TripDetail pages in a DOM, drives them with real clicks, and asserts on what
// the traveller sees and the state that results. The unit tests in
// classicTripIntent.test.js pin the setters; they do not satisfy this gate.
//
// The flow: a traveller carrying stale multi-stop legs runs the classic
// planner, clicks the SECOND result, and must land on the destination they
// actually clicked -- not the stale multi-stop trip the legs used to win with.
//
// §6's S2-1 rides along at the bottom: it is a DOM test of the same real auth
// consumer, and §5 caps this build at two new test files.
//
// The pages are bundled exactly as shipped. Only the network client and the
// SDK's axios client are stubbed (see loadClassicPlannerModule) so the flow is
// deterministic; the real AuthContext, the real storage module and the real
// scoring/itinerary engines all run.

import {
  classicHarness,
  clearStorage,
  loadClassicPlannerModule,
  resetLocation,
  teardown,
} from './helpers/domHarness.js';

const PREFS = {
  residenceCountry: 'Canada', departureCity: 'Testville', citizenship: 'Canada',
  travelMonth: 7, travelDays: 9, travellerType: 'couple', budget: 'mid',
  interests: ['Food', 'Nature'], climate: ['Warm'], pace: 'Balanced',
  activity: 'Moderate', dietary: 'None', dietaryOther: '',
};

// Enough authored days for the itinerary generator to produce a real trip --
// without day_templates it returns [] and a multi-stop leg gets dropped.
const dayTemplates = (name) => [1, 2, 3, 4, 5].map((n) => ({
  title: `${name} day ${n}`,
  intensity: 'Moderate',
  interests: ['Food'],
  morning: `${name} morning ${n}`,
  afternoon: `${name} afternoon ${n}`,
  evening: `${name} evening ${n}`,
}));

// Domestic, close to the Canada centroid that getCityCoords falls back to, so
// every one of these is comfortably practical for a 9-day trip and reaches the
// results list on its merits.
const destination = (id, name, extra = {}) => ({
  id, name, country: 'Canada', region: 'Test Region',
  gateway_lat: 56.1, gateway_lng: -106.3,
  intro: `${name} intro text.`, min_days: 2, max_days: 14,
  budget_categories: ['mid'], climate_tags: ['Warm'], traveller_types: ['couple'],
  best_for_summary: '', top_experiences: [`${name} experience one`], image_url: '',
  primary_interests: ['Food'], day_templates: dayTemplates(name),
  ...extra,
});

// The two stale-leg destinations carry min_days 30, so they are excluded from a
// 9-day ranking and can never appear as a result card. Anything of theirs on
// the trip page therefore came from the stale legs, not from the click.
const STALE_LEGS = [
  { destinationId: 'stale-one', days: 5 },
  { destinationId: 'stale-two', days: 4 },
];
const CATALOGUE = [
  destination('alpha', 'Alphaville'),
  destination('bravo', 'Bravoton'),
  destination('charlie', 'Charlieburg'),
  destination('stale-one', 'Staleport', { min_days: 30 }),
  destination('stale-two', 'Oldhaven', { min_days: 30 }),
];

let M;
let harness;
let realConsoleError;

before(async () => {
  harness = classicHarness({ destinations: CATALOGUE });
  M = await loadClassicPlannerModule();
  // AuthContext logs every failed auth check. Swallow exactly that line and
  // let every other diagnostic through, so a real React warning still shows.
  realConsoleError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].startsWith('User auth check failed:')) return;
    realConsoleError(...args);
  };
});

after(async () => {
  console.error = realConsoleError;
  assert.equal(console.error, realConsoleError, 'console.error must be restored');
  await teardown();
});

async function testingLibrary() {
  const rtl = await import('@testing-library/react');
  const userEvent = (await import('@testing-library/user-event')).default;
  return { ...rtl, userEvent };
}

/** Render the two real pages under one router, at `entry`. */
function renderApp(el, entry) {
  return el(M.AuthProvider, null,
    el(M.MemoryRouter, { initialEntries: [entry] },
      el(M.Routes, null,
        el(M.Route, { path: '/results', element: el(M.Results) }),
        el(M.Route, { path: '/trip', element: el(M.TripDetail) }),
        el(M.Route, { path: '/questionnaire', element: el('div', null, 'QUESTIONNAIRE-FALLBACK') }))));
}

/** Seed stale legs as real persisted bytes, render /results, click the SECOND
 * result card's own CTA, and return once the trip page has rendered. */
async function clickSecondResult() {
  const { render, screen, within, cleanup, userEvent } = await testingLibrary();
  cleanup();
  resetLocation('/results');
  clearStorage();
  harness.destinations = CATALOGUE;
  M.setPrefs(PREFS);
  M.setMultiStopLegs(STALE_LEGS);
  // The stale plan really is in storage, parsed back out, before the click.
  assert.equal(M.getMultiStopLegs().length, 2, 'the stale legs must be seeded');

  render(renderApp(M.React.createElement, '/results'));
  await screen.findByText(/Your top/i, {}, { timeout: 10000 });

  const cards = [...document.querySelectorAll('article')];
  assert.ok(cards.length >= 2, `need at least two result cards, got ${cards.length}`);
  const clickedName = cards[1].querySelector('h2, h3').textContent;
  // The stale destinations are min_days-excluded, so they cannot be a card.
  assert.ok(!['Staleport', 'Oldhaven'].includes(clickedName), 'a stale destination must never be a result card');

  const user = userEvent.setup();
  await user.click(within(cards[1]).getByRole('button', { name: /View my trip/i }));
  await screen.findByRole('button', { name: 'Save itinerary' }, { timeout: 10000 });
  return { clickedName, screen, user };
}

test('§4.3 (1): clicking the second result opens the trip page for the destination the traveller actually clicked', async () => {
  const { clickedName } = await clickSecondResult();

  assert.equal(document.querySelector('h1').textContent, clickedName);
  assert.equal(clickedName, 'Bravoton', 'the second card at these fixtures is Bravoton');
  assert.equal(M.getSelectedDestinationId(), 'bravo');
});

test('§4.3 (2): no trace of the stale multi-stop trip survives on the trip page -- not a leg name, not the stitched day count', async () => {
  await clickSecondResult();

  const shown = document.body.textContent;
  assert.equal(shown.includes('Staleport'), false, 'the first stale leg must not appear');
  assert.equal(shown.includes('Oldhaven'), false, 'the second stale leg must not appear');
  // MultiStopStrip renders "Name · Nd" joined by "→". None of it may be here.
  assert.equal(shown.includes('→'), false, 'the multi-stop leg separator must not appear');
  assert.equal(shown.includes('· 5d'), false, 'the first stale leg day count must not appear');
  assert.equal(shown.includes('· 4d'), false, 'the second stale leg day count must not appear');
});

test('§4.3 (3): the record persisted by the click carries no multiStopLegs', async () => {
  await clickSecondResult();

  assert.equal(M.getMultiStopLegs(), null);
  assert.equal(Object.prototype.hasOwnProperty.call(M.loadState(), 'multiStopLegs'), false);
});

test('§4.3 (4): driving the real Save control writes a snapshot for the clicked destination, not the stale trip', async () => {
  const { clickedName, screen, user } = await clickSecondResult();
  assert.equal(M.getSavedTrips().length, 0, 'nothing is saved before the click on Save');

  await user.click(screen.getByRole('button', { name: 'Save itinerary' }));
  // The traveller-visible confirmation: the control becomes the replace control.
  await screen.findByRole('button', { name: 'Replace saved itinerary' }, { timeout: 10000 });

  const saved = M.getSavedTrips();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].destination.name, clickedName);
  assert.equal(saved[0].destination.id, 'bravo');
  assert.ok(!saved[0].isMultiStop, 'the saved snapshot must not be a multi-stop trip');
  assert.equal(saved[0].legs, undefined, 'the saved snapshot must carry no legs');
  assert.equal(saved[0].fingerprint, M.tripFingerprint(PREFS, 'bravo'));
});

// W-3 and the §9 question-5 guard: the fix must not destroy multi-stop trips.
// Door B's own order is setMultiStopLegs(...) then setSelectedDestinationId(null)
// (DoorB.jsx:242-243). Driven here as that real setter sequence followed by the
// real trip page, rather than through Door B's multi-step wizard -- §4.3 allows
// the setter sequence in addition to the main DOM flow above, and this adds the
// page render on top of it.
test('§4.3 (Door B): real setMultiStopLegs then setSelectedDestinationId(null) keeps the legs, and the real multi-stop trip page still builds and opens', async () => {
  const { render, screen, cleanup } = await testingLibrary();
  cleanup();
  resetLocation('/trip');
  clearStorage();
  harness.destinations = CATALOGUE;
  M.setPrefs(PREFS);

  M.setMultiStopLegs([{ destinationId: 'alpha', days: 5 }, { destinationId: 'charlie', days: 4 }]);
  M.setSelectedDestinationId(null);

  assert.deepEqual(M.getMultiStopLegs(), [
    { destinationId: 'alpha', days: 5 },
    { destinationId: 'charlie', days: 4 },
  ], 'a null selection must never cancel the plan Door B just built');
  assert.equal(M.getSelectedDestinationId(), null);

  render(renderApp(M.React.createElement, '/trip'));
  await screen.findByRole('button', { name: 'Save itinerary' }, { timeout: 10000 });

  const shown = document.body.textContent;
  assert.equal(shown.includes('QUESTIONNAIRE-FALLBACK'), false, 'the trip page must not bounce away');
  assert.ok(shown.includes('Alphaville'), 'the first leg must be on the page');
  assert.ok(shown.includes('Charlieburg'), 'the second leg must be on the page');
  assert.ok(shown.includes('→'), 'the multi-stop strip must render');
});

// ---- §6: S2-1, the build-level auth check ----
//
// Seam verified at src/lib/AuthContext.jsx:92-115 (checkUserAuth consumes
// base44.auth.me(); a rejection carrying status 401 sets an auth-required
// error and finishes loading) and App.jsx:49-56 (that state invokes the login
// redirect). NOTE: the brief names this file as src/contexts/AuthContext.jsx;
// that directory does not exist in this repo. The line range and the behaviour
// are exactly as described -- only the path differs. Reported as a divergence.
//
// SCOPE, stated plainly: this exercises THE APP'S CONSUMER of a rejected
// auth.me(), not the real Base44 SDK's token-cleanup implementation. Proving
// SDK token handling would mean stubbing the transport under the real SDK and
// asserting its observable token behaviour -- a separate test with its own
// brief, not a widening of this one.
test('S2-1: a 401-shaped auth.me() rejection reaches a completed auth-required outcome, with no loop and no unhandled rejection', async () => {
  const { render, screen, cleanup } = await testingLibrary();
  cleanup();
  resetLocation('/results');
  clearStorage();

  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    harness.me = () => Promise.reject(Object.assign(new Error('unauthorized'), { status: 401 }));
    harness.calls.me = 0;
    harness.calls.redirectToLogin = [];

    const states = [];
    const el = M.React.createElement;
    // The real consumer branch, as App.jsx:40-56 writes it.
    function AuthenticatedApp() {
      const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, authChecked, navigateToLogin } = M.useAuth();
      states.push({ isLoadingAuth, isLoadingPublicSettings, isAuthenticated, authChecked, authError: authError && authError.type });
      if (isLoadingPublicSettings || isLoadingAuth) return el('div', null, 'LOADING');
      if (authError && authError.type === 'auth_required') {
        navigateToLogin();
        return el('div', null, 'AUTH-REQUIRED');
      }
      return el('div', null, 'SIGNED-IN-APP');
    }

    render(el(M.AuthProvider, null, el(AuthenticatedApp)));

    // The REACHED outcome, not "at most one redirect" -- which zero redirects,
    // and a component that never recovers at all, would both satisfy.
    await screen.findByText('AUTH-REQUIRED', {}, { timeout: 10000 });
    const settled = states[states.length - 1];
    assert.equal(settled.authError, 'auth_required', 'the auth-required state must be reached');
    assert.equal(settled.isLoadingAuth, false, 'loading must finish, not hang');
    assert.equal(settled.isLoadingPublicSettings, false);
    assert.equal(settled.isAuthenticated, false, 'the outcome is a completed signed-out state');
    assert.equal(settled.authChecked, true, 'the check must be recorded as done');
    assert.equal(harness.calls.redirectToLogin.length, 1, 'the login redirect must actually be invoked');

    // No loop: let every queued effect and microtask drain, then confirm the
    // outcome is stationary rather than re-driving itself.
    const rendersAtSettle = states.length;
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(harness.calls.me, 1, 'auth.me() must not be retried in a loop');
    assert.equal(harness.calls.redirectToLogin.length, 1, 'the redirect must not fire repeatedly');
    assert.equal(states.length, rendersAtSettle, 'the consumer must stop re-rendering once settled');
    assert.equal(states[states.length - 1].authError, 'auth_required', 'the outcome must still hold');

    // The failure is handled at the boundary, not thrown past it.
    assert.deepEqual(unhandled, [], 'a rejected auth.me() must not surface as an unhandled rejection');
  } finally {
    process.off('unhandledRejection', onUnhandled);
    harness.me = () => Promise.reject(Object.assign(new Error('no session'), { status: 500 }));
  }
});
