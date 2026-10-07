// Direction B, Stage 2 — the receiving side: what the classic planner (/find, DoorB) does
// with the handoff parameters (build brief B Stage 2, revision 3, sections 7 to 10).
//
// The real DoorB page is bundled with esbuild. Only the hosted catalogue call is replaced
// (a stub of `@/api/base44Client` whose list() the test controls), because the real one
// needs the network. No production file or fixture is touched.
//
// Owner-approved wording is written out here on purpose, not imported from the page.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import { build } from 'esbuild';
import { clearStorage, resetLocation, teardown, window } from './helpers/domHarness.js';

after(teardown);
const { render, screen, cleanup, waitFor, act, fireEvent } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;
const React = (await import('react')).default;
const { MemoryRouter, Routes, Route } = await import('react-router-dom');

// jsdom has no element.scrollTo; the length scroller only uses it to centre a number.
window.HTMLElement.prototype.scrollTo = function scrollTo() {};

const catalogue = { list: null };
globalThis.__doorBCatalogue = catalogue;

const root = fileURLToPath(new URL('../../', import.meta.url));
const outfile = fileURLToPath(new URL(`./.flowBStage2Arrival.bundle.${process.pid}.mjs`, import.meta.url));
await build({
  plugins: [{
    name: 'door-b-catalogue-stub',
    setup(b) {
      b.onResolve({ filter: /^@\/api\/base44Client$/ }, () => ({ path: 'stub-base44', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        loader: 'js',
        contents: 'export const base44 = { entities: { Destination: { list: () => globalThis.__doorBCatalogue.list() } } };',
      }));
    },
  }],
  stdin: { contents: "export { default as DoorB } from './src/pages/DoorB.jsx';", resolveDir: root },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  alias: { '@': root + 'src' },
  loader: { '.jsx': 'jsx', '.js': 'jsx', '.png': 'dataurl' },
  jsx: 'automatic',
  define: { 'import.meta.env': '{}' },
  packages: 'external',
  logLevel: 'silent',
});
const P = await import(outfile);
rmSync(outfile);

// ── Owner-approved wording (revision 3, section 9) ───────────────────────────
const SEARCH_NOTICE = "We've brought your destination search. Choose a destination below.";
const lengthNotice = (n) => `You asked for ${n} days. The classic planner supports 3–14 days. Choose a length to continue.`;
const ROUTE_NOTICE = "Your full route hasn't been transferred. Choose from the destinations available below.";
const RESET = 'Clear carried details'; // implementation wording, not in the approved §9 table

const DESTS = [
  { id: 'tokyo', name: 'Tokyo', country: 'Japan', min_days: 3 },
  { id: 'kyoto', name: 'Kyoto', country: 'Japan', min_days: 2 },
  { id: 'cusco', name: 'Cusco', country: 'Peru', min_days: 3 },
  { id: 'lima', name: 'Lima', country: 'Peru', min_days: 2 },
];

function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** A page load of /find with `search`. `list` is what the catalogue returns (or a deferred). */
function open(search = '', list = DESTS) {
  cleanup();
  resetLocation('/find');
  clearStorage();
  catalogue.list = typeof list === 'function' ? list : () => Promise.resolve(list);
  render(React.createElement(
    MemoryRouter,
    { initialEntries: [`/find${search}`] },
    React.createElement(Routes, null,
      React.createElement(Route, { path: '/find', element: React.createElement(P.DoorB) }),
      React.createElement(Route, { path: '/trip', element: React.createElement('div', null, 'TRIP PAGE') }),
    ),
  ));
  return userEvent.setup();
}

const input = () => screen.getByPlaceholderText(/Type a destination|Loading/);
const radio = (name) => screen.getByRole('radio', { name });
const checked = (name) => radio(name).getAttribute('aria-checked') === 'true';
const buildButton = () => screen.getByRole('button', { name: /Build my trip/ });
const readout = () => document.body.textContent.match(/(\d+) days( — suggested)?/g);
const noticeText = () => [...document.querySelectorAll('[role=status]')].map((n) => n.textContent);

