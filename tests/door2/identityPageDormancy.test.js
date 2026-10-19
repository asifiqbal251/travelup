// Q8 packet 1b — T-D2: the production-root audit, and the real page.
//
// TWO CLAIMS, both executable.
//
//   THE AUDIT. An exhaustive scan over `src/pages/**` showing that no production root
//   passes the opt-in. Production roots are every call from `src/pages/**`, which is
//   `Door2Plan.jsx` AND `Door2Dev.jsx` — the unlisted developer harness at
//   `/dev/door2?key=door2` is query-key gated and not access-protected, so it counts as
//   production. Internal forwarding inside `restructure.js` is required, is conditional on
//   the public caller's own opt-in, and is distinguished from a root rather than banned.
//
//   THE REAL PAGE. An identity-bearing door2-v7 record, loaded through the real reader by
//   the real page, driven through a structural preview, a bounded edit and `handleUndo`,
//   with the resulting trip asserted against an identity-free control of THE SAME RECORD.
//   The absolute bc58722 engine literals for this record's operations are pinned by the
//   landed P1-D oracle; what this file adds is the page route.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  loadDoor2PlanModule,
  peruSpec,
  resetLocation,
  clearStorage,
  teardown,
  window
} from './helpers/domHarness.js';

const M = await loadDoor2PlanModule({ exposeHandlers: true });
after(async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
  await teardown();
});
const { render, screen, cleanup, within, act } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;

const KEY = 'door2_drafts_v1';
const clone = (value) => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------------------
// The audit.

function filesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else if (/\.(jsx?|tsx?)$/.test(entry)) out.push(path);
  }
  return out;
}

/** Argument count of a call, counted with balanced delimiters so nested calls are safe. */
function callArities(source, name) {
  const arities = [];
  const pattern = new RegExp(`(?<![.\\w$])${name}\\s*\\(`, 'g');
  let match;
  while ((match = pattern.exec(source)) !== null) {
    let depth = 1;
    let args = 0;
    let seenSomething = false;
    for (let i = match.index + match[0].length; i < source.length && depth > 0; i += 1) {
      const ch = source[i];
      if ('([{'.includes(ch)) depth += 1;
      else if (')]}'.includes(ch)) { depth -= 1; if (depth === 0) break; }
      else if (ch === ',' && depth === 1) args += 1;
      if (depth >= 1 && !' \t\n\r'.includes(ch)) seenSomething = true;
    }
    arities.push(seenSomething ? args + 1 : 0);
  }
  return arities;
}

/**
 * The pre-packet arity of each touched export, with the Door 2 module it comes from. One
 * argument more than this is an opt-in.
 *
 * The module matters: `src/lib/storage.js` exports an UNRELATED Door 1
 * `tripFingerprint(prefs, destinationId)`, which `Profile.jsx` and `TripDetail.jsx` call
 * with two arguments and which packet 1b does not touch. Scoping each check to the files
 * that actually import the Door 2 module is what makes this audit precise rather than
 * merely noisy — and the scan surfaced that collision itself.
 */
const BASE_ARITY = {
  swapActivity: { arity: 4, module: 'door2/edit' },
  rejectActivity: { arity: 3, module: 'door2/edit' },
  pinActivity: { arity: 2, module: 'door2/edit' },
  unpinActivity: { arity: 2, module: 'door2/edit' },
  makeDayLighter: { arity: 3, module: 'door2/edit' },
  swapDays: { arity: 4, module: 'door2/edit' },
  undo: { arity: 1, module: 'door2/edit' },
  tripFingerprint: { arity: 1, module: 'door2/fingerprint' },
  reconcile: { arity: 3, module: 'door2/restructure' }
};

/** Does this file import the named Door 2 module at all? */
function imports(source, module) {
  return new RegExp(`from\\s+["'][^"']*${module.replace('/', '\\/')}`).test(source);
}

