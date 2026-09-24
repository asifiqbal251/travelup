import { PILOT_DATA, buildFilledTrip } from '/app/src/lib/door2/planner.js';

function isEmptyDay(day) {
  return (
    day.blocks.length > 0 &&
    day.blocks.every((b) => (b.durationHours ?? 0) === 0 && (b.type === "rest" || b.note === "in_transit"))
  );
}

function groupDaysByPlace(trip) {
  const majorStops = trip.spec.stops.filter((s) => s.nights > 0);
  const displayDays = trip.days.filter((d) => !isEmptyDay(d));
  function dayEndPlace(day) {
    const last = day.blocks[day.blocks.length - 1];
    if (!last) return null;
    return last.type === "travel" ? last.transport?.toPlaceId : last.placeId;
  }
  const groups = majorStops.map((s) => ({ placeId: s.placeId, nights: s.nights, days: [] }));
  let stopPtr = 0;
  for (const day of displayDays) {
    const pid = dayEndPlace(day);
    if (stopPtr + 1 < majorStops.length && pid === majorStops[stopPtr + 1].placeId) {
      stopPtr += 1;
    }
    groups[stopPtr].days.push(day);
  }
  return groups;
}

const MODE_LABELS = {
  flight_international: "flight", flight_domestic: "flight", train: "train",
  road_private_transfer: "transfer", coach_scheduled: "coach",
  local_shuttle: "shuttle", ferry: "ferry",
};
function modeLabel(mode) { return MODE_LABELS[mode] ?? String(mode ?? "").replace(/_/g, " "); }
function edgeLabel(modes) {
  const deduped = modes.filter((m, i) => m !== modes[i - 1]);
  return deduped.map(modeLabel).join(" + ");
}
function tripAtGlanceSegments(trip) {
  const majorStops = trip.spec.stops.filter((s) => s.nights > 0);
  if (majorStops.length === 0) return { nodes: [], edges: [] };
  const travelBlocks = trip.days.flatMap((d) => d.blocks).filter((b) => b.type === "travel" && b.transport);
  const edges = [];
  let pending = [];
  let segmentStartPlace = trip.spec.originPlaceId;
  let majorIdx = 0;
  for (const block of travelBlocks) {
    if (majorIdx >= majorStops.length) break;
    pending.push(block.transport.mode);
    const to = block.transport.toPlaceId;
    if (to === majorStops[majorIdx].placeId) {
      if (majorIdx > 0) edges.push(pending);
      pending = []; segmentStartPlace = to; majorIdx += 1;
    } else if (to === segmentStartPlace) {
      pending = [];
    }
  }
  return { nodes: majorStops, edges };
}

const spec={originPlaceId:'vancouver',destination:{kind:'country',id:'PE'},totalDays:10,travelMonth:10,travellerType:'couple',interests:[],pace:'balanced',budget:'mid',routeTemplateId:null,stops:[],requiredPlaceIds:[],choices:{pinned:[],rejected:[],placed:[]}};
const t=buildFilledTrip(spec,PILOT_DATA,{reviewPolicy:'allow_drafts'});

console.log('=== Days total:', t.days.length);
console.log('=== Empty days:', t.days.filter(isEmptyDay).map(d=>d.dayNumber));

console.log('\n=== groupDaysByPlace ===');
for (const g of groupDaysByPlace(t)) {
  console.log(g.placeId, g.nights, 'nights -> days', g.days.map(d=>d.dayNumber));
}

console.log('\n=== tripAtGlanceSegments ===');
const {nodes, edges} = tripAtGlanceSegments(t);
nodes.forEach((n,i)=>{
  if (i > 0) console.log('  --', edgeLabel(edges[i-1]), '-->');
  console.log(n.placeId, n.nights, 'nights');
});
