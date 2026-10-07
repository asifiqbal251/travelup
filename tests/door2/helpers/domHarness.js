// Shared jsdom + esbuild harness for Door2 flow tests (tests/door2/flow*.test.js).
//
// Order matters: the jsdom window and its globals must be installed on
// globalThis *before* react-dom / @testing-library/react are imported,
// because those packages branch on `typeof window` at import time.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/plan?key=door2',
  pretendToBeVisual: true,
});

const { window } = dom;

const copyProps = (src, target) => {
  Object.getOwnPropertyNames(src)
    .filter((prop) => !(prop in target))
    .forEach((prop) => {
      try {
        Object.defineProperty(target, prop, {
          get: () => src[prop],
          configurable: true,
        });
      } catch {
        // Some globals (e.g. non-configurable Node built-ins) can't be shadowed; skip them.
      }
    });
};

const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });

define('window', window);
define('document', window.document);
define('navigator', window.navigator);
define('HTMLElement', window.HTMLElement);
define('Element', window.Element);
define('Node', window.Node);
define('Event', window.Event);
define('MouseEvent', window.MouseEvent);
define('KeyboardEvent', window.KeyboardEvent);
define('customElements', window.customElements);
define('getComputedStyle', window.getComputedStyle);
define('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 0));
define('cancelAnimationFrame', (id) => clearTimeout(id));
define('localStorage', window.localStorage);
define('sessionStorage', window.sessionStorage);
copyProps(window, globalThis);

const { build } = await import('esbuild');
const { fileURLToPath } = await import('node:url');
const { rmSync, readFileSync } = await import('node:fs');

const root = fileURLToPath(new URL('../../../', import.meta.url));

let cachedModule = null;

/** Bundle the real Door2Plan page (and a few lib exports flow tests need for
 * setup/assertions) with esbuild, exactly as tests/door2/moveUi.test.js does,
 * so flow tests exercise the shipped component, not a reimplementation. */
export async function loadDoor2PlanModule({ f6Control } = {}) {
  if (cachedModule) return cachedModule;
  const outfile = fileURLToPath(new URL(`./.flow.bundle.${process.pid}.mjs`, import.meta.url));
  if (f6Control) globalThis.__f6Harness = f6Control;
  await build({
    plugins: f6Control ? [{ name: 'f6-controlled-inputs', setup(build) {
      build.onLoad({ filter: /connectionBuild\.js$/ }, args => ({ contents: readFileSync(args.path, 'utf8').replace('const c = options.connectionContext;', `const c = globalThis.__f6Harness.context ? { ...options.connectionContext, ...globalThis.__f6Harness.context } : options.connectionContext;
        if (globalThis.__f6Harness.data) data = globalThis.__f6Harness.data;
        if (globalThis.__f6Harness.content) options = { ...options, content: globalThis.__f6Harness.content };
        globalThis.__f6Harness.calls.push(JSON.parse(JSON.stringify({ spec, context: c })));`).replace('const sequence = tripSequenceFromTrip', 'globalThis.__f6Harness.lastTrip = trip; const sequence = tripSequenceFromTrip'), loader: 'js' }));
    } }] : [],
    stdin: {
      contents: `
        export { default as Door2Plan } from './src/pages/Door2Plan.jsx';
        export { buildF6Trip, preflightConnectionContext } from './src/lib/door2/connectionBuild.js';
        export { decorateConnections, inspectEvidence, connectionDisplay } from './src/lib/door2/connectionEvidence.js';
        export { estimateConnection } from './src/lib/door2/connectionEstimator.js';
        export { PILOT_CONTENT } from './src/lib/door2/pilotContent.js';
        export { PILOT_DATA, buildFilledTrip } from './src/lib/door2/planner.js';
        export { PILOT_PLACES, PILOT_ROUTE_FAMILIES, PILOT_ROUTE_PACKAGES } from './src/lib/door2/pilotData.js';
        export { listDraftTrips, loadDraftTrip, saveDraftTrip, deleteDraftTrip } from './src/lib/door2/draftStorage.js';
        export { previewAddOptional, previewRemoveOptional, previewMoveOptional, previewAdjustNights, previewChangeLength, listMoveOptions, applyProposal, reconcile } from './src/lib/door2/restructure.js';
        export { pinActivity, unpinActivity, swapActivity } from './src/lib/door2/edit.js';
        export { compileFamilies } from './src/lib/door2/families.js';
        export { buildTripFromRoutePlan } from './src/lib/door2/planner.js';
        export { tripFingerprint } from './src/lib/door2/fingerprint.js';
        export { default as React } from 'react';
        export * as ReactDOMClient from 'react-dom/client';
        export { MemoryRouter } from 'react-router-dom';`,
      resolveDir: root,
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    alias: {
      '@/lib/PageNotFound': fileURLToPath(new URL('./stubPageNotFound.js', import.meta.url)),
      '@': root + 'src',
    },
    loader: { '.jsx': 'jsx', '.js': 'jsx' },
    jsx: 'automatic',
    define: { 'import.meta.env': '{}' },
    packages: 'external',
    logLevel: 'silent',
  });
  cachedModule = await import(outfile);
  rmSync(outfile);
  return cachedModule;
}

export function resetLocation(path = '/plan?key=door2') {
  window.history.replaceState({}, '', path);
}

export function clearStorage() {
  window.localStorage.clear();
}

export { window };

/** Register with node:test's `after` in every flow*.test.js file: unmounts
 * whatever's rendered and closes the jsdom window so nothing (a lingering
 * timer, an open MessageChannel port, jsdom's own internal handles) keeps
 * the event loop alive past the last test. Without this, `node --test`
 * hangs for ~50s after the test body finishes and is then SIGKILLed. */
export async function teardown() {
  const { cleanup } = await import('@testing-library/react');
  cleanup();
  window.close();
}

/** The traveller's own confirmation on the Basics step: the real "Yes, from
 * Vancouver" answer to the departure question (direction B, Stage 1). The page
 * makes no planner call without it. */
export async function confirmDeparture(user) {
  const { screen } = await import('@testing-library/react');
  await user.click(screen.getByRole('button', { name: 'Yes, from Vancouver' }));
}

/** The same confirmation for a reopened saved trip, which never carries one over.
 * A structural control asks the question; this taps the first stop's nights chip,
 * answers "Yes, from Vancouver", and closes the nights sheet that then opens, so
 * the trip itself is left exactly as loaded. */
export async function confirmDepartureOnReopenedTrip(user) {
  const { screen, within } = await import('@testing-library/react');
  await user.click(screen.getAllByRole('button', { name: /^\d+ nights?$/ })[0]);
  const prompt = await screen.findByRole('dialog', { name: 'Are you departing from Vancouver?' });
  await user.click(within(prompt).getByRole('button', { name: 'Yes, from Vancouver' }));
  await user.click(screen.getByRole('button', { name: '×' }));
}

/** Mount the real page and drive the actual intake wizard (destination ->
 * basics -> confirm the departure -> Build my trip). Unlike mountWithBuiltTrip (which loads a saved
 * draft and therefore has no currentSpec/routeAlternatives, per
 * handleLoadDraft), this path is required for any flow that needs route
 * alternatives or handleChangeRoute (B7, B8), since those only exist when
 * the trip was built through runBuildFromSpec. */
export async function mountAndBuildPeruViaIntake(M, { totalDays = 10 } = {}) {
  return mountAndBuildViaIntake(M, { destination: 'Peru', totalDays });
}

/** mountAndBuildPeruViaIntake for any quick-pick destination ('Peru', 'Canada', ...). */
export async function mountAndBuildViaIntake(M, { destination, totalDays = 10 }) {
  const { render, screen, cleanup } = await import('@testing-library/react');
  const userEvent = (await import('@testing-library/user-event')).default;
  cleanup();
  resetLocation('/plan?key=door2');
  clearStorage();
  render(M.React.createElement(M.MemoryRouter, { initialEntries: ['/plan?key=door2'] }, M.React.createElement(M.Door2Plan)));
  const user = userEvent.setup();

  await user.click(await screen.findByText(destination));
  let current = Number(screen.getByText(/\d+ days/).textContent.match(/\d+/)[0]);
  let guard = 0;
  while (current < totalDays) {
    if (++guard > 200) throw new Error(`mountAndBuildViaIntake: stuck incrementing days (current=${current}, target=${totalDays})`);
    await user.click(screen.getByRole('button', { name: '+' }));
    current += 1;
  }
  guard = 0;
  while (current > totalDays) {
    if (++guard > 200) throw new Error(`mountAndBuildViaIntake: stuck decrementing days (current=${current}, target=${totalDays})`);
    await user.click(screen.getByRole('button', { name: '−' }));
    current -= 1;
  }
  await confirmDeparture(user);
  await user.click(screen.getByRole('button', { name: 'Build my trip' }));
  await screen.findByText('Your trip at a glance');
  return { user };
}

export function peruSpec(overrides = {}) {
  return {
    originPlaceId: 'vancouver',
    destination: { kind: 'country', id: 'PE' },
    travelMonth: 10,
    totalDays: 10,
    travellerType: 'couple',
    interests: [],
    pace: 'balanced',
    budget: 'mid',
    routeTemplateId: null,
    stops: [],
    requiredPlaceIds: [],
    choices: { pinned: [], rejected: [], placed: [] },
    ...overrides,
  };
}

/** Mount the real Door2Plan page under a MemoryRouter at /plan?key=door2,
 * resetting location and localStorage first so tests don't leak into each other. */
export async function mountDoor2Plan(M) {
  const { render, cleanup } = await import('@testing-library/react');
  cleanup(); // node:test has no automatic per-test cleanup hook; do it ourselves.
  resetLocation('/plan?key=door2');
  clearStorage();
  return render(M.React.createElement(M.MemoryRouter, { initialEntries: ['/plan?key=door2'] }, M.React.createElement(M.Door2Plan)));
}

/** Build a trip with the engine, save it as a draft, mount the page, and load
 * it via the real "My saved trips -> Continue" UI. Used by flows B4-B13 so
 * every test doesn't have to re-drive the multi-step intake wizard, while
 * still entering "results" state through a real user action on the page.
 * These flows go on to change the trip's structure, so the helper also gives
 * the departure confirmation a reopened trip needs first; pass
 * `confirmDeparture: false` to stop at the trip exactly as reopened. */
export async function mountWithBuiltTrip(M, spec, { confirmDeparture: confirm = true } = {}) {
  const { render, screen, cleanup } = await import('@testing-library/react');
  const userEvent = (await import('@testing-library/user-event')).default;
  cleanup();
  const trip = M.buildFilledTrip(spec, M.PILOT_DATA, { reviewPolicy: 'allow_drafts' });
  resetLocation('/plan?key=door2');
  clearStorage();
  M.saveDraftTrip(trip, 'Test trip');
  const view = render(M.React.createElement(M.MemoryRouter, { initialEntries: ['/plan?key=door2'] }, M.React.createElement(M.Door2Plan)));
  const user = userEvent.setup();
  await user.click(await screen.findByText('Continue'));
  if (confirm) await confirmDepartureOnReopenedTrip(user);
  return { ...view, user, trip };
}