test('T-D2 (audit): no production root under src/pages/** passes the identity opt-in', () => {
  const pages = filesUnder('src/pages');
  assert.ok(pages.length >= 10, `the scan must really cover the pages: found ${pages.length}`);
  // The two Door 2 roots really are in scope, and really are the only pages that reach the
  // touched modules — so this audit is not vacuous.
  const door2Roots = pages.filter((p) => /lib\/door2\/(edit|restructure|fingerprint)/.test(readFileSync(p, 'utf8')));
  assert.deepStrictEqual(
    door2Roots.map((p) => p.replace(/\\/g, '/')).sort(),
    ['src/pages/Door2Dev.jsx', 'src/pages/Door2Plan.jsx'],
    'the set of Door 2 production roots changed'
  );

  const violations = [];
  for (const path of pages) {
    const source = readFileSync(path, 'utf8');
    // 1. No mode or envelope key is ever constructed by a page.
    for (const key of ['identityMode', 'identityData', 'identityTokens', 'identityAllocation']) {
      if (source.includes(key)) violations.push(`${path}: constructs ${key}`);
    }
    // 2. No `identity:` options key. (Other pages use an unrelated ACCOUNT identity object
    //    via useAccountIdentity; that is a Door 1 concept and is never an options key.)
    if (/\bidentity\s*:/.test(source)) violations.push(`${path}: passes an identity: option`);
    // 3. No call to a touched Door 2 export exceeds its pre-packet arity, checked only in
    //    the files that import the module it belongs to.
    for (const [name, { arity, module }] of Object.entries(BASE_ARITY)) {
      if (!imports(source, module)) continue;
      for (const observed of callArities(source, name)) {
        if (observed > arity) violations.push(`${path}: ${name} called with ${observed} arguments (pre-packet arity ${arity})`);
      }
    }
  }
  assert.deepStrictEqual(violations, [], `production roots must pass no opt-in:\n${violations.join('\n')}`);

  // The arity check really ran against the two Door 2 roots, rather than skipping them.
  const checked = door2Roots.filter((p) => {
    const source = readFileSync(p, 'utf8');
    return Object.values(BASE_ARITY).some(({ module }) => imports(source, module));
  });
  assert.deepStrictEqual(checked.map((p) => p.replace(/\\/g, '/')).sort(), ['src/pages/Door2Dev.jsx', 'src/pages/Door2Plan.jsx']);
  // And at least one touched export really is called from each of them.
  for (const path of door2Roots) {
    const source = readFileSync(path, 'utf8');
    const calls = Object.keys(BASE_ARITY).flatMap((name) => callArities(source, name));
    assert.ok(calls.length > 0, `${path}: the audit found no touched call to check`);
  }
});