async function pickFromDropdown(user, name) {
  await user.click(await screen.findByRole('button', { name: new RegExp(`^${name}`) }));
}

test('direct /find with no parameters is exactly as before', async () => {
  open('');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  assert.equal(input().value, '');
  assert.equal(screen.queryAllByText(SEARCH_NOTICE).length, 0);
  assert.equal(screen.queryAllByText(RESET).length, 0);
});

test('a full handoff seeds the search text and, after choosing, month, exact length and party', async () => {
  const user = open('?dest_q=Tokyo&month=10&days=10&party=two');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  assert.equal(input().value, 'Tokyo');
  assert.ok(screen.getByText(SEARCH_NOTICE));
  assert.ok(screen.getByText(RESET));
  // Nothing is chosen for the traveller.
  assert.equal(screen.queryAllByText('TRIP PAGE').length, 0);
  await pickFromDropdown(user, 'Tokyo');
  assert.equal(screen.queryAllByText(SEARCH_NOTICE).length, 0);
  assert.ok(checked('October'));
  assert.ok(checked('10 days'));
  assert.ok(checked('Two of us') || screen.getByRole('radio', { name: /Two of us/ }).getAttribute('aria-checked') === 'true');
  assert.ok(!document.body.textContent.includes('suggested'), 'a carried length is never labelled suggested');
  assert.equal(buildButton().disabled, false);
  await user.click(buildButton());
  assert.ok(await screen.findByText('TRIP PAGE'));
});

test('lengths 3, 7 and 14 are carried exactly', async () => {
  for (const n of [3, 7, 14]) {
    const user = open(`?dest_q=Tokyo&month=4&days=${n}&party=family`);
    await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
    await pickFromDropdown(user, 'Tokyo');
    assert.ok(checked(`${n} days`), `${n} days selected`);
    assert.ok(!document.body.textContent.includes('suggested'));
  }
});

test('out-of-range lengths are explained and must be chosen: 1, 2, 15 and 60', async () => {
  for (const n of [1, 2, 15, 60]) {
    const user = open(`?dest_q=Tokyo&month=10&days_req=${n}&party=two`);
    await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
    await pickFromDropdown(user, 'Tokyo');
    assert.ok(noticeText().includes(lengthNotice(n)), `notice for ${n}`);
    assert.equal(buildButton().disabled, true, `Build blocked for ${n}`);
    await user.click(buildButton());
    assert.equal(screen.queryAllByText('TRIP PAGE').length, 0, `no build for ${n}`);
    // The traveller chooses a supported length; choosing the highlighted 7 counts.
    await user.click(radio('7 days'));
    assert.equal(buildButton().disabled, false);
    assert.equal(noticeText().includes(lengthNotice(n)), false, 'notice leaves once answered');
  }
});

test('the Enter key on the highlighted length counts as choosing it', async () => {
  const user = open('?dest_q=Tokyo&month=10&days_req=20&party=two');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await pickFromDropdown(user, 'Tokyo');
  assert.equal(buildButton().disabled, true);
  const group = screen.getByRole('radiogroup', { name: 'Trip length in days' });
  group.focus();
  await user.keyboard('{Enter}');
  assert.equal(buildButton().disabled, false);
  assert.ok(checked('7 days'));
});

test('a Combine trip carries 10 days; an out-of-range request is gated on the combine screen too', async () => {
  const user = open('?dest_q=Peru&month=3&days=10&party=family');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await user.click(await screen.findByRole('button', { name: /Combine 2 of these/ }));
  assert.ok(checked('10 days'));
  assert.equal(screen.getByRole('button', { name: /Continue/ }).disabled, false);

  const user2 = open('?dest_q=Peru&month=3&days_req=20&party=family');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await user2.click(await screen.findByRole('button', { name: /Combine 2 of these/ }));
  assert.ok(noticeText().includes(lengthNotice(20)));
  assert.equal(screen.getByRole('button', { name: /Continue/ }).disabled, true);
  await user2.click(radio('9 days'));
  assert.equal(screen.getByRole('button', { name: /Continue/ }).disabled, false);
});

