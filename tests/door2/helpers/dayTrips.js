// Shared steps for the E3c day-trip flow tests (flowDayTrips*, flowDiscardConfirm).
// Everything here drives the real page through visible text and real clicks; the
// trip state is read back the way a traveller would keep it, by pressing Save and
// reading the saved draft (history is stripped on save, and the fingerprint
// ignores history anyway).
import assert from 'node:assert/strict';
import { clearStorage, resetLocation } from './domHarness.js';

const { screen, within, render, cleanup } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;

export const DAY_TRIP_HEADING = /^\+ Add a day trip from /;

export function japanSpec(totalDays, extra = {}) {
  return {
    originPlaceId: 'vancouver',
    destination: { kind: 'country', id: 'JP' },
    travelMonth: 10,
    totalDays,
    travellerType: 'couple',
    interests: [],
    pace: 'balanced',
    budget: 'mid',
    routeTemplateId: null,
    stops: [],
    requiredPlaceIds: [],
    choices: { pinned: [], rejected: [], placed: [] },
    ...extra,
  };
}

/** Headings of every day-trip section on the page, in order. */
export function dayTripHeadings() {
  return screen.queryAllByText(DAY_TRIP_HEADING).map((h) => h.textContent);
}

/** The day-trip section whose heading names `base`. */
export function dayTripSection(base) {
  const heading = screen.getByText(`+ Add a day trip from ${base}`);
  return heading.parentElement;
}

/** The row button for `place` inside a day-trip section. */
export function menuRow(base, place) {
  return within(dayTripSection(base))
    .getAllByRole('button')
    .find((b) => b.textContent.startsWith(place));
}

/** Tap a menu row and confirm the preview with "Use this plan". */
export async function addDayTrip(user, base, place) {
  const row = menuRow(base, place);
  assert.ok(row, `menu row for ${place} under ${base}`);
  await user.click(row);
  await screen.findByText(`Add a day trip to ${place}`);
  await user.click(screen.getByRole('button', { name: 'Use this plan' }));
  assert.ok(screen.getByText(`Day trip: ${place}`), `glance shows the day trip to ${place}`);
}

/** The glance row for a selected day trip (the "Day trip: X" line plus its Remove). */
export function glanceDayTripRow(place) {
  return screen.getByText(`Day trip: ${place}`).parentElement;
}

/** Press Save and return the trip that was stored. */
export async function savedTrip(M, user) {
  const before = new Set(M.listDraftTrips().map((d) => d.id));
  await user.click(screen.getByRole('button', { name: 'Save' }));
  const added = M.listDraftTrips().filter((d) => !before.has(d.id));
  assert.equal(added.length, 1, 'Save stored exactly one draft');
  const loaded = M.loadDraftTrip(added[0].id);
  assert.ok(loaded.compatible, 'saved draft reloads');
  return loaded.trip;
}

export const exBlockIds = (trip) => trip.days.flatMap((d) => d.blocks.filter((b) => b.id.startsWith('ex:')).map((b) => b.id));
export const contentIds = (trip) =>
  new Set(trip.days.flatMap((d) => d.blocks.filter((b) => b.type === 'activity' && b.anchor?.contentId).map((b) => b.anchor.contentId)));

/** Save `trip` as a draft, mount the page and open it through "Continue" (history is empty, as after any reload). */
export async function mountWithSavedTrip(M, trip) {
  cleanup();
  resetLocation('/plan?key=door2');
  clearStorage();
  M.saveDraftTrip({ ...trip, history: [] }, 'Test trip');
  render(M.React.createElement(M.MemoryRouter, { initialEntries: ['/plan?key=door2'] }, M.React.createElement(M.Door2Plan)));
  const user = userEvent.setup();
  await user.click(await screen.findByText('Continue'));
  await screen.findByText('Your trip at a glance');
  return { user };
}

/** The route-alternative buttons in the glance ("<name> · N stops"). */
export function routeAlternativeButtons() {
  return screen.getAllByRole('button').filter((b) => /· \d+ stops/.test(b.textContent));
}
