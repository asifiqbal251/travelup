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
const t10 = buildFilledTrip(spec(PERU, 10), PILOT_DATA, DRAFTS);
console.log('t10 nights', Object.fromEntries(t10.routePlan.stops.map(s=>[s.key,s.nights])));
const r10 = previewAddOptional(t10, 'huaraz', 'after_lima_in', DRAFTS);
console.log('r10', r10.ok, r10.why, r10.message);
if (!r10.ok) {
  const ext = r10.alternatives[0];
  const minDays = ext.trip.spec.totalDays;
  console.log('ext totalDays', minDays);
  const tAtMin = buildFilledTrip(spec(PERU, minDays), PILOT_DATA, DRAFTS);
  console.log('tAtMin nights', Object.fromEntries(tAtMin.routePlan.stops.map(s=>[s.key,s.nights])));
  const rAtMin = previewAddOptional(tAtMin, 'huaraz', 'after_lima_in', DRAFTS);
  console.log('rAtMin ok', rAtMin.ok);
  if (rAtMin.ok) {
    const p = rAtMin.proposals[0];
    console.log('p nights', Object.fromEntries(p.trip.routePlan.stops.map(s=>[s.key,s.nights])));
    console.log('p diff', JSON.stringify(p.diff, null, 2));
  } else {
    console.log(rAtMin);
  }
}