test('answering the length on the combine path does not open the single-destination gate', async () => {
  const user = open('?dest_q=Peru&month=3&days_req=20&party=family');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await user.click(await screen.findByRole('button', { name: /Combine 2 of these/ }));
  await user.click(radio('9 days'));
  await user.click(screen.getByRole('button', { name: /Continue/ }));
  // Back to the proposal, then the day step, then search; pick one destination instead.
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await user.click(screen.getByRole('button', { name: 'Back' }));
  input();
  await user.type(input(), 'x');
  await user.clear(input());
  await user.type(input(), 'Cusco');
  await pickFromDropdown(user, 'Cusco');
  assert.equal(buildButton().disabled, true, 'single-destination length still has to be chosen');
  assert.ok(noticeText().includes(lengthNotice(20)));
});

test('a carried destination id opens the essentials once, and never builds', async () => {
  open('?dest_id=cusco&month=3&days=5&party=family');
  assert.ok(await screen.findByText('Cusco'));
  assert.ok(checked('March'));
  assert.ok(checked('5 days'));
  assert.equal(screen.queryAllByText('TRIP PAGE').length, 0);
});

test('an id that matches nothing, or more than one record, selects nothing', async () => {
  open('?dest_id=nope&dest_q=Tokyo');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  assert.equal(screen.queryAllByText('Plan the essentials', { selector: 'span' }).length, 0);
  assert.ok(screen.getByText(SEARCH_NOTICE));

  const dup = [...DESTS, { id: 'tokyo', name: 'Tokyo again', country: 'Japan' }];
  open('?dest_id=tokyo&dest_q=Tokyo', dup);
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  assert.ok(screen.getByText(SEARCH_NOTICE));
});

test('a catalogue response that arrives after the traveller edited the search never overwrites it', async () => {
  const d = deferred();
  const user = open('?dest_id=cusco&dest_q=Peru', () => d.promise);
  // The carried text is editable while the catalogue loads.
  const field = input();
  assert.equal(field.value, 'Peru');
  await user.type(field, 'vian');
  assert.equal(input().value, 'Peruvian');
  await act(async () => { d.resolve(DESTS); await d.promise; });
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  assert.equal(input().value, 'Peruvian');
  assert.equal(screen.queryAllByText('Cusco').length, 0, 'no destination was chosen for the traveller');
});

test('clearing the carried search before the catalogue arrives also prevents resolution', async () => {
  const d = deferred();
  const user = open('?dest_id=cusco&dest_q=Peru', () => d.promise);
  await user.clear(input());
  await act(async () => { d.resolve(DESTS); await d.promise; });
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  assert.equal(input().value, '');
  assert.equal(screen.queryAllByRole('radiogroup', { name: 'Travel month' }).length, 0);
});

test('malformed parameters fall back field by field', async () => {
  const user = open('?dest_q=Tokyo&month=010&days=7.5&party=bogus');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  assert.equal(input().value, 'Tokyo');
  await pickFromDropdown(user, 'Tokyo');
  for (const m of ['January', 'October']) assert.equal(checked(m), false);
  assert.ok(checked('7 days'));
  assert.ok(document.body.textContent.includes('suggested'), 'an uncarried length keeps the old suggestion');
  assert.equal(buildButton().disabled, true, 'month and party still need answering');
});

test('the first occurrence of a repeated key wins, even if invalid', async () => {
  const user = open('?dest_q=Tokyo&month=13&month=4&days=4&days=9');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await pickFromDropdown(user, 'Tokyo');
  assert.equal(checked('April'), false);
  assert.ok(checked('4 days'));
});

test('"Clear carried details" returns the page to a plain /find', async () => {
  const user = open('?dest_q=Tokyo&month=10&days=10&party=two');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await user.click(screen.getByText(RESET));
  assert.equal(input().value, '');
  assert.equal(screen.queryAllByText(SEARCH_NOTICE).length, 0);
  assert.equal(screen.queryAllByText(RESET).length, 0);
  await user.type(input(), 'Tokyo');
  await pickFromDropdown(user, 'Tokyo');
  assert.equal(checked('October'), false);
  assert.ok(checked('7 days'));
  assert.ok(document.body.textContent.includes('suggested'));
});

