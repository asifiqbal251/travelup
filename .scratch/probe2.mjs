import { PILOT_DATA, buildFilledTrip } from '../src/lib/door2/planner.js';
import { previewAddOptional } from '../src/lib/door2/restructure.js';

const PERU = { kind: 'country', id: 'PE' };
function spec(destination, totalDays, requiredPlaceIds = [], extra = {}) {
  return {
    originPlaceId: 'vancouver', destination, travelMonth: 10, totalDays,
    travellerType: 'couple', interests: [], pace: 'balanced', budget: 'mid',
    requiredPlaceIds, routeTemplateId: null, stops: [],
    choices: { pinned: [], rejected: [], placed: [] }, ...extra
  };
}
const DRAFTS = { reviewPolicy: 'allow_drafts' };

for (const n of [11, 12, 13, 14, 15, 16]) {
  const t = buildFilledTrip(spec(PERU, n), PILOT_DATA, DRAFTS);
  if (t.ok === false) { console.log(n, 'FAIL', t.state); continue; }
  console.log(n, 'backbone nights', Object.fromEntries(t.routePlan.stops.map(s=>[s.key,s.nights])));
  const r = previewAddOptional(t, 'huaraz', 'after_lima_in', DRAFTS);
  if (!r.ok) { console.log(n, 'add refused', r.why, r.message); continue; }
  const p = r.proposals[0];
  console.log(n, 'after add   ', Object.fromEntries(p.trip.routePlan.stops.map(s=>[s.key,s.nights])));
  console.log(n, 'placesRemoved', p.diff.placesRemoved, 'placesAdded', p.diff.placesAdded);
}
