// E3c C6: across every day-trip state on the real page (menu, both previews, the
// refusal, after adding, both confirms, and another preview with a day trip selected)
// no engine vocabulary reaches the screen.
import { mountAndChooseCore } from './helpers/f5Flows.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDoor2PlanModule, mountWithBuiltTrip, teardown } from './helpers/domHarness.js';
import { japanSpec, glanceDayTripRow, menuRow, routeAlternativeButtons } from './helpers/dayTrips.js';

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

test('C6: at 13 days (Tokyo stretched past its maximum) the Nikko preview shows no engine vocabulary', async () => {
  const { user } = await mountWithBuiltTrip(M, japanSpec(13));
  assertNoEngineVocabulary('menu (13 days)');
  await user.click(menuRow('Tokyo', 'Nikko'));
  await screen.findByText('Add a day trip to Nikko');
  assert.equal(screen.queryByText("Nikko doesn't fit this trip right now."), null, 'no false refusal (EF1)');
  assertNoEngineVocabulary('add preview (13 days)');
});

test('C6: no engine vocabulary on screen in any day-trip state', async () => {
  const { user } = await mountAndChooseCore(M, { destination: 'Japan', totalDays: 10 });
  assertNoEngineVocabulary('menu');

  await user.click(menuRow('Tokyo', 'Nikko'));
  await screen.findByText('Add a day trip to Nikko');
  assertNoEngineVocabulary('add preview');
  await user.click(screen.getByRole('button', { name: 'Use this plan' }));
  assertNoEngineVocabulary('after adding');

  await user.click(within(glanceDayTripRow('Nikko')).getByRole('button', { name: 'Remove' }));
  await screen.findByText('Remove the day trip to Nikko');
  assertNoEngineVocabulary('remove preview');
  await user.click(screen.getByRole('button', { name: 'Keep my trip' }));

  await user.click(routeAlternativeButtons()[0]);
  await screen.findByText('Switch to a different route');
  assertNoEngineVocabulary('route-switch confirm');
  await user.click(screen.getByRole('button', { name: 'Keep my trip' }));

  await user.click(screen.getByRole('button', { name: 'Refine' }));
  await user.click(await screen.findByRole('button', { name: 'Apply and rebuild' }));
  await screen.findByText('Refine your trip');
  assertNoEngineVocabulary('refine confirm');
  await user.click(screen.getByRole('button', { name: 'Keep my trip' }));

  // The Kyoto spur's own preview says what happens to a day trip on a stop it touches.
  await user.click(screen.getAllByRole('button').find((b) => b.textContent === 'KyotoAdd'));
  await user.click(await screen.findByRole('button', { name: 'Add Kyoto' }));
  await screen.findAllByRole('button', { name: 'Use this plan' });
  assertNoEngineVocabulary('add-a-place preview with a day trip selected');
});
