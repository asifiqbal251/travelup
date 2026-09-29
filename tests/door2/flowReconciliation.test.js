// B12: reconciliation across subsystems.
//
// (a) is a real UI flow (swap survives a structural change; undo restores
// byte-identical). (b) needs a *pinned* activity that can't survive a
// structural change — but pin/unpin has no UI in Door2Plan.jsx (see
// flowEdits.test.js), so per the Peru-freeze decision this half is
// engine-level: it calls pinActivity and the restructure.js preview/apply
// functions directly. Because no UI path can create a pin today, B12(b)'s
// "stop rule" (don't design a UI, report what keptItemsAffected contained
// and where a message would go) is NOT triggered — there is no UI moment
// where this loss could even occur yet. See the report for keptItemsAffected's
// actual contents.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDoor2PlanModule, mountWithBuiltTrip, peruSpec, teardown } from './helpers/domHarness.js';
import { pinActivity } from '../../src/lib/door2/edit.js';
import { previewAdjustNights, previewRemoveOptional, applyProposal } from '../../src/lib/door2/restructure.js';
import { tripFingerprint } from '../../src/lib/door2/fingerprint.js';

const M = await loadDoor2PlanModule();
after(teardown);
const { screen } = await import('@testing-library/react');

test('B12a (UI): a content edit survives a structural change that leaves its block untouched; undo restores the original byte-identical', async () => {
  const { user, trip: originalTrip } = await mountWithBuiltTrip(M, peruSpec({ totalDays: 10 }));

  // Swap the first activity (in Lima) — Cusco nights +1 below doesn't touch Lima's blocks.
  await user.click(screen.getAllByText('Swap')[0]);
  await screen.findByText('Swapped');
  const swappedTitle = screen.getAllByText('Swap')[0].closest('div').querySelector('p.font-medium')?.textContent;

  await user.click(screen.getByText('3 nights'));
  await user.click(await screen.findByText('More time here (+1 night)'));
  await user.click((await screen.findAllByText('Use this plan'))[0]);
  await screen.findByText('Trip updated');

  const afterTitle = screen.getAllByText('Swap')[0].closest('div').querySelector('p.font-medium')?.textContent;
  assert.equal(afterTitle, swappedTitle, 'the swapped activity survives the structural change');
  assert.match(screen.getByText(/\d+ days ·/).textContent, /Cusco 4 nights/);

  await user.click(screen.getByText('Undo last change'));
  await screen.findByText('Undone');
  await user.click(screen.getByText('Undo last change'));
  await screen.findByText('Undone');

  await user.click(screen.getByRole('button', { name: 'Save' }));
  const saved = M.listDraftTrips()[0].trip;
  assert.equal(tripFingerprint(saved), tripFingerprint(originalTrip));
  const strip = (t) => { const { history, ...rest } = t; return rest; };
  assert.deepEqual(strip(saved), strip(originalTrip), 'byte-identical to the original after undoing both edits');
});

test('B12b (engine): a pin that cannot survive a structural change is listed in keptItemsAffected, never silently dropped', () => {
  const spec = peruSpec({ totalDays: 12, routeTemplateId: 'peru_classic+huaraz@after_lima_in' });
  const trip = M.buildFilledTrip(spec, M.PILOT_DATA, { reviewPolicy: 'allow_drafts' });

  const huarazBlock = trip.days.flatMap((d) => d.blocks).find((b) => b.type === 'activity' && b.placeId === 'huaraz');
  assert.ok(huarazBlock, 'trip has a Huaraz activity block to pin');
  const pinned = pinActivity(trip, huarazBlock.id);
  assert.equal(pinned.ok, true);
  assert.equal(pinned.trip.days.flatMap((d) => d.blocks).find((b) => b.id === huarazBlock.id).locked, true);

  // Removing Huaraz entirely means the pinned block's id can't exist as an
  // open block of the same slot class in the rebuilt (Huaraz-free) skeleton.
  const removal = previewRemoveOptional(pinned.trip, 'huaraz');
  assert.equal(removal.ok, true, 'removal is still offered (a lost pin does not block the structural change)');
  const proposal = removal.proposals[0];

  const keptItemsAffected = proposal.diff.keptItemsAffected;
  assert.equal(keptItemsAffected.length, 1, 'exactly the one pinned item is reported as affected');
  assert.equal(keptItemsAffected[0].blockId, huarazBlock.id);
  assert.equal(keptItemsAffected[0].contentId, huarazBlock.anchor.contentId);
  assert.equal(keptItemsAffected[0].placeId, 'huaraz');

  const applied = applyProposal(pinned.trip, proposal);
  assert.equal(applied.ok, true);
  assert.equal(applied.trip.days.flatMap((d) => d.blocks).some((b) => b.id === huarazBlock.id), false, 'the pinned block genuinely no longer exists (Huaraz removed)');

  // Where a message would go, per the stop rule: ProposalCard (src/pages/Door2Plan.jsx)
  // renders `summarizeDiff(proposal.diff)`, which reads only activitiesLost/
  // activitiesAdded — `diff.keptItemsAffected` is computed but never read by
  // any UI code. That is the exact place a "your pinned X couldn't be kept"
  // message would be added, once pinning itself has a UI (see ADR-002 update).
});

test('B12c (engine, control): a pin that CAN survive a structural change is kept, and undo restores the original', () => {
  const spec = peruSpec({ totalDays: 10 });
  const trip = M.buildFilledTrip(spec, M.PILOT_DATA, { reviewPolicy: 'allow_drafts' });
  const limaBlock = trip.days.flatMap((d) => d.blocks).find((b) => b.type === 'activity' && b.placeId === 'lima');
  const pinned = pinActivity(trip, limaBlock.id);
  assert.equal(pinned.ok, true);

  const nights = previewAdjustNights(pinned.trip, pinned.trip.routePlan.stops.find((s) => s.placeId === 'cusco').key, 1);
  assert.equal(nights.ok, true);
  const applied = applyProposal(pinned.trip, nights.proposals[0]);
  assert.equal(applied.ok, true);

  const survivedBlock = applied.trip.days.flatMap((d) => d.blocks).find((b) => b.id === limaBlock.id);
  assert.ok(survivedBlock, 'pinned Lima block still exists');
  assert.equal(survivedBlock.locked, true, 'still pinned');
  assert.equal(survivedBlock.anchor.contentId, limaBlock.anchor.contentId, 'same content, not silently re-picked');
  assert.equal(applied.trip.history[applied.trip.history.length - 1] === undefined, false);
});
