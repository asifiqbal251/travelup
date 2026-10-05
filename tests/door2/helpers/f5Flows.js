// Explicit setup for pre-F5 edit scenarios. These helpers use real page actions;
// new-default tests continue using mountAndBuildViaIntake without this selection.
import assert from 'node:assert/strict';
import { mountAndBuildViaIntake } from './domHarness.js';
const { screen } = await import('@testing-library/react');

export async function chooseCoreRoute(user, destination) {
  const prefix = destination === 'Japan' ? 'Tokyo ·' : 'Toronto to Québec City ·';
  const button = screen.getAllByRole('button').find((b) => b.textContent.startsWith(prefix));
  assert.ok(button, `explicit core alternative ${prefix}`);
  await user.click(button);
  await screen.findByText('Route changed');
}

export async function mountAndChooseCore(M, values) {
  const result = await mountAndBuildViaIntake(M, values);
  await chooseCoreRoute(result.user, values.destination);
  return result;
}

export async function setDays(user, target) {
  let current = Number(screen.getByText(/^\d+ days$/).textContent.match(/\d+/)[0]);
  while (current !== target) {
    await user.click(screen.getByRole('button', {name: current < target ? '+' : '−'}));
    current += current < target ? 1 : -1;
  }
}

// Isolated synthetic ranges in the bundled page's catalogue, restored even on
// assertion failure. No production catalogue file or stored trip is modified.
export async function withGapCatalogue(M, run) {
  const original = [...M.PILOT_DATA.routePackages];
  const base = original.find((p) => p.id === 'tokyo_city');
  const packages = [['tokyo_city',3,5],['tokyo_city+kyoto@after_tokyo',8,10]]
    .map(([id,minNights,maxNights]) => ({...base,id,variantId:id,
      stops:base.stops.map((s) => ({...s,minNights,maxNights}))}));
  M.PILOT_DATA.routePackages.splice(0,original.length,...packages);
  try { await run(); } finally { M.PILOT_DATA.routePackages.splice(0,packages.length,...original); }
}
