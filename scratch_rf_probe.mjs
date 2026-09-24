import { PILOT_DATA, buildFilledTrip, buildSkeletonTrip } from '/app/src/lib/door2/planner.js';
import { selectRoutes } from '/app/src/lib/door2/route.js';
import { scheduleRoute } from '/app/src/lib/door2/schedule.js';
import { fillTrip } from '/app/src/lib/door2/fill.js';

const base = { originPlaceId: 'vancouver', destination: { kind: 'country', id: 'PE' }, travelMonth: 10, travellerType: 'couple', interests: [], pace: 'balanced', budget: 'mid', routeTemplateId: null, stops: [], requiredPlaceIds: [], choices: { pinned: [], rejected: [], placed: [] } };

function routeFor(pkgId, N) {
  const r = selectRoutes({ ...base, totalDays: N, routeTemplateId: pkgId }, PILOT_DATA, { reviewPolicy: 'allow_drafts' });
  return r.value.find((x) => x.routePackageId === pkgId);
}

// Force exact nights by pinning min=max.
function forced(route, nightsArr) {
  return { ...route, stops: route.stops.map((s, i) => ({ ...s, minNights: nightsArr[i], maxNights: nightsArr[i] })) };
}

console.log('=== 1. Linearity: days = minDays + sum(extra nights)');
const pc = routeFor('peru_classic', 10);
console.log('peru_classic stops', pc.stops.map((s) => `${s.id}[${s.minNights}-${s.maxNights}]`).join(' '));
const baseMin = pc.stops.map((s) => s.minNights);
const minRun = scheduleRoute(pc, { ...base, totalDays: 30 }, PILOT_DATA);
console.log('minDays at package mins =', minRun.ok ? 'n/a' : minRun, minRun.ok === false ? '' : '');
// minDays: schedule forced mins with a large N fails with too-short? Use detail from a 1-day request instead.
const tooShort = scheduleRoute(pc, { ...base, totalDays: 1 }, PILOT_DATA);
const minDays = tooShort.detail.minDays;
console.log('minDays =', minDays, 'mins =', baseMin.join(','));

const allocations = [
  [2, 3, 0, 1, 0, 0, 1],
  [1, 4, 0, 1, 0, 0, 1],
  [3, 2, 0, 1, 0, 0, 1],
  [1, 3, 0, 2, 0, 0, 1],
  [1, 3, 1, 1, 0, 0, 1],
  [2, 2, 1, 1, 0, 0, 1],
  [3, 4, 1, 2, 0, 0, 1],
];
for (const a of allocations) {
  const predicted = minDays + a.reduce((s, n, i) => s + (n - baseMin[i]), 0);
  let res;
  try { res = scheduleRoute(forced(pc, a), { ...base, totalDays: predicted }, PILOT_DATA); } catch (e) { res = { err: e.message }; }
  console.log(a.join(','), 'predicted', predicted, '->', res.ok ? `OK home D${res.value.homeArrival.dayNumber} ${res.value.homeArrival.time}` : JSON.stringify(res.err ?? res.detail));
}

console.log('\n=== 2. Block-id survival: Lima 2/Cusco 3 -> Lima 1/Cusco 4 (both 10 days)');
const A = scheduleRoute(forced(pc, [2, 3, 0, 1, 0, 0, 1]), { ...base, totalDays: 10 }, PILOT_DATA).value;
const B = scheduleRoute(forced(pc, [1, 4, 0, 1, 0, 0, 1]), { ...base, totalDays: 10 }, PILOT_DATA).value;
const idsA = new Map(A.days.flatMap((d) => d.blocks.map((b) => [b.id, { d: d.dayNumber, t: b.startTime, h: b.durationHours, type: b.type }])));
const idsB = new Map(B.days.flatMap((d) => d.blocks.map((b) => [b.id, { d: d.dayNumber, t: b.startTime, h: b.durationHours, type: b.type }])));
let same = 0, moved = 0, gone = [], added = [];
for (const [id, a] of idsA) {
  const b = idsB.get(id);
  if (!b) gone.push(id);
  else if (a.t === b.t && a.h === b.h) same++;
  else moved++;
}
for (const id of idsB.keys()) if (!idsA.has(id)) added.push(id);
console.log('open/travel blocks A', idsA.size, 'B', idsB.size, '| same id+time+duration', same, '| same id, changed time/duration', moved);
console.log('gone:', gone.join(' '));
console.log('added:', added.join(' '));

console.log('\n=== 3. Day shapes per stop (10-day classic) — which days are pure full days');
for (const d of A.days) {
  const desc = d.blocks.map((b) => `${b.type}${b.type === 'open' ? `(${b.id} ${b.startTime} ${b.durationHours}h)` : b.type === 'travel' ? `(${b.id})` : ''}`).join(' | ');
  console.log('D' + d.dayNumber, desc);
}

console.log('\n=== 4. Huaraz variant minimum days, and 10/12/14 day builds');
const ph = routeFor('peru_classic_huaraz', 14);
const phShort = scheduleRoute(ph, { ...base, totalDays: 1 }, PILOT_DATA);
console.log('peru_classic_huaraz minDays =', phShort.detail.minDays, 'stops', ph.stops.map((s) => `${s.id}[${s.minNights}-${s.maxNights}]`).join(' '));
for (const N of [10, 12, 14]) {
  const t = buildFilledTrip({ ...base, totalDays: N, requiredPlaceIds: ['huaraz'] }, PILOT_DATA, { reviewPolicy: 'allow_drafts' });
  console.log(`N=${N} require huaraz ->`, t.ok === false ? `${t.state}: ${JSON.stringify(t.options)}` : t.spec.stops.filter((s) => s.nights > 0).map((s) => `${s.placeId}:${s.nights}`).join(' '));
}
console.log('classic maxDays =', minDays + pc.stops.reduce((s, x) => s + (x.maxNights - x.minNights), 0));
