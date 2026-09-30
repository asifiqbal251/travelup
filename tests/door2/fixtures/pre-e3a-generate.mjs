// Generates tests/door2/fixtures/pre-e3a.json: sha256 pins of the shared engine's
// output BEFORE E3a (traveller-selectable excursions) touched it. Peru is already
// pinned by peru-pre-c3a.json; this adds Eastern Canada (its first byte pin),
// Tokyo, NYC and a compile pin per family.
//
// Made at f9c3fac (the base of E3a), before any engine edit. NEVER regenerate it
// after an engine change: it is the tripwire that proves E3a is additive.
//
// Every entry is keyed by family (E3b): `compiled`, `compiledIds` and `ranges` by
// family id, and `trips`, `edits` and `applies` by keys that start with a variant id,
// which starts with its family id. So one family can be re-pinned without touching
// the others. Re-pin a family ONLY when its own data changed on purpose, and never
// the whole file. Re-pins so far:
//   tokyo_city, E3b (Kyoto spur and day-trip menus).
//
//   node tests/door2/fixtures/pre-e3a-generate.mjs [repoRoot] > tests/door2/fixtures/pre-e3a.json
//   node tests/door2/fixtures/pre-e3a-generate.mjs [repoRoot] --family tokyo_city --into tests/door2/fixtures/pre-e3a.json
//
// To reproduce against the base commit without touching the working tree:
//   git worktree add <dir> f9c3fac && ln -s "$PWD/node_modules" <dir>/node_modules
//   node tests/door2/fixtures/pre-e3a-generate.mjs <dir> | cmp - tests/door2/fixtures/pre-e3a.json
//   rm <dir>/node_modules && git worktree remove <dir>
//
// Every hash is sha256 of JSON.stringify of the value.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const FAMILIES = ['peru_classic', 'ec_corridor', 'tokyo_city', 'nyc_city'];

/** The family a fixture key belongs to: a family id, or a key that starts with a variant id. */
export function familyOfKey(key) {
  const familyId = key.split(/[#+:]/)[0];
  if (!FAMILIES.includes(familyId)) throw new Error(`fixture key "${key}" belongs to no pinned family`);
  return familyId;
}

/**
 * Replaces one family's entries in a fixture. Every other family's entries keep
 * their values and their order; the family's new entries take the place of its old ones.
 */
export function mergeFamily(fixture, familyId, fresh) {
  const out = {};
  for (const [section, entries] of Object.entries(fixture)) {
    const merged = {};
    let placed = false;
    for (const [key, value] of Object.entries(entries)) {
      if (familyOfKey(key) !== familyId) {
        merged[key] = value;
      } else if (!placed) {
        Object.assign(merged, fresh[section]);
        placed = true;
      }
    }
    if (!placed) throw new Error(`fixture section "${section}" has no "${familyId}" entries to replace`);
    out[section] = merged;
  }
  return out;
}

/** @param {string} root @param {{families?: string[]}} [options]  Pin only these families (default: all four). */
export async function generate(root, { families = FAMILIES } = {}) {
  const imp = (p) => import(pathToFileURL(path.join(root, 'src/lib/door2', p)).href);
  const { checkVariantsSchedulable, compileFamilies } = await imp('families.js');
  const { PILOT_ROUTE_FAMILIES, PILOT_ROUTE_PACKAGES } = await imp('pilotData.js');
  const { PILOT_DATA, buildFilledTrip } = await imp('planner.js');
  const R = await imp('restructure.js');

  const specFor = (pkg, totalDays) => ({
    originPlaceId: 'vancouver',
    destination: { kind: 'country', id: pkg.countryId },
    travelMonth: 10,
    totalDays,
    travellerType: 'couple',
    interests: [],
    pace: 'balanced',
    budget: 'mid',
    requiredPlaceIds: [],
    routeTemplateId: pkg.id,
    stops: [],
    choices: { pinned: [], rejected: [], placed: [] }
  });

  const compiled = compileFamilies(PILOT_ROUTE_FAMILIES, { includePending: true });
  const out = { compiled: {}, compiledIds: {}, ranges: {}, trips: {}, edits: {}, applies: {} };

  for (const familyId of families) {
    const family = PILOT_ROUTE_FAMILIES.find((f) => f.id === familyId);
    if (!family) throw new Error(`family "${familyId}" not found`);
    const own = compiled.filter((p) => p.familyId === familyId);
    out.compiled[familyId] = sha(own);
    out.compiledIds[familyId] = own.map((p) => p.id);
    const served = PILOT_ROUTE_PACKAGES.filter((p) => p.familyId === familyId);
    const ranges = checkVariantsSchedulable(served, PILOT_DATA);
    out.ranges[familyId] = sha(ranges);

    for (const { variantId, minDays, maxDays } of ranges) {
      const pkg = served.find((p) => p.id === variantId);
      for (let d = minDays; d <= maxDays; d++) {
        const k = `${variantId}:${d}`;
        const trip = buildFilledTrip(specFor(pkg, d));
        out.trips[k] = sha(trip);

        const previews = {};
        for (const s of trip.routePlan.stops) {
          previews[`adj:${s.key}:+1`] = R.previewAdjustNights(trip, s.key, +1);
          previews[`adj:${s.key}:-1`] = R.previewAdjustNights(trip, s.key, -1);
        }
        previews['len+1'] = R.previewChangeLength(trip, d + 1);
        previews['len-1'] = R.previewChangeLength(trip, d - 1);
        if (trip.routePlan.minDays > 1) previews['len-min-1'] = R.previewChangeLength(trip, trip.routePlan.minDays - 1);
        for (const opt of family.optional ?? []) {
          previews[`add:${opt.id}`] = R.previewAddOptional(trip, opt.id);
          previews[`remove:${opt.id}`] = R.previewRemoveOptional(trip, opt.id);
          previews[`moves:${opt.id}`] = R.listMoveOptions(trip, opt.id);
          for (const pos of opt.positions) {
            previews[`add:${opt.id}@${pos.id}`] = R.previewAddOptional(trip, opt.id, pos.id);
            previews[`move:${opt.id}@${pos.id}`] = R.previewMoveOptional(trip, opt.id, pos.id);
          }
        }
        for (const [name, result] of Object.entries(previews)) {
          out.edits[`${k}:${name}`] = sha(result);
          // (d) applyProposal of the first proposal of each preview that offers one.
          if (result?.ok && result.proposals?.length > 0) out.applies[`${k}:${name}`] = sha(R.applyProposal(trip, result.proposals[0]));
        }
      }
    }
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args.splice(i, 2)[1];
  };
  const familyId = flag('--family');
  const into = flag('--into');
  const root = path.resolve(args[0] ?? fileURLToPath(new URL('../../../', import.meta.url)));
  const json = (x) => JSON.stringify(x, null, 2) + '\n';
  if (familyId == null) {
    process.stdout.write(json(await generate(root)));
  } else if (into == null) {
    process.stdout.write(json(await generate(root, { families: [familyId] })));
  } else {
    const fixture = JSON.parse(readFileSync(into, 'utf8'));
    writeFileSync(into, json(mergeFamily(fixture, familyId, await generate(root, { families: [familyId] }))));
  }
}
