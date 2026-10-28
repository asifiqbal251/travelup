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

// One bundle per variant: the plain page, the F6-controlled page, and the
// handler-exposed page used by the packet 1a lock tests.
const cachedModules = new Map();

/** Bundle the real Door2Plan page (and a few lib exports flow tests need for
 * setup/assertions) with esbuild, exactly as tests/door2/moveUi.test.js does,
 * so flow tests exercise the shipped component, not a reimplementation. */
export async function loadDoor2PlanModule({ f6Control, exposeHandlers = false } = {}) {
  const variant = f6Control ? 'f6' : exposeHandlers ? 'expose' : 'plain';
  if (cachedModules.has(variant)) return cachedModules.get(variant);
  const outfile = fileURLToPath(new URL(`./.flow.bundle.${variant}.${process.pid}.mjs`, import.meta.url));
  if (f6Control) globalThis.__f6Harness = f6Control;
  // A test-only seam. It publishes the REAL rendered component's handlers and state on
  // globalThis so a test can call a command boundary that no UI route reaches — the
  // apply handler on a locked trip, which every preview entry is gated against. It adds
  // nothing to production: the transform is applied only by this harness, only when a
  // test asks for it, and it calls no handler itself.
  const exposePlugin = {
    name: 'door2-expose-handlers',
    setup(build) {
      build.onLoad({ filter: /pages\/Door2Plan\.jsx$/ }, (args) => {
        const src = readFileSync(args.path, 'utf8');
        const anchor = '  const evidenceStatus = activeTrip ? inspectEvidence(activeTrip) : { ok: true };';
        if (!src.includes(anchor)) throw new Error('domHarness: the handler-expose anchor is gone; fix the seam, do not skip it');
        return {
          contents: src.replace(
            anchor,
            `  globalThis.__door2 = { handleUseProposal, handleSwap, handleUndo, handleSaveDraft, handleOpenRefine, showRefine, activeTrip, tripLock, setDeparture, blockedCommand };\n${anchor}`
          ),
          loader: 'jsx'
        };
      });
    }
  };
  await build({
    plugins: exposeHandlers ? [exposePlugin] : f6Control ? [{ name: 'f6-controlled-inputs', setup(build) {
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
  const mod = await import(outfile);
  rmSync(outfile);
  cachedModules.set(variant, mod);
  return mod;
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

// ---- Classic-planner variant (additive; nothing above this line changes) ----
//
// loadDoor2PlanModule bundles a FIXED entry list that exports Door2Plan. The
// classic planner pages (/results, /trip) are not in it, and the stale-legs
// build brief
// (docs/briefs/q8-p2-getter/build-brief-stale-multistop-legs-override-2026-10-27-rev2.md
// §4.3) needs a real DOM user flow across both of them under standing rule 2.
// This is a SECOND variant -- its own cache key, its own stdin, its own
// plugin -- reusing the jsdom install, the `@` alias, the
// `.flow.bundle.*` cache-and-rmSync pattern and teardown() above. No existing
// export or variant is touched, and the pages are bundled exactly as shipped:
// no production file is modified to make this testable.
//
// Two seams are stubbed, both so the flow is deterministic rather than to
// change what is under test:
//
//   @/api/base44Client            -- the network. Every call delegates to
//                                    globalThis.__classicHarness at CALL time,
//                                    so a test sets its own responses.
//   @base44/sdk/.../axios-client  -- the app-public-settings GET that
//                                    AuthProvider issues on mount.
//
// `@/lib/AuthContext` is deliberately NOT stubbed. The real provider is what
// §6's S2-1 has to drive, and the real provider is also what gives the page
// flow its guest identity -- so both tests run the shipped auth consumer and
// differ only in what the stubbed `auth.me()` does.

/** Per-test control surface for the classic variant. Read at call time, so a
 * test can reassign any field between renders. */
export function classicHarness(overrides = {}) {
  const h = {
    // The /results list and the /trip fetch.
    destinations: [],
    getDestination: null,
    // AuthProvider's `base44.auth.me()`. Rejecting keeps the traveller a guest.
    me: () => Promise.reject(Object.assign(new Error('no session'), { status: 500 })),
    // The app-public-settings GET AuthProvider makes before it checks the user.
    publicSettings: () => Promise.resolve({ id: 'harness-app', public_settings: {} }),
    // Everything the stub records rather than performs.
    calls: { redirectToLogin: [], me: 0, logout: [] },
    savedTripRecords: [],
    ...overrides,
  };
  globalThis.__classicHarness = h;
  return h;
}

const BASE44_CLIENT_STUB = `
const H = () => globalThis.__classicHarness;
export const base44 = {
  entities: {
    Destination: {
      list: async () => H().destinations,
      get: async (id) => (H().getDestination
        ? H().getDestination(id)
        : (H().destinations.find((d) => d.id === id)
            || Promise.reject(new Error('harness: no destination ' + id)))),
    },
    DestinationRequest: { create: async (r) => r },
    SavedTrip: {
      filter: async () => H().savedTripRecords,
      create: async (r) => { H().savedTripRecords.push(r); return r; },
      update: async (id, r) => r,
      delete: async () => ({}),
    },
  },
  auth: {
    me: () => { H().calls.me += 1; return H().me(); },
    isAuthenticated: () => false,
    logout: (to) => { H().calls.logout.push(to); },
    redirectToLogin: (from) => { H().calls.redirectToLogin.push(from); },
    loginWithProvider: () => {},
    loginViaEmailPassword: async () => ({}),
    register: async () => ({}),
    verifyOtp: async () => ({}),
    resendOtp: async () => ({}),
    resetPassword: async () => ({}),
    resetPasswordRequest: async () => ({}),
    setToken: () => {},
  },
};
`;

const AXIOS_CLIENT_STUB = `
export const createAxiosClient = () => ({
  get: async () => globalThis.__classicHarness.publicSettings(),
  post: async () => ({}),
  put: async () => ({}),
  delete: async () => ({}),
});
export default createAxiosClient;
`;

/** Browser APIs jsdom does not implement that the classic pages touch on mount
 * (use-mobile's media query, TripView's scrollIntoView). Installed from inside
 * loadClassicPlannerModule only, so the jsdom environment the existing Door2
 * flow tests see is bit-for-bit what it was. */
function installClassicDomExtras() {
  if (typeof window.matchMedia !== 'function') {
    const matchMedia = (query) => ({
      matches: false,
      media: String(query),
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    });
    window.matchMedia = matchMedia;
    define('matchMedia', matchMedia);
  }
  if (typeof window.Element.prototype.scrollIntoView !== 'function') {
    window.Element.prototype.scrollIntoView = function scrollIntoView() {};
  }
}

/** Bundle the real Results and TripDetail pages, the real AuthContext and the
 * real storage module, with only the two seams above replaced. Cached under
 * its own key so it can never collide with the Door2Plan variants. */
export async function loadClassicPlannerModule() {
  const variant = 'classic';
  installClassicDomExtras();
  if (cachedModules.has(variant)) return cachedModules.get(variant);
  const outfile = fileURLToPath(new URL(`./.flow.bundle.${variant}.${process.pid}.mjs`, import.meta.url));
  // appParams reads this once, at bundle-import time, and AuthProvider only
  // reaches auth.me() when a token is present.
  window.localStorage.setItem('base44_access_token', 'harness-token');
  const stubPlugin = {
    name: 'classic-planner-stubs',
    setup(build) {
      // The SDK's axios client is an external package, so it is intercepted at
      // resolve time into its own namespace rather than on load.
      build.onResolve({ filter: /^@base44\/sdk\/dist\/utils\/axios-client$/ }, () => ({
        path: 'classic-axios-client',
        namespace: 'classic-stub',
      }));
      build.onLoad({ filter: /.*/, namespace: 'classic-stub' }, () => ({ contents: AXIOS_CLIENT_STUB, loader: 'js' }));
      // The app's own client resolves to a real file, so it is replaced on load
      // -- the same mechanism the Door2Plan expose seam above uses.
      build.onLoad({ filter: /src[/\\]api[/\\]base44Client\.js$/ }, () => ({ contents: BASE44_CLIENT_STUB, loader: 'js' }));
    },
  };
  await build({
    plugins: [stubPlugin],
    stdin: {
      contents: `
        export { default as Results } from './src/pages/Results.jsx';
        export { default as TripDetail } from './src/pages/TripDetail.jsx';
        export { AuthProvider, useAuth } from './src/lib/AuthContext.jsx';
        export { clearMultiStopLegs, getMultiStopLegs, getSelectedDestinationId, getSavedTrips, loadState, setMultiStopLegs, setPrefs, setSelectedDestinationId, tripFingerprint } from './src/lib/storage.js';
        export { default as React } from 'react';
        export * as ReactDOMClient from 'react-dom/client';
        export { MemoryRouter, Route, Routes } from 'react-router-dom';`,
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
  const mod = await import(outfile);
  rmSync(outfile);
  cachedModules.set(variant, mod);
  return mod;
}