test('Back to the search step never re-applies carried text', async () => {
  const user = open('?dest_q=Tokyo&month=10&days=10&party=two');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await pickFromDropdown(user, 'Tokyo');
  await user.click(screen.getByRole('button', { name: 'Back' }));
  assert.equal(input().value, '');
  assert.equal(screen.queryAllByText(SEARCH_NOTICE).length, 0);
});

test('the handoff is never persisted or written to the address', async () => {
  const user = open('?dest_q=Tokyo&month=10&days=10&party=two');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await pickFromDropdown(user, 'Tokyo');
  assert.equal(window.localStorage.length, 0);
  assert.equal(window.sessionStorage.length, 0);
  assert.equal(window.location.search, '');
});

// ── route: the explanation-only parameter (owner amendment, 7 Oct 2026) ──────

test('a Peru or Eastern Canada route is explained as a route, not as a search', async () => {
  for (const [value, text] of [['peru', 'Peru'], ['eastern-canada', 'Canada']]) {
    open(`?dest_q=${text}&route=${value}&month=10&days=10&party=two`);
    await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
    assert.ok(screen.getByText(ROUTE_NOTICE), value);
    assert.equal(screen.queryAllByText(SEARCH_NOTICE).length, 0, 'the two notices never both appear');
    assert.equal(input().value, text, 'the search text is still carried and still editable');
  }
});

test('an unrecognised route is ignored and the ordinary search notice is shown', async () => {
  for (const bad of ['japan', 'PERU', 'country:PE', '1']) {
    open(`?dest_q=Peru&route=${encodeURIComponent(bad)}&month=10&days=10&party=two`);
    await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
    assert.ok(screen.getByText(SEARCH_NOTICE), bad);
    assert.equal(screen.queryAllByText(ROUTE_NOTICE).length, 0, bad);
  }
});

test('route only explains: it selects nothing, builds nothing and changes no answer', async () => {
  const user = open('?dest_q=Peru&route=peru&month=10&days=10&party=two');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  // The choices are offered; nothing has been chosen for the traveller, and
  // nothing has been built.
  assert.ok(screen.getAllByRole('button', { name: /^Cusco/ }).length >= 1, 'the Peru choices are offered');
  assert.equal(screen.queryAllByRole('radiogroup', { name: 'Travel month' }).length, 0, 'still on the search step');
  assert.equal(screen.queryAllByText('TRIP PAGE').length, 0);
  assert.equal(window.localStorage.length, 0);
  // The basics still arrive exactly as they would without the parameter.
  await pickFromDropdown(user, 'Cusco');
  assert.ok(checked('October'));
  assert.ok(checked('10 days'));
  assert.ok(radio('Two of us').getAttribute('aria-checked') === 'true');
  assert.equal(buildButton().disabled, false);
});

test('a route handoff still offers the choices, including Combine', async () => {
  const user = open('?dest_q=Peru&route=peru&month=10&days=10&party=two');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  assert.ok(await screen.findByRole('button', { name: /Combine 2 of these/ }));
  await user.click(screen.getByRole('button', { name: /Combine 2 of these/ }));
  assert.ok(checked('10 days'), 'the carried length survives the combine path');
});

test('the route explanation leaves as soon as the traveller types or chooses', async () => {
  const user = open('?dest_q=Peru&route=peru&month=10&days=10&party=two');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await user.type(input(), 'x');
  assert.equal(screen.queryAllByText(ROUTE_NOTICE).length, 0);

  const user2 = open('?dest_q=Peru&route=peru&month=10&days=10&party=two');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await pickFromDropdown(user2, 'Cusco');
  await user2.click(screen.getByRole('button', { name: 'Back' }));
  assert.equal(screen.queryAllByText(ROUTE_NOTICE).length, 0, 'Back never re-explains a route');
});

test('"Clear carried details" also clears the route explanation', async () => {
  const user = open('?dest_q=Peru&route=peru&month=10&days=10&party=two');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await user.click(screen.getByText(RESET));
  assert.equal(screen.queryAllByText(ROUTE_NOTICE).length, 0);
  assert.equal(input().value, '');
  assert.equal(screen.queryAllByText(RESET).length, 0);
});

