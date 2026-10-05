// E3c C2 (DOM part) and C3 on the real page. C6 is flowDayTripCopyGuard.test.js.
//
// C2: no day-trip refusal is reachable through the live Japan data at any offered
// length (5-12 days, with or without the Kyoto spur, one or two day trips). At 13+
// days on the Tokyo-only route the preview used to throw (Tokyo stretched past its
// maximum) and the traveller saw a false refusal; EF1 fixed that, so the DOM half of
// C2 now checks the day trip previews, adds and saves there. The refusal copy for
// every classified case is covered in dayTripCopy.test.js on constructed refusals.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDoor2PlanModule, mountAndBuildViaIntake, mountWithBuiltTrip, teardown } from './helpers/domHarness.js';
import {
  japanSpec,
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

test('C2 (DOM): at 13 days (Tokyo stretched past its maximum) Nikko previews, adds and saves; nothing is logged', async () => {
  const { user } = await mountWithBuiltTrip(M, japanSpec(13));
  const t0 = await savedTrip(M, user);
  assert.equal(t0.routePlan.stops.find((s) => s.key === 'tokyo_base').nights, 11, 'Tokyo is stretched to 11 nights (max 10)');

  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  try {
    await user.click(menuRow('Tokyo', 'Nikko'));
    await screen.findByText('Add a day trip to Nikko');
  } finally {
    console.error = original;
  }
  assert.deepEqual(errors, [], 'no engine throw was caught and logged');
  assert.equal(screen.queryByText("Nikko doesn't fit this trip right now."), null, 'no false refusal');
  assertNoEngineVocabulary('add preview (13 days)');

  await user.click(screen.getByRole('button', { name: 'Keep my trip' }));
  const t1 = await savedTrip(M, user);
  assert.equal(M.tripFingerprint(t1), M.tripFingerprint(t0), 'trip unchanged after keeping it');

  await addDayTrip(user, 'Tokyo', 'Nikko');
  const t2 = await savedTrip(M, user);
  const tokyo = t2.routePlan.stops.find((s) => s.key === 'tokyo_base');
  assert.deepEqual(tokyo.selectedExcursionIds, ['nikko'], 'the selection is saved');
  assert.equal(tokyo.nights, 11, 'nights unchanged');
  assert.equal(t2.spec.totalDays, 13, 'length unchanged');
  assert.ok(exBlockIds(t2).length > 0, 'the saved days carry the day trip');
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
