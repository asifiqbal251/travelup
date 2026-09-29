// B6 (add/remove optional) and B7 (move optional) — driven through the real
// Door2Plan page. B8 (route switch + F6 confirm) lives in its own file
// (flowRouteSwitch.test.js): running it in the same process as B6+B7 causes
// a reproducible CPU/heap runaway in this jsdom+esbuild harness (each pair
// is fine alone; all three together in one process reliably hang). node
// --test isolates per file, so splitting the file is the practical fix;
// see the report for what was tried.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDoor2PlanModule, mountWithBuiltTrip, peruSpec, teardown } from './helpers/domHarness.js';

const M = await loadDoor2PlanModule();
after(teardown);
const { screen } = await import('@testing-library/react');

/** The nights-chip <button> (e.g. "3 nights") that sits next to a place's name span. */
function nightsButtonFor(placeName) {
  const nameSpan = screen.getAllByText(placeName).find((n) => n.tagName === 'SPAN');
  return nameSpan.parentElement.querySelector('button');
}

test('B6: add Huaraz (proposal -> apply), then remove it', async () => {
  const { user } = await mountWithBuiltTrip(M, peruSpec({ totalDays: 10 }));

  await user.click(await screen.findByText('Huaraz & the Cordillera Blanca'));
  await user.click(await screen.findByText('Add Huaraz & the Cordillera Blanca'));

  const useButtons = await screen.findAllByText('Use this plan');
  const before = screen.getByText('Before').closest('div').textContent;
  const after = screen.getByText('After').closest('div').textContent;
  assert.notEqual(before, after, 'proposal before/after differ');
  assert.doesNotMatch(before, /Huaraz/, 'Huaraz absent before');
  assert.match(after, /Huaraz/, 'Huaraz present after');

  await user.click(useButtons[0]);
  await screen.findByText('Trip updated');

  let glanceText = screen.getByText('Your trip at a glance').closest('div').textContent;
  assert.match(glanceText, /Huaraz/, 'Huaraz added to the trip');
  assert.ok(screen.queryByText(/can't be built yet/) === null, 'trip still valid');

  // Now remove it via its nights sheet.
  await user.click(nightsButtonFor('Huaraz'));
  await user.click(await screen.findByText(/Remove Huaraz.*from your trip/));
  await user.click((await screen.findAllByText('Use this plan'))[0]);
  await screen.findByText('Trip updated');

  const itinerarySummary = screen.getByText(/\d+ days ·/).textContent;
  assert.doesNotMatch(itinerarySummary, /Huaraz/, 'Huaraz removed from the itinerary (may be offered again as addable)');
  assert.ok(screen.queryByText(/can't be built yet/) === null, 'trip still valid after removal');
});

test('B7: move Huaraz between its two positions (before/after columns actually differ, both directions work)', async () => {
  const spec = peruSpec({
    totalDays: 16,
    routeTemplateId: 'peru_classic+huaraz@after_lima_in',
  });
  const { user } = await mountWithBuiltTrip(M, spec);

  assert.match(screen.getByText('Your trip at a glance').closest('div').textContent, /Huaraz/);

  async function moveTo(labelText) {
    await user.click(nightsButtonFor('Huaraz'));
    await user.click(await screen.findByText('Move to a different point in your trip'));
    const option = await screen.findByText(labelText);
    await user.click(option);

    // Compare only the place/nights rows, not the "Before"/"After" header labels
    // themselves (which would trivially always differ regardless of content).
    const rowsOf = (headerText) => {
      const header = [...screen.getAllByText(headerText)].find((n) => n.tagName === 'P');
      return [...header.closest('div').querySelectorAll('p')].slice(1).map((p) => p.textContent).join('|');
    };
    assert.notEqual(rowsOf('Before'), rowsOf('After'), 'Before/After columns differ (the 24 Sep regression)');

    await user.click(screen.getByText('Use this plan'));
    await screen.findByText('Trip updated');
  }

  await moveTo('Near the end, before flying home');
  assert.match(screen.getByText('Your trip at a glance').closest('div').textContent, /Huaraz/, 'still present after first move');

  await moveTo('Right after arriving in Lima');
  assert.match(screen.getByText('Your trip at a glance').closest('div').textContent, /Huaraz/, 'still present after moving back');
});