test('a reload re-reads the address, so clearing is not remembered across it', async () => {
  const search = '?dest_q=Peru&route=peru&month=10&days=10&party=two';
  const user = open(search);
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await user.click(screen.getByText(RESET));
  assert.equal(input().value, '');
  assert.equal(window.localStorage.length, 0, 'the clear is not written anywhere');
  // A reload is a fresh page instance at the same address.
  const user2 = open(search);
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  assert.equal(input().value, 'Peru', 'the incoming values come back');
  assert.ok(screen.getByText(ROUTE_NOTICE));
  await pickFromDropdown(user2, 'Cusco');
  assert.ok(checked('10 days'));
});

test('clearing does not touch saved trips or other stored data', async () => {
  const user = open('?dest_q=Peru&route=peru&month=10&days=10&party=two');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  window.localStorage.setItem('door2_drafts_v1', '[{"keep":true}]');
  window.localStorage.setItem('unrelated_key', 'kept');
  await user.click(screen.getByText(RESET));
  assert.equal(window.localStorage.getItem('door2_drafts_v1'), '[{"keep":true}]');
  assert.equal(window.localStorage.getItem('unrelated_key'), 'kept');
});

// ── R1 and R2: the chosen Combine duration is retained and reaches the build ──
// Codex review of 198766e. R1: the page's Back button must return to the
// traveller's edit, not replay the incoming value. R2: the chosen length must
// reach prefs.travelDays, not just the route fitting.

const state = () => JSON.parse(window.localStorage.getItem('travelup_state_v1') || '{}');
const legTotal = () => (state().multiStopLegs || []).reduce((n, l) => n + l.days, 0);
const prefDays = () => state().prefs?.travelDays;

async function combineFrom(search) {
  const user = open(search);
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await user.click(await screen.findByRole('button', { name: /Combine 2 of these/ }));
  return user;
}

test('R1: the page Back button keeps the length the traveller chose on Combine', async () => {
  const user = await combineFrom('?dest_q=Peru&month=3&days=10&party=family');
  assert.ok(checked('10 days'), 'arrives with the carried 10');
  await user.click(radio('12 days'));
  await user.click(screen.getByRole('button', { name: /Continue/ }));
  assert.ok(screen.getByText(/Your Peru trip|Your route/));
  await user.click(screen.getByRole('button', { name: 'Back' }));
  assert.ok(checked('12 days'), 'Back returns to the edit, not the incoming value');
  assert.equal(radio('10 days').getAttribute('aria-checked'), 'false');
});

test('R1: Back does not reopen a duration gate the traveller already answered', async () => {
  const user = await combineFrom('?dest_q=Peru&month=3&days_req=20&party=family');
  assert.ok(noticeText().includes(lengthNotice(20)));
  await user.click(radio('9 days'));
  await user.click(screen.getByRole('button', { name: /Continue/ }));
  await user.click(screen.getByRole('button', { name: 'Back' }));
  assert.ok(checked('9 days'));
  assert.equal(noticeText().includes(lengthNotice(20)), false, 'the requirement stays answered');
  assert.equal(screen.getByRole('button', { name: /Continue/ }).disabled, false);
});

test('R2: a changed Combine length reaches the stored preferences, not just the route', async () => {
  const user = await combineFrom('?dest_q=Peru&month=3&days=10&party=family');
  await user.click(radio('12 days'));
  await user.click(screen.getByRole('button', { name: /Continue/ }));
  await user.click(screen.getByRole('button', { name: /Build full itinerary/ }));
  await user.click(screen.getByRole('button', { name: /Build my trip/ }));
  assert.ok(await screen.findByText('TRIP PAGE'));
  assert.equal(legTotal(), 12, 'the route is fitted to 12');
  assert.equal(prefDays(), 12, 'and the preferences say 12');
});

