// E3c C2 (copy half): the day-trip refusal copy on constructed refusal objects.
// No refusal is reachable through the live Japan data (see flowDayTripsPersist.test.js),
// so every classified row of the brief's §5.4 table is exercised here against the
// shape previewAddExcursion returns, and the "add a night" row is clicked in the real
// StructureSheet. The page module is bundled the same way domHarness bundles it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import { teardown } from './helpers/domHarness.js';
import { buildSync } from 'esbuild';

after(teardown);

const root = fileURLToPath(new URL('../../', import.meta.url));
const outfile = fileURLToPath(new URL(`./.dayTripCopy.bundle.${process.pid}.mjs`, import.meta.url));
buildSync({
  stdin: {
    contents: `
      export { DAY_TRIP_COPY, dayTripRefusalView, StructureSheet } from './src/pages/Door2Plan.jsx';
      export { PILOT_DATA, buildFilledTrip } from './src/lib/door2/planner.js';
      export { previewAddExcursion } from './src/lib/door2/restructure.js';
      export { default as React } from 'react';`,
    resolveDir: root,
  },
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
const M = await import(outfile);
rmSync(outfile);
const { render, screen, cleanup } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;

const spec = (extra = {}) => ({
  originPlaceId: 'vancouver', destination: { kind: 'country', id: 'JP' }, travelMonth: 10, totalDays: 5,
  travellerType: 'couple', interests: [], pace: 'balanced', budget: 'mid', routeTemplateId: null, stops: [],
  requiredPlaceIds: [], choices: { pinned: [], rejected: [], placed: [] }, ...extra,
});
const trip = M.buildFilledTrip(spec(), M.PILOT_DATA, { reviewPolicy: 'allow_drafts' });
const stop = trip.routePlan.stops.find((s) => s.key === 'tokyo_base'); // 3 nights, 3-10
const ctx = { place: 'Kamakura', base: 'Tokyo', stop, spec: trip.spec };
// A real proposal to stand in for the engine's "extend" alternative.
const realProposal = M.previewAddExcursion(trip, 'tokyo_base', 'kamakura').proposals[0];

// The exact shape previewAddExcursion returns when the stop needs more nights (restructure.js A5 path).
const needsNights = (nightsNeeded, alternatives = [realProposal]) => ({
  ok: false,
  reason: 'change_not_feasible',
  why: 'excursion_does_not_fit',
  message: `There isn't a full day free at Tokyo for Kamakura. Add a night in Tokyo and include Kamakura →`,
  alternatives,
  detail: { stopKey: 'tokyo_base', excursionIds: ['kamakura'], nightsNeeded },
});

test('C2: one more night → human copy naming place and base, plus the "add a night" alternative', () => {
  const v = M.dayTripRefusalView(needsNights(4), ctx);
  assert.equal(v.message, 'Kamakura needs one more night in Tokyo to fit.');
  assert.equal(v.alternative.label, 'Add a night in Tokyo and include Kamakura');
  assert.equal(v.alternative.proposal, realProposal, 'the engine alternative is what the row opens');
});

test('C2: N more nights → plural copy and row', () => {
  const v = M.dayTripRefusalView(needsNights(5), ctx);
  assert.equal(v.message, 'Kamakura needs 2 more nights in Tokyo to fit.');
  assert.equal(v.alternative.label, 'Add 2 nights in Tokyo and include Kamakura');
});

test('C2: more nights than the stop allows → "needs a full day", no alternative', () => {
  assert.deepEqual(M.dayTripRefusalView(needsNights(11), ctx), {
    message: "Kamakura needs a full day, and this trip doesn't have one to give.",
    alternative: null,
  });
  const noNights = { ...needsNights(4, []), detail: { stopKey: 'tokyo_base', excursionIds: ['kamakura'] } };
  assert.equal(M.dayTripRefusalView(noNights, ctx).message, "Kamakura needs a full day, and this trip doesn't have one to give.");
});

test('C2: fixed dates → "your dates are fixed", no alternative', () => {
  const fixed = { ...ctx, spec: { ...trip.spec, startDate: '2026-10-01', endDate: '2026-10-05' } };
  assert.deepEqual(M.dayTripRefusalView(needsNights(4, []), fixed), {
    message: 'Kamakura needs more time in Tokyo, and your dates are fixed.',
    alternative: null,
  });
});

test('C2: not_available → "isn\'t available as a day trip yet", no alternative', () => {
  const r = { ok: false, reason: 'change_not_feasible', why: 'not_available', message: "Kamakura isn't available to add yet.", alternatives: [] };
  assert.deepEqual(M.dayTripRefusalView(r, ctx), { message: "Kamakura isn't available as a day trip yet.", alternative: null });
});

test('C2 (R4 guard): anything unclassified, including a real engine refusal and a throw, gets the place-specific fallback', () => {
  const fallback = { message: "Kamakura doesn't fit this trip right now.", alternative: null };
  const realNotInMenu = M.previewAddExcursion(trip, 'tokyo_base', 'no_such_day_trip');
  assert.equal(realNotInMenu.why, 'not_in_menu', 'a real engine refusal');
  assert.deepEqual(M.dayTripRefusalView(realNotInMenu, ctx), fallback);
  assert.deepEqual(M.dayTripRefusalView({ ok: false, why: 'something_new', message: 'ROUTE_NOT_SUPPORTED' }, ctx), fallback);
  assert.deepEqual(M.dayTripRefusalView(null, ctx), fallback, 'a preview that threw');
});

test('C2: every refusal message avoids engine vocabulary and never echoes the engine message', () => {
  const cases = [needsNights(4), needsNights(5), needsNights(11), { ok: false, why: 'not_available' }, null];
  for (const r of cases) {
    const { message, alternative } = M.dayTripRefusalView(r, ctx);
    assert.notEqual(message, r?.message);
    assert.doesNotMatch(`${message} ${alternative?.label ?? ''}`, /excursion|stopKey|change_not_feasible|not_in_menu|variant|package|_/i);
  }
});

test('C2: in the real sheet, the refusal shows the copy and "Keep my trip"; the "add a night" row opens its preview', async () => {
  cleanup();
  const opened = [];
  let closed = 0;
  const view = M.dayTripRefusalView(needsNights(4), ctx);
  render(
    M.React.createElement(M.StructureSheet, {
      sheet: { stage: 'day_trip_refusal', ...view },
      trip,
      onPreviewAlternative: (alt) => opened.push(alt),
      onClose: () => (closed += 1),
    })
  );
  const user = userEvent.setup();
  assert.ok(screen.getByText('Kamakura needs one more night in Tokyo to fit.'));
  await user.click(screen.getByRole('button', { name: /^Add a night in Tokyo and include Kamakura/ }));
  assert.equal(opened.length, 1);
  assert.equal(opened[0].proposal, realProposal, 'the row hands over the engine alternative for the normal preview card');
  await user.click(screen.getByRole('button', { name: 'Keep my trip' }));
  assert.equal(closed, 1);
});
