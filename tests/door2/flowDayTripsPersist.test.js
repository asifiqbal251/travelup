// E3c C2 (DOM part) and C3 on the real page. C6 is flowDayTripCopyGuard.test.js.
//
// C2: no day-trip refusal is reachable through the live Japan data at any offered
// length (5-12 days, with or without the Kyoto spur, one or two day trips; 13+ days
// on the Tokyo-only route the preview throws instead of refusing, an E3a engine
// defect). So the DOM half of C2 drives that throw and checks the traveller gets the
// place-specific fallback, a console.error, and an unchanged trip. The refusal copy
// for every classified case is covered in dayTripCopy.test.js on constructed refusals.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDoor2PlanModule, mountAndBuildViaIntake, teardown } from './helpers/domHarness.js';
import {
  addDayTrip,
  exBlockIds,
  glanceDayTripRow,
  menuRow,
  savedTrip,
} from './helpers/dayTrips.js';

const M = await loadDoor2PlanModule();
after(teardown);
const { screen, within } = await import('@testing-library/react');

const ENGINE_VOCABULARY = /ROUTE_NOT_SUPPORTED|excursion|stopKey|change_not_feasible|not_in_menu|stale_preview|variant|package/i;
// No word boundaries: textContent runs adjacent elements together ("now.tokyo_baseKeep").
const SNAKE_CASE_ID = /[a-z]+_[a-z0-9_]*[a-z0-9]/;

function assertNoEngineVocabulary(state) {
  const text = document.body.textContent;
  const hit = text.match(ENGINE_VOCABULARY) ?? text.match(SNAKE_CASE_ID);
  assert.equal(hit, null, `${state}: engine vocabulary on screen: "${hit?.[0]}"`);
}

const itineraryText = () => [...document.querySelectorAll('h3')].map((h) => h.parentElement.textContent).join('|');

test('C2 (DOM): at 13 days the preview throws; the traveller sees the place-specific fallback, the throw is logged, the trip is unchanged', async () => {
  const { user } = await mountAndBuildViaIntake(M, { destination: 'Japan', totalDays: 13 });
  const t0 = await savedTrip(M, user);

  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  try {
    await user.click(menuRow('Tokyo', 'Nikko'));
  } finally {
    console.error = original;
  }
  assert.ok(await screen.findByText("Nikko doesn't fit this trip right now."), 'fallback copy names the place');
  assert.equal(errors.length, 1, 'the caught throw is logged once, not swallowed');
  assert.match(String(errors[0][1]?.message ?? errors[0][1]), /nights 11 outside 3–10/, 'the engine error is what was logged');
  assert.equal(screen.queryByText(/We can't build a route|still working on a route/), null, 'not the generic route copy');
  assert.equal(screen.queryByRole('button', { name: 'Use this plan' }), null, 'nothing to apply');
  assertNoEngineVocabulary('refusal (fallback)');

  await user.click(screen.getByRole('button', { name: 'Keep my trip' }));
  assert.equal(screen.queryByText("Nikko doesn't fit this trip right now."), null, 'card closed');
  const t1 = await savedTrip(M, user);
  assert.equal(M.tripFingerprint(t1), M.tripFingerprint(t0), 'trip unchanged after the refusal');
});

test('C3: a day trip survives Save → Start a new trip → Continue, identical; deleting the draft removes it', async () => {
  const { user } = await mountAndBuildViaIntake(M, { destination: 'Japan', totalDays: 10 });
  await addDayTrip(user, 'Tokyo', 'Nikko');
  const itineraryBefore = itineraryText();
  const chipBefore = glanceDayTripRow('Nikko').textContent;

  await user.click(screen.getByRole('button', { name: 'Save' }));
  const [draft] = M.listDraftTrips();
  assert.ok(draft, 'saved');
  const stored = M.loadDraftTrip(draft.id).trip;
  assert.deepEqual(stored.routePlan.stops.find((s) => s.key === 'tokyo_base').selectedExcursionIds, ['nikko'], 'the selection is in the saved plan');
  assert.ok(exBlockIds(stored).length > 0, 'the saved days carry the day trip');

  await user.click(screen.getByRole('button', { name: 'Start a new trip' }));
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
  await screen.findByText('Your trip at a glance');

  assert.equal(glanceDayTripRow('Nikko').textContent, chipBefore, 'glance chip identical');
  assert.equal(itineraryText(), itineraryBefore, 'itinerary text identical');
  const reloaded = await savedTrip(M, user);
  assert.equal(M.tripFingerprint(reloaded), M.tripFingerprint(stored), 'fingerprint matches');

  await user.click(screen.getByRole('button', { name: 'Start a new trip' }));
  await screen.findByText('My saved trips');
  for (const button of screen.getAllByRole('button', { name: 'Delete' })) await user.click(button);
  assert.deepEqual(M.listDraftTrips(), [], 'draft gone from storage');
  assert.equal(screen.queryByText('My saved trips'), null, 'draft gone from the list');
});