test('R2: an out-of-range request answered on Combine reaches the stored preferences', async () => {
  const user = await combineFrom('?dest_q=Peru&month=3&days_req=20&party=family');
  await user.click(radio('9 days'));
  await user.click(screen.getByRole('button', { name: /Continue/ }));
  await user.click(screen.getByRole('button', { name: /Build full itinerary/ }));
  await user.click(screen.getByRole('button', { name: /Build my trip/ }));
  assert.ok(await screen.findByText('TRIP PAGE'));
  assert.equal(legTotal(), 9);
  assert.equal(prefDays(), 9, 'never the untouched default of 7');
});

test('R2: an unchanged carried length reaches the stored preferences too', async () => {
  const user = await combineFrom('?dest_q=Peru&month=3&days=10&party=family');
  await user.click(screen.getByRole('button', { name: /Continue/ }));
  await user.click(screen.getByRole('button', { name: /Build full itinerary/ }));
  await user.click(screen.getByRole('button', { name: /Build my trip/ }));
  assert.ok(await screen.findByText('TRIP PAGE'));
  assert.equal(legTotal(), 10);
  assert.equal(prefDays(), 10);
});

test('R2: a single-destination length reaches the stored preferences', async () => {
  const user = open('?dest_q=Tokyo&month=10&days_req=20&party=two');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await pickFromDropdown(user, 'Tokyo');
  await user.click(radio('11 days'));
  await user.click(buildButton());
  assert.ok(await screen.findByText('TRIP PAGE'));
  assert.equal(prefDays(), 11);
});

test('switching paths in both directions never authorises an unanswered length', async () => {
  // Combine first, then single destination: the Essentials gate is still closed.
  const user = await combineFrom('?dest_q=Peru&month=3&days_req=20&party=family');
  await user.click(radio('9 days'));
  await user.click(screen.getByRole('button', { name: /Continue/ }));
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await user.type(input(), 'Cusco');
  await pickFromDropdown(user, 'Cusco');
  assert.equal(buildButton().disabled, true, 'Essentials still needs its own choice');
  assert.ok(noticeText().includes(lengthNotice(20)));

  // Single destination first, then Combine: the Combine gate is still closed.
  const user2 = open('?dest_q=Peru&month=3&days_req=20&party=family');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await pickFromDropdown(user2, 'Cusco');
  await user2.click(radio('8 days'));
  assert.equal(buildButton().disabled, false);
  await user2.click(screen.getByRole('button', { name: 'Back' }));
  await user2.type(input(), 'Peru');
  await user2.click(await screen.findByRole('button', { name: /Combine 2 of these/ }));
  assert.ok(noticeText().includes(lengthNotice(20)), 'Combine still needs its own choice');
  assert.equal(screen.getByRole('button', { name: /Continue/ }).disabled, true);
});

test('a carried or chosen length is never labelled "suggested"', async () => {
  const user = await combineFrom('?dest_q=Peru&month=3&days_req=20&party=family');
  assert.ok(document.body.textContent.includes('suggested'), 'an unanswered default still is');
  await user.click(radio('9 days'));
  assert.ok(!document.body.textContent.includes('suggested'), 'the answer is not');
});

// ── Codex re-review of 107d68e: the active path's duration is authoritative ──
// Finding 1: the two paths hold their own current lengths, so the build must read
// the path it is building — a click-time write to the shared answer is not enough,
// because returning to the other path and pressing Continue taps nothing.
// Finding 2: the "suggested" label must describe the control it is on.

async function buildCombine(user) {
  await user.click(screen.getByRole('button', { name: /Continue/ }));
  await user.click(screen.getByRole('button', { name: /Build full itinerary/ }));
  await user.click(screen.getByRole('button', { name: /Build my trip/ }));
  assert.ok(await screen.findByText('TRIP PAGE'));
}

test('finding 1A: single destination 12, then Combine at its own 10 — the route and the preferences both say 10', async () => {
  const user = open('?dest_q=Peru&month=3&days=10&party=family');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await pickFromDropdown(user, 'Cusco');
  await user.click(radio('12 days'));
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await user.type(input(), 'Peru');
  await user.click(await screen.findByRole('button', { name: /Combine 2 of these/ }));
  assert.ok(checked('10 days'), "Combine keeps its own value, not the other path's 12");
  await buildCombine(user);
  assert.equal(legTotal(), 10);
  assert.equal(prefDays(), 10, 'the preferences follow the route, not the other control');
});