test('T-D2 (audit): the arity counter really detects an opt-in, and internal restructure.js forwarding is present and conditional', () => {
  // The counter is proved against a planted violation, so a green audit means something.
  assert.deepStrictEqual(callArities('swapActivity(t, b, null, content, true)', 'swapActivity'), [5]);
  assert.deepStrictEqual(callArities('swapActivity(t, b)', 'swapActivity'), [2]);
  assert.deepStrictEqual(callArities('undo(t, { data })', 'undo'), [2]);
  assert.deepStrictEqual(callArities('undo(t)', 'undo'), [1]);
  assert.deepStrictEqual(callArities('edit.undo(t, x)', 'undo'), [], 'a member call is not a bare call');
  assert.deepStrictEqual(callArities('makeDayLighter(trip, day(x, y), content)', 'makeDayLighter'), [3], 'nested calls do not inflate the count');

  // The internal forwarding exists — four sites, as the brief names — and every one is
  // conditional on the public caller's own opt-in rather than unconditional.
  const restructure = readFileSync('src/lib/door2/restructure.js', 'utf8');
  const forwards = restructure.split('reconcile(trip, skeleton, ctx.content, identityForward(ctx))').length - 1;
  assert.equal(forwards, 4, 'all four internal reconcile call sites forward the mode');
  assert.match(restructure, /function identityForward\(ctx\) \{\s*return ctx\.identity \? \{ data: ctx\.data \} : null;/, 'forwarding is conditional, not unconditional');
  assert.match(restructure, /const identity = options\.identity === true;/, 'the opt-in is read strictly');
});

// ---------------------------------------------------------------------------
// The real page.

const PERU = M.buildFilledTrip(peruSpec({ totalDays: 10 }), M.PILOT_DATA, { reviewPolicy: 'allow_drafts' });
assert.notEqual(PERU.ok, false, 'the control trip must build');

/** The map seeded into the stored record. Addresses are real for this build. */
function seedMap(trip) {
  const stopKey = trip.routePlan.stops[0].key;
  return {
    version: 1,
    used: ['luid-old', 'luid-later'],
    blocks: {
      'luid-old': { stopKey, kind: 'open', address: { dayOffset: 0, ordinal: 1, slot: 'full' }, state: 'live' },
      'luid-later': { stopKey, kind: 'open', address: { dayOffset: 1, ordinal: 1, slot: 'full' }, state: 'displaced' }
    },
    edits: { 'luid-old': { intent: 'pin', contentId: null, locked: true, userEdited: true, provenance: 'seed' } }
  };
}

function envelope(trip, { id = 'd_bearing', label = 'Peru bearing' } = {}) {
  return {
    envelopeVersion: 2,
    id,
    label,
    destinationLabel: 'Peru',
    savedAt: '2026-10-14T10:00:00.000Z',
    trip
  };
}

const stamped = (extra = {}) => ({
  ...clone(PERU),
  history: [],
  ...extra,
  versions: { ...PERU.versions, schema: 'door2-v7' }
});

function mountOver(entries) {
  cleanup();
  resetLocation('/plan?key=door2');
  clearStorage();
  window.localStorage.setItem(KEY, JSON.stringify(entries));
  render(M.React.createElement(M.MemoryRouter, { initialEntries: ['/plan?key=door2'] }, M.React.createElement(M.Door2Plan)));
  return userEvent.setup();
}

const rowOf = (label) => screen.getByText(label).closest('li');
const activeSnapshot = () => clone(globalThis.__door2.activeTrip);

async function openRecord(trip, label) {
  const user = mountOver([envelope(trip, { label })]);
  await user.click(within(rowOf(label)).getByRole('button', { name: 'Continue' }));
  await screen.findByText('Your trip at a glance');
  return user;
}

/**
 * The three operations the brief names, driven through the REAL page: a structural
 * preview, a bounded edit, and handleUndo. Returns what the page ended up holding.
 */
async function driveRealPage(trip, label) {
  const user = await openRecord(trip, label);
  const opened = activeSnapshot();

  // A structural preview, reached the way the traveller reaches it.
  await act(async () => { globalThis.__door2.setDeparture('confirmed'); });
  const chips = screen.queryAllByRole('button', { name: /^\d+ nights?$/ });
  assert.ok(chips.length > 0, `${label}: the nights control must be reachable`);
  await user.click(chips[0]);
  const sheetOpened = screen.queryAllByRole('button', { name: '×' }).length > 0;
  const afterPreview = activeSnapshot();

  // Close the sheet so the bounded edit is not shadowed by it.
  if (sheetOpened) await user.click(screen.queryAllByRole('button', { name: '×' })[0]);

  // A bounded edit FIRST, while the map is still present. This is the step that catches a
  // hook keyed on `trip.identity` presence rather than on an explicit caller opt-in: such
  // a hook would record intent into the map right here, on a production path.
  const earlySwap = screen.queryAllByRole('button', { name: 'Swap' });
  assert.ok(earlySwap.length > 0, `${label}: the record must offer Swap before the apply too`);
  await user.click(earlySwap[0]);
  const afterEarlySwap = activeSnapshot();

  // A structural APPLY, through the page's own commit handler. This step matters for
  // dormancy specifically: on the default path `applyProposal` returns a spread of
  // `proposal.trip`, which carries no map, so after it the active trip has no map while
  // its own history snapshot still does. That is precisely the mixed-history shape, and it
  // is reachable on a production path — which is why `undo`'s refusal must stay opt-in.
  const stopKey = afterEarlySwap.routePlan.stops[0].key;
  const preview = M.previewAdjustNights(afterEarlySwap, stopKey, 1, { generatedAt: '2026-10-18T12:00:00.000Z' });
  assert.equal(preview.ok, true, `${label}: the preview must offer a proposal: ${preview.why ?? ''}`);
  await act(async () => { globalThis.__door2.handleUseProposal(preview.proposals[0]); });
  const afterApply = activeSnapshot();
  assert.ok(afterApply.history.length > 0, `${label}: the apply really pushed a history snapshot`);

  // A bounded edit: Swap, which is the control whose removal once left a whole test file green.
  const swap = screen.queryAllByRole('button', { name: 'Swap' });
  assert.ok(swap.length > 0, `${label}: the record must offer Swap`);
  await user.click(swap[0]);
  const afterSwap = activeSnapshot();

  // And handleUndo — the real traveller path, and the sharpest check in this packet.
  await act(async () => { globalThis.__door2.handleUndo(); });
  const afterUndo = activeSnapshot();
  // Twice, so the second pop lands on the snapshot the APPLY pushed, which is the one
  // carrying a map while the trip above it does not.
  await act(async () => { globalThis.__door2.handleUndo(); });
  const afterSecondUndo = activeSnapshot();

  return { opened, sheetOpened, afterPreview, afterEarlySwap, afterApply, afterSwap, afterUndo, afterSecondUndo };
}

test('T-D2 (real page): an identity-bearing door2-v7 record drives a preview, a bounded edit and handleUndo exactly as the same record without a map, with its map untouched throughout', async () => {
  const identity = seedMap(PERU);

  // The identity-free control FIRST, so the comparison is like for like on the same build.
  const control = await driveRealPage(stamped(), 'Peru control');
  // And the identity-bearing record, admitted by the real reader.
  const bearing = await driveRealPage(stamped({ identity: clone(identity) }), 'Peru bearing');

  // The admission facts, through the real page: it opened, it is editable, it kept its map.
  assert.ok(bearing.opened, 'the bearing record opened');
  assert.deepStrictEqual(bearing.opened.identity, identity, 'the reader did not strip or alter the map');
  assert.equal(bearing.sheetOpened, control.sheetOpened, 'the structural sheet behaved identically');
  assert.equal(bearing.sheetOpened, true, 'and it really did open, so the check is not vacuous');

  // THE COMPLETE EFFECT, at each of the three stages: identical but for the map.
  const strip = (trip) => {
    const copy = clone(trip);
    delete copy.identity;
    if (Array.isArray(copy.history)) copy.history = copy.history.map((h) => { const e = clone(h); delete e.identity; return e; });
    return copy;
  };
  const STAGES = ['opened', 'afterPreview', 'afterEarlySwap', 'afterApply', 'afterSwap', 'afterUndo', 'afterSecondUndo'];
  for (const stage of STAGES) {
    assert.deepStrictEqual(strip(bearing[stage]), strip(control[stage]), `${stage}: the identity-bearing record diverged from the control`);
  }
  // The apply really did land, and really did drop the map on the default path — exactly as
  // at base. That is the mixed-history shape the second undo then pops through.
  assert.notDeepStrictEqual(strip(bearing.afterApply), strip(bearing.afterEarlySwap), 'the apply really changed the trip');
  assert.equal(bearing.afterApply.identity, undefined, 'the default apply carries no map through, as at base');
  assert.ok(bearing.afterApply.history.some((h) => h.identity !== undefined), 'and its history snapshot still holds one — mixed history, on a production path');

  // The bounded edit really changed the trip, so "identical" is not "nothing happened" —
  // and each undo really popped the step above it.
  assert.notDeepStrictEqual(strip(bearing.afterSwap), strip(bearing.afterApply), 'Swap really changed the trip');
  assert.deepStrictEqual(strip(bearing.afterUndo), strip(bearing.afterApply), 'the first undo popped the swap');
  assert.deepStrictEqual(strip(bearing.afterSecondUndo), strip(bearing.afterEarlySwap), 'the second undo popped the apply');

  // THE MAP IS NEVER MODIFIED ON A PRODUCTION PATH. No production root passes the opt-in,
  // so the union never runs, the mixed-history refusal never fires, and no intent is
  // recorded. Before the apply it is byte-identical to what was seeded; from the apply on
  // it is absent, which is what `bc58722` does with it and is not this packet's change.
  for (const stage of ['opened', 'afterPreview', 'afterEarlySwap']) {
    assert.deepStrictEqual(bearing[stage].identity, identity, `${stage}: the map was modified on a production path`);
  }
  // The pre-apply swap really did change the trip, so the stage above is not vacuous.
  assert.notDeepStrictEqual(strip(bearing.afterEarlySwap), strip(bearing.opened), 'the pre-apply Swap really changed the trip');
  for (const stage of ['afterApply', 'afterSwap']) {
    assert.equal(bearing[stage].identity, undefined, `${stage}: a map appeared where base has none`);
  }
  // And the two undos really did pop, through the mixed-history shape, without refusing.
  assert.ok(bearing.afterSecondUndo, 'the second undo returned a trip rather than refusing');
  // The control never acquired a map at any stage.
  for (const stage of STAGES) {
    assert.equal(control[stage].identity, undefined, `${stage}: the control acquired a map it never had`);
  }
});
