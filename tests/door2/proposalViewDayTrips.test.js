// E3c C5: proposalView renders the day-trip keys of a proposal diff, one line
// each, and nothing at all when the keys are absent or empty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayTripChangeLines } from '../../src/lib/door2/proposalView.js';
import { PILOT_PLACES } from '../../src/lib/door2/pilotData.js';
import { PILOT_DATA, buildFilledTrip } from '../../src/lib/door2/planner.js';
import * as R from '../../src/lib/door2/restructure.js';

const nameOf = (id) => PILOT_PLACES[id]?.name ?? id;
const spec = (totalDays, routeTemplateId = null) => ({
  originPlaceId: 'vancouver', destination: { kind: 'country', id: 'JP' }, travelMonth: 10, totalDays,
  travellerType: 'couple', interests: [], pace: 'balanced', budget: 'mid', routeTemplateId, stops: [],
  requiredPlaceIds: [], choices: { pinned: [], rejected: [], placed: [] },
});
const DRAFTS = { reviewPolicy: 'allow_drafts' };

test('C5: absent or empty keys render nothing', () => {
  assert.deepEqual(dayTripChangeLines({}, nameOf), []);
  assert.deepEqual(dayTripChangeLines({ excursionsAdded: [], excursionsRemoved: [] }, nameOf), []);
  assert.deepEqual(dayTripChangeLines(undefined, nameOf), []);
});

test('C5: each of the four lines, from constructed diffs', () => {
  assert.deepEqual(dayTripChangeLines({ excursionsAdded: [{ stopKey: 's', excursionId: 'nikko', placeId: 'nikko' }] }, nameOf), ['Adds a day trip to Nikko.']);
  const removed = (reason) => ({ excursionsRemoved: [{ stopKey: 's', excursionId: 'nara', placeId: 'nara', reason }] });
  assert.deepEqual(dayTripChangeLines(removed('traveller_removed'), nameOf), ['Removes your day trip to Nara.']);
  assert.deepEqual(dayTripChangeLines(removed('stop_removed'), nameOf), ['Your day trip to Nara goes with it.']);
  assert.deepEqual(dayTripChangeLines(removed('no_longer_offered'), nameOf), ['Your day trip to Nara is no longer available.']);
});

test('C5: real engine diffs: add, traveller remove, and removing the stop that holds a day trip', () => {
  const trip = buildFilledTrip(spec(10), PILOT_DATA, DRAFTS);
  const add = R.previewAddExcursion(trip, 'tokyo_base', 'nikko').proposals[0];
  assert.deepEqual(dayTripChangeLines(add.diff, nameOf), ['Adds a day trip to Nikko.']);
  const withNikko = R.applyProposal(trip, add).trip;
  const rm = R.previewRemoveExcursion(withNikko, 'tokyo_base', 'nikko').proposals[0];
  assert.deepEqual(dayTripChangeLines(rm.diff, nameOf), ['Removes your day trip to Nikko.']);
  const nights = R.previewAdjustNights(trip, 'tokyo_base', 1).proposals[0];
  assert.equal('excursionsAdded' in nights.diff || 'excursionsRemoved' in nights.diff, false, 'keys absent on an unrelated change');
  assert.deepEqual(dayTripChangeLines(nights.diff, nameOf), []);

  const spur = buildFilledTrip(spec(10, 'tokyo_city+kyoto@after_tokyo'), PILOT_DATA, DRAFTS);
  const withNara = R.applyProposal(spur, R.previewAddExcursion(spur, 'kyo_base', 'nara').proposals[0]).trip;
  const dropKyoto = R.previewRemoveOptional(withNara, 'kyoto');
  assert.equal(dropKyoto.ok, true);
  assert.deepEqual(dayTripChangeLines(dropKyoto.proposals[0].diff, nameOf), ['Your day trip to Nara goes with it.']);
});