test('finding 1B: both gates answered, then Combine again without tapping — the route and the preferences both say 9', async () => {
  const user = open('?dest_q=Peru&month=3&days_req=20&party=family');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await user.click(await screen.findByRole('button', { name: /Combine 2 of these/ }));
  await user.click(radio('9 days'));
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await user.type(input(), 'Cusco');
  await pickFromDropdown(user, 'Cusco');
  await user.click(radio('11 days'));
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await user.type(input(), 'Peru');
  await user.click(await screen.findByRole('button', { name: /Combine 2 of these/ }));
  assert.ok(checked('9 days'), 'the retained Combine answer');
  assert.equal(screen.getByRole('button', { name: /Continue/ }).disabled, false, 'already answered');
  // No further tap: the build must still be consistent.
  await buildCombine(user);
  assert.equal(legTotal(), 9);
  assert.equal(prefDays(), 9, 'never the single-destination control\'s 11');
});

test('finding 1C: returning again to the single destination path builds that path\'s own length', async () => {
  const user = open('?dest_q=Peru&month=3&days_req=20&party=family');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await user.click(await screen.findByRole('button', { name: /Combine 2 of these/ }));
  await user.click(radio('9 days'));
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await user.type(input(), 'Cusco');
  await pickFromDropdown(user, 'Cusco');
  await user.click(radio('11 days'));
  await user.click(buildButton());
  assert.ok(await screen.findByText('TRIP PAGE'));
  assert.equal(prefDays(), 11, "the single destination path's own answer");
  assert.equal(state().multiStopLegs ?? null, null, 'and no multi-stop legs are left behind');
});

test('finding 2: choosing a length on one path never makes the other path\'s default look confirmed', async () => {
  const user = open('?dest_q=Peru&month=3&days_req=20&party=family');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await pickFromDropdown(user, 'Cusco');
  await user.click(radio('8 days'));
  assert.ok(!document.body.textContent.includes('suggested'), 'the chosen 8 is not a suggestion');
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await user.type(input(), 'Peru');
  await user.click(await screen.findByRole('button', { name: /Combine 2 of these/ }));
  assert.ok(checked('7 days'), "Combine's own untouched default");
  assert.ok(document.body.textContent.includes('suggested'), 'and it is still labelled a suggestion');
  assert.equal(screen.getByRole('button', { name: /Continue/ }).disabled, true, 'its gate is still closed');
});

test('finding 2, the other direction: a Combine choice does not confirm the essentials default', async () => {
  const user = open('?dest_q=Peru&month=3&days_req=20&party=family');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await user.click(await screen.findByRole('button', { name: /Combine 2 of these/ }));
  await user.click(radio('9 days'));
  assert.ok(!document.body.textContent.includes('suggested'));
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await user.type(input(), 'Cusco');
  await pickFromDropdown(user, 'Cusco');
  assert.ok(checked('7 days'));
  assert.ok(document.body.textContent.includes('suggested'), "the essentials default is still a suggestion");
  assert.equal(buildButton().disabled, true);
});

test('a carried length is explicit on both paths at once', async () => {
  const user = open('?dest_q=Peru&month=3&days=10&party=family');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await pickFromDropdown(user, 'Cusco');
  assert.ok(!document.body.textContent.includes('suggested'), 'essentials: carried, not suggested');
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await user.type(input(), 'Peru');
  await user.click(await screen.findByRole('button', { name: /Combine 2 of these/ }));
  assert.ok(checked('10 days'));
  assert.ok(!document.body.textContent.includes('suggested'), 'combine: carried, not suggested');
});

test('"Clear carried details" returns both paths to an unconfirmed default', async () => {
  const user = open('?dest_q=Peru&month=3&days=10&party=family');
  await waitFor(() => assert.ok(screen.getByPlaceholderText('Type a destination or country')));
  await user.click(screen.getByText(RESET));
  await user.type(input(), 'Peru');
  await user.click(await screen.findByRole('button', { name: /Combine 2 of these/ }));
  assert.ok(checked('7 days'));
  assert.ok(document.body.textContent.includes('suggested'));
});
