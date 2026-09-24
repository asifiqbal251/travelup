import { useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import PageNotFound from "@/lib/PageNotFound";
import { makeDayLighter, swapActivity, swapDays, swappableDays, undo } from "@/lib/door2/edit";
import { PILOT_DATA, buildFilledTrip } from "@/lib/door2/planner";
import { PILOT_PLACES, PILOT_ROUTE_FAMILIES, PILOT_ROUTE_PACKAGES } from "@/lib/door2/pilotData";
import { selectRoutes } from "@/lib/door2/route";
import { applyProposal, listMoveOptions, previewAddOptional, previewAdjustNights, previewRemoveOptional } from "@/lib/door2/restructure";
import { MONTHS } from "@/lib/options";
import {
  deleteDraftTrip,
  listDraftTrips,
  loadDraftTrip,
  saveDraftTrip,
} from "@/lib/door2/draftStorage";

// ── Constants ─────────────────────────────────────────────────────────────────

const DESTINATIONS = [
  { value: "country:PE", label: "Peru" },
  { value: "country:US", label: "United States" },
  { value: "country:JP", label: "Japan" },
  ...Object.values(PILOT_PLACES)
    .filter((p) => p.id !== "vancouver")
    .map((p) => ({ value: `place:${p.id}`, label: p.name })),
];

const QUICK_DESTINATIONS = DESTINATIONS.filter((d) => d.value.startsWith("country:"));

const PACES = [
  { value: "relaxed", label: "Relaxed" },
  { value: "balanced", label: "Balanced" },
  { value: "fast-paced", label: "Fast-paced" },
];

const INTERESTS = [
  "Cities",
  "Food",
  "History and culture",
  "Photography",
  "Nature",
  "Hiking",
  "Adventure",
  "Beaches",
  "Relaxation",
  "Wildlife",
];

const TRAVELLER_OPTIONS = [
  { value: "solo", label: "Solo" },
  { value: "couple", label: "Couple" },
  { value: "friends", label: "Friends group" },
  { value: "family", label: "Family" },
];

const MONTH_OPTIONS = MONTHS.map((name, i) => ({ value: i + 1, label: name }));

const MODE_LABELS = {
  flight_international: "flight",
  flight_domestic: "flight",
  train: "train",
  road_private_transfer: "transfer",
  coach_scheduled: "coach",
  local_shuttle: "shuttle",
  ferry: "ferry",
};

const DEFAULT_FORM = {
  destination: "",
  totalDays: 10,
  travelMonth: 10,
  travellerType: "couple",
  pace: "balanced",
  interests: [],
  required: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function placeName(id) {
  return PILOT_PLACES[id]?.name ?? id ?? "—";
}

function nightsLabel(n) {
  return `${n} night${n === 1 ? "" : "s"}`;
}

function modeLabel(mode) {
  return MODE_LABELS[mode] ?? String(mode ?? "").replace(/_/g, " ");
}

function requiredPlacesForDestination(destinationValue) {
  if (!destinationValue || destinationValue.startsWith("place:")) return [];
  const countryId = destinationValue.split(":")[1];
  return Object.values(PILOT_PLACES).filter(
    (p) => p.countryId === countryId && p.id !== "vancouver"
  );
}

function destinationLabel(destinationValue) {
  return DESTINATIONS.find((d) => d.value === destinationValue)?.label ?? "Your trip";
}

function autoLabel(spec) {
  const destLabel =
    spec.destination?.kind === "place"
      ? (PILOT_PLACES[spec.destination.id]?.name ?? spec.destination.id)
      : (DESTINATIONS.find((d) => d.value === `country:${spec.destination?.id}`)?.label ?? spec.destination?.id ?? "Trip");
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${destLabel} · ${spec.totalDays} days · ${date}`;
}

function routeLabel(routeResult) {
  const pkg = PILOT_ROUTE_PACKAGES.find(p => p.id === routeResult.routePackageId);
  if (!pkg) return { name: routeResult.routePackageId, stops: routeResult.routePackageId, stopCount: 0 };
  const stops = routeResult.stops.map(s => PILOT_PLACES[s.placeId]?.name ?? s.placeId).join(' → ');
  return { name: pkg.name, stops, stopCount: routeResult.stops.length };
}

/** The family this trip belongs to, or null (route families are the only route type, but be defensive). */
function familyFor(trip) {
  return PILOT_ROUTE_FAMILIES.find((f) => f.id === trip?.routePlan?.familyId) ?? null;
}

/** Optionals not yet in the trip that have at least one approved (never held) position to add at. */
function addableOptionalsFor(trip) {
  const family = familyFor(trip);
  if (!family) return [];
  const included = new Set((trip.routePlan.optionals ?? []).map((o) => o.optionalId));
  return (family.optional ?? [])
    .filter((o) => !included.has(o.id) && o.positions.some((p) => p.status === "approved"))
    .map((o) => ({ optionalId: o.id, label: o.label, pitch: o.pitch }));
}

/** The optional's traveller-facing label for a stop that belongs to one (e.g. "Huaraz & the Cordillera Blanca"). */
function optionalLabelFor(trip, optionalId) {
  return familyFor(trip)?.optional?.find((o) => o.id === optionalId)?.label ?? optionalId;
}

function summarizeDiff(diff) {
  const groupByPlace = (items) => {
    const map = new Map();
    for (const it of items ?? []) {
      const list = map.get(it.placeId) ?? [];
      list.push(it.title);
      map.set(it.placeId, list);
    }
    return map;
  };
  const lost = groupByPlace(diff.activitiesLost);
  const gained = groupByPlace(diff.activitiesAdded);
  const clause = (map, verb) =>
    [...map.entries()].map(([placeId, titles]) => `${verb} ${titles.join(" & ")} in ${placeName(placeId)}`);
  const parts = [...clause(lost, "lose"), ...clause(gained, "gain")];
  if (parts.length === 0) return "Everything else stays the same.";
  return `You'll ${parts.join("; you'll ")}.`;
}

function chipClass(active) {
  return `px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
    active
      ? "bg-teal text-slate-900 border-teal"
      : "bg-slate-700 text-slate-300 border-slate-600 hover:border-slate-400"
  }`;
}

/** A day whose only content is an in-transit marker (e.g. landing just after
 * midnight) carries no information of its own — it's folded into the
 * previous day's travel block display instead of getting its own card. */
function isEmptyDay(day) {
  return (
    day.blocks.length > 0 &&
    day.blocks.every((b) => (b.durationHours ?? 0) === 0 && (b.type === "rest" || b.note === "in_transit"))
  );
}

/** Derive the ordered sequence of major stops (nights > 0) plus the travel
 * mode(s) connecting each pair, purely from data the trip already carries.
 * Round-trip excursions (e.g. a Machu Picchu day trip from Aguas Calientes)
 * are detected and excluded — they return to the same place they left, so
 * they don't represent progress toward the next major stop. */
function tripAtGlanceSegments(trip) {
  const majorStops = trip.spec.stops.filter((s) => s.nights > 0);
  if (majorStops.length === 0) return { nodes: [], edges: [] };
  // spec.stops is a derived mirror of routePlan.stops for this schema version
  // (design §7), so filtering both to nights > 0 and zipping by position lines
  // them up correctly — including a place visited twice (e.g. Lima in and out),
  // where matching by placeId alone would collide.
  const majorRouteStops = (trip.routePlan?.stops ?? []).filter((s) => s.nights > 0);
  const routeStopAt = (i) => (majorRouteStops.length === majorStops.length ? majorRouteStops[i] : null);

  const travelBlocks = trip.days
    .flatMap((d) => d.blocks)
    .filter((b) => b.type === "travel" && b.transport);

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
      pending = [];
      segmentStartPlace = to;
      majorIdx += 1;
    } else if (to === segmentStartPlace) {
      pending = [];
    }
  }

  return { nodes: majorStops.map((s, i) => ({ ...s, routeStop: routeStopAt(i) })), edges };
}

function edgeLabel(modes) {
  const deduped = modes.filter((m, i) => m !== modes[i - 1]);
  return deduped.map(modeLabel).join(" + ");
}

/** Group the trip's days under the major stop (nights > 0) each day belongs
 * to, in order, so the itinerary reads "Lima · 2 nights" then its days,
 * "Cusco · 3 nights" then its days, and so on — rather than a flat day list
 * or day-by-day tabs. A day's group is decided by where it ends (its last
 * block's place); the final travel-home day rides along with the last group
 * since it has no destination place of its own. */
function groupDaysByPlace(trip) {
  const majorStops = trip.spec.stops.filter((s) => s.nights > 0);
  const displayDays = trip.days.filter((d) => !isEmptyDay(d));

  if (majorStops.length === 0) {
    return [{ placeId: null, nights: 0, days: displayDays }];
  }

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

// ── Saved trips ──────────────────────────────────────────────────────────────

function SavedTripsList({ onLoad }) {
  const [drafts, setDrafts] = useState(() => listDraftTrips());
  const [inlineErrors, setInlineErrors] = useState({});

  function handleDelete(id) {
    deleteDraftTrip(id);
    setDrafts(listDraftTrips());
  }

  function handleLoad(id) {
    const r = loadDraftTrip(id);
    if (r.compatible) {
      onLoad(r.trip);
    } else {
      setInlineErrors((e) => ({ ...e, [id]: r.reason }));
    }
  }

  if (drafts.length === 0) return null;

  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-slate-300">My saved trips</h2>
      <ul className="space-y-2">
        {drafts.map((d) => (
          <li key={d.id} className="flex items-start gap-3 py-2 border-b border-slate-700 last:border-0">
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-white truncate">{d.label}</p>
              <p className="text-xs text-slate-500">
                {new Date(d.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
              {inlineErrors[d.id] && (
                <p className="text-xs text-rose-400">{inlineErrors[d.id]}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleLoad(d.id)}
                className="text-xs px-2.5 py-1 rounded-md bg-teal text-slate-900 hover:opacity-90 font-semibold transition-opacity"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={() => handleDelete(d.id)}
                className="text-xs px-2.5 py-1 rounded-md bg-slate-700 text-rose-400 hover:bg-slate-600 font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Intake: destination step ────────────────────────────────────────────────

function DestinationStep({ query, onQueryChange, onPick, onLoad }) {
  const q = query.trim().toLowerCase();
  const results = q ? DESTINATIONS.filter((d) => d.label.toLowerCase().includes(q)) : [];

  return (
    <div className="space-y-4">
      <SavedTripsList onLoad={onLoad} />
      <div className="rounded-xl bg-slate-800 border border-slate-700 p-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Where are you going?</h1>
          <p className="text-sm text-slate-500">Pilot catalogue · a handful of places, built properly.</p>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search a country or place"
          className="w-full border border-slate-600 rounded-lg px-4 py-3 text-sm bg-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal"
        />

        {q ? (
          <div className="space-y-2">
            {results.length === 0 && (
              <p className="text-sm text-slate-500">No matches in the pilot catalogue yet.</p>
            )}
            {results.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => onPick(d.value)}
                className="w-full text-left px-4 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white text-sm font-medium transition-colors"
              >
                {d.label}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <p className="text-xs font-medium text-slate-400 mb-2">Or pick a common one</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_DESTINATIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => onPick(d.value)}
                  className="px-4 py-2 rounded-full bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white text-sm font-medium transition-colors"
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Intake: basics step ─────────────────────────────────────────────────────

function BasicsStep({ form, updateForm, onBack, onSubmit }) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-slate-400 hover:text-white transition-colors"
      >
        ← Back
      </button>
      <div className="rounded-xl bg-slate-800 border border-slate-700 p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">
            {destinationLabel(form.destination)}
          </h1>
          <p className="text-sm text-slate-500">Three quick answers and we&apos;ll build it.</p>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">When</p>
          <div className="flex flex-wrap gap-2">
            {MONTH_OPTIONS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => updateForm({ travelMonth: m.value })}
                className={chipClass(form.travelMonth === m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">How long</p>
          <div className="flex items-center justify-center gap-5 bg-slate-700 border border-slate-600 rounded-lg py-4">
            <button
              type="button"
              onClick={() => updateForm({ totalDays: Math.max(1, Number(form.totalDays) - 1) })}
              className="w-9 h-9 rounded-full bg-slate-600 text-white text-lg font-bold hover:bg-slate-500 transition-colors"
            >
              −
            </button>
            <div className="text-xl font-bold text-white w-24 text-center">
              {form.totalDays} days
            </div>
            <button
              type="button"
              onClick={() => updateForm({ totalDays: Math.min(60, Number(form.totalDays) + 1) })}
              className="w-9 h-9 rounded-full bg-slate-600 text-white text-lg font-bold hover:bg-slate-500 transition-colors"
            >
              +
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-500 text-center">
            Door to door — travel days included.
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">Who&apos;s going</p>
          <div className="flex flex-wrap gap-2">
            {TRAVELLER_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => updateForm({ travellerType: t.value })}
                className={chipClass(form.travellerType === t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onSubmit}
          className="w-full bg-teal text-slate-900 rounded-lg px-6 py-3 font-bold text-sm hover:opacity-90 transition-opacity"
        >
          Build my trip
        </button>
        <p className="text-xs text-slate-500 text-center">
          Relaxed pace, sensible defaults. Two taps to make it yours once you can see it.
        </p>
      </div>
    </div>
  );
}

// ── Results: trip at a glance ───────────────────────────────────────────────

function TripAtAGlance({ trip, routeAlternatives, onChangeRoute, onOpenNightsSheet, addableOptionals, onOpenOptionalSheet }) {
  const { nodes, edges } = tripAtGlanceSegments(trip);
  if (nodes.length === 0) return null;

  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-300">Your trip at a glance</h2>
      <div>
        {nodes.map((node, i) => (
          <div key={`${node.placeId}-${i}`}>
            {i > 0 && (
              <div className="flex items-center gap-2 pl-1 py-1">
                <span className="text-teal text-base leading-none">↓</span>
                <span className="text-xs text-slate-500">{edgeLabel(edges[i - 1] ?? [])}</span>
              </div>
            )}
            <div className="flex items-baseline gap-2">
              <span className="text-base font-semibold text-white">{placeName(node.placeId)}</span>
              {node.routeStop ? (
                <button
                  type="button"
                  onClick={() => onOpenNightsSheet(node)}
                  className="text-sm px-2.5 py-0.5 rounded-full border border-teal/40 bg-teal/10 text-teal hover:bg-teal/20 font-medium transition-colors"
                >
                  {nightsLabel(node.nights)}
                </button>
              ) : (
                <span className="text-sm text-slate-400">{nightsLabel(node.nights)}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {addableOptionals?.length > 0 && (
        <div className="pt-3 border-t border-slate-700 space-y-2">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">+ Add a place</p>
          {addableOptionals.map((opt) => (
            <button
              key={opt.optionalId}
              type="button"
              onClick={() => onOpenOptionalSheet(opt)}
              className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-slate-900/60 border border-slate-700 hover:border-slate-500 text-left transition-colors"
            >
              <span className="text-sm font-medium text-white">{opt.label}</span>
              <span className="text-xs text-slate-500 shrink-0">Add</span>
            </button>
          ))}
        </div>
      )}

      {routeAlternatives?.length > 0 && (
        <div className="pt-3 border-t border-slate-700 space-y-2">
          <p className="text-xs font-medium text-slate-400">Another way to do this trip</p>
          {routeAlternatives.map((alt) => {
            const { name, stops, stopCount } = routeLabel(alt);
            return (
              <button
                key={alt.routePackageId}
                type="button"
                onClick={() => onChangeRoute(alt.routePackageId)}
                className="w-full text-left px-3 py-2 rounded-lg border border-slate-600 bg-slate-700 hover:bg-slate-600 transition-colors space-y-0.5"
              >
                <span className="block text-sm font-medium text-white">
                  {name} · {stopCount} stops
                </span>
                <span className="block text-xs text-slate-400">{stops}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Results: day view ───────────────────────────────────────────────────────

function ActivityLine({ block, onSwap }) {
  const a = block.activity;
  return (
    <div className="space-y-1">
      <p className="font-medium text-white text-sm">{a.title}</p>
      <p className="text-sm text-slate-400">{a.summary}</p>
      {a.foodNote && <p className="text-sm text-slate-500">{a.foodNote}</p>}
      <button
        type="button"
        onClick={() => onSwap(block.id)}
        className="text-xs text-teal hover:opacity-80 font-medium transition-opacity"
      >
        Swap
      </button>
    </div>
  );
}

function BlockRow({ block, dayNumber, onSwap, blockError }) {
  const isGap = !!block.gap;
  const isActivity = block.type === "activity" && !isGap;
  const isTravel = block.type === "travel";

  return (
    <li className="py-3.5 border-b border-slate-700/70 last:border-0">
      <div className="flex items-start gap-3">
        <span className="font-mono text-xs text-slate-500 w-11 shrink-0 mt-0.5">
          {block.startTime}
        </span>
        <div className="flex-1 min-w-0">
          {isTravel && block.transport && (
            <p className="text-sm text-slate-300">
              <span className="capitalize">{modeLabel(block.transport.mode)}</span>
              {" · "}
              {placeName(block.transport.fromPlaceId)} → {placeName(block.transport.toPlaceId)}
              {" · arrive "}
              {block.transport.arriveTime}
              {block.transport.arriveDayNumber && block.transport.arriveDayNumber !== dayNumber && (
                <span className="text-slate-500"> (day {block.transport.arriveDayNumber})</span>
              )}
              {block.transport.overnight && (
                <span className="text-slate-500"> · overnight</span>
              )}
            </p>
          )}

          {isActivity && <ActivityLine block={block} onSwap={onSwap} />}

          {isGap && (
            <p className="text-sm text-amber-400">
              Nothing curated for this slot yet in {placeName(block.placeId)}.
            </p>
          )}

          {!isTravel && !isActivity && !isGap && (
            <p className="text-sm text-slate-300">
              {block.type === "arrive" ? "Arrive in " : "Free time in "}
              {placeName(block.placeId)}
            </p>
          )}

          {blockError && <p className="text-xs text-rose-400 mt-1">{blockError}</p>}
        </div>
      </div>
    </li>
  );
}

function DayMenu({ day, menuState, onSwapActivity, onMakeLighter, onSwapWithAnotherDay, onKeep }) {
  if (menuState?.dayNumber !== day.dayNumber) return null;
  const hasActivity = day.blocks.some((b) => b.type === "activity");
  return (
    <div className="absolute right-5 top-11 z-10 w-56 rounded-lg bg-slate-900 border border-slate-600 shadow-xl overflow-hidden">
      {hasActivity && (
        <button
          type="button"
          onClick={() => onSwapActivity(day)}
          className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-slate-800 border-b border-slate-700 transition-colors"
        >
          Swap activity
        </button>
      )}
      <button
        type="button"
        onClick={() => onMakeLighter(day.dayNumber)}
        className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-slate-800 border-b border-slate-700 transition-colors"
      >
        Make lighter
      </button>
      {menuState.candidates.length > 0 && (
        <button
          type="button"
          onClick={() => onSwapWithAnotherDay(day.dayNumber, menuState.candidates)}
          className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-slate-800 border-b border-slate-700 transition-colors"
        >
          Swap with another day
        </button>
      )}
      <button
        type="button"
        onClick={onKeep}
        className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:bg-slate-800 transition-colors"
      >
        Keep this
      </button>
    </div>
  );
}

function DayView({ day, notice, dayError, onMakeLighter, onSwap, blockErrors, menuState, onToggleMenu, onSwapWithAnotherDay }) {
  return (
    <div className="relative rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700">
        <span className="font-semibold text-white">Day {day.dayNumber}</span>
        <button
          type="button"
          onClick={() => onToggleMenu(day.dayNumber)}
          aria-label={`Day ${day.dayNumber} options`}
          className="text-slate-400 hover:text-white text-lg leading-none px-1.5 py-0.5 rounded transition-colors"
        >
          ⋯
        </button>
      </div>
      <DayMenu
        day={day}
        menuState={menuState}
        onSwapActivity={(d) => onSwap(d.blocks.find((b) => b.type === "activity")?.id)}
        onMakeLighter={onMakeLighter}
        onSwapWithAnotherDay={onSwapWithAnotherDay}
        onKeep={() => onToggleMenu(null)}
      />
      {(notice || dayError) && (
        <p className={`px-5 pt-3 text-xs ${dayError ? "text-rose-400" : "text-slate-500"}`}>
          {dayError || notice}
        </p>
      )}
      <ul className="px-5">
        {day.blocks.map((block) => (
          <BlockRow
            key={block.id}
            block={block}
            dayNumber={day.dayNumber}
            onSwap={onSwap}
            blockError={blockErrors[block.id]}
          />
        ))}
      </ul>
    </div>
  );
}

function PlaceSection({ placeId, nights, days, dayNotices, dayErrors, blockErrors, onMakeLighter, onSwap, menuState, onToggleMenu, onSwapWithAnotherDay }) {
  return (
    <div className="space-y-3">
      {placeId && (
        <h3 className="text-sm font-semibold text-teal uppercase tracking-wide px-1">
          {placeName(placeId)} · {nightsLabel(nights)}
        </h3>
      )}
      <div className="space-y-3">
        {days.map((day) => (
          <DayView
            key={day.id}
            day={day}
            notice={dayNotices[day.dayNumber]}
            dayError={dayErrors[day.dayNumber]}
            blockErrors={blockErrors}
            onMakeLighter={onMakeLighter}
            onSwap={onSwap}
            menuState={menuState}
            onToggleMenu={onToggleMenu}
            onSwapWithAnotherDay={onSwapWithAnotherDay}
          />
        ))}
      </div>
    </div>
  );
}

// ── Results: structural edit sheet (nights chips → preview → apply) ────────

function ProposalCard({ trip, proposal, onUse, onKeep }) {
  const rp = trip.routePlan;
  const stopKeys = [...new Set([...(rp?.stops ?? []).map((s) => s.key), ...(proposal.routePlan?.stops ?? []).map((s) => s.key)])];
  const beforeByKey = new Map((rp?.stops ?? []).map((s) => [s.key, s]));
  const afterByKey = new Map((proposal.routePlan?.stops ?? []).map((s) => [s.key, s]));
  const rows = stopKeys
    .map((key) => {
      const before = beforeByKey.get(key);
      const after = afterByKey.get(key);
      const nightsAfter = after?.nights ?? 0;
      const nightsBefore = before?.nights ?? 0;
      return { key, placeId: (after ?? before)?.placeId, nightsBefore, nightsAfter };
    })
    .filter((r) => r.nightsBefore > 0 || r.nightsAfter > 0);

  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-white">{proposal.label}</span>
        {proposal.diff.contentGaps === 0 ? (
          <span className="text-xs font-medium text-emerald-400">No gaps</span>
        ) : (
          <span className="text-xs font-medium text-amber-400">
            {proposal.diff.contentGaps} spot{proposal.diff.contentGaps === 1 ? "" : "s"} still open
          </span>
        )}
      </div>

      <div className="flex gap-3">
        <div className="flex-1 rounded-lg bg-slate-900/60 border border-slate-700 p-3 space-y-1">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Before</p>
          {rows.map((r) => (
            <p key={`b-${r.key}`} className="text-xs text-slate-300">
              {placeName(r.placeId)} <span className="text-slate-500">· {nightsLabel(r.nightsBefore)}</span>
            </p>
          ))}
        </div>
        <span className="self-center text-teal text-sm">→</span>
        <div className="flex-1 rounded-lg bg-slate-900/60 border border-teal/30 p-3 space-y-1">
          <p className="text-[10px] font-semibold text-teal uppercase tracking-wide">After</p>
          {rows.map((r) => (
            <p key={`a-${r.key}`} className="text-xs text-slate-300">
              {placeName(r.placeId)}{" "}
              <span className={r.nightsAfter !== r.nightsBefore ? "text-teal" : "text-slate-500"}>
                · {nightsLabel(r.nightsAfter)}
              </span>
            </p>
          ))}
        </div>
      </div>

      <p className="text-sm text-slate-300 leading-relaxed">{summarizeDiff(proposal.diff)}</p>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onUse(proposal)}
          className="flex-1 bg-teal text-slate-900 rounded-lg px-4 py-2.5 font-bold text-sm hover:opacity-90 transition-opacity"
        >
          Use this plan
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="flex-1 bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-2.5 font-semibold text-sm hover:bg-slate-600 transition-colors"
        >
          Keep my trip
        </button>
      </div>
    </div>
  );
}

function StructureSheet({ sheet, trip, onMoreTime, onLessTime, onRemoveOptional, onAddOptional, onMoveOptional, onPickMove, onBackToMove, onUseProposal, onClose }) {
  if (!sheet) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-t-2xl bg-slate-900 border-t border-slate-700 p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            {sheet.stage === "nights"
              ? `${placeName(sheet.placeId)} · ${nightsLabel(sheet.nights)}`
              : sheet.stage === "optional"
                ? sheet.label
                : sheet.stage === "move"
                  ? `Move ${sheet.optionalLabel}`
                  : "How this would look"}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">
            ×
          </button>
        </div>

        {sheet.stage === "nights" && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => onMoreTime(sheet.stopKey)}
              className="w-full bg-teal text-slate-900 rounded-lg px-6 py-3 font-bold text-sm hover:opacity-90 transition-opacity"
            >
              More time here (+1 night)
            </button>
            <button
              type="button"
              onClick={() => onLessTime(sheet.stopKey)}
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-6 py-3 font-semibold text-sm hover:bg-slate-700 transition-colors"
            >
              Less time here (−1 night)
            </button>
            {sheet.optionalId && (
              <button
                type="button"
                onClick={() => onMoveOptional(sheet.optionalId)}
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-6 py-3 font-semibold text-sm hover:bg-slate-700 transition-colors"
              >
                Move to a different point in your trip
              </button>
            )}
            {sheet.optionalId && (
              <button
                type="button"
                onClick={() => onRemoveOptional(sheet.optionalId)}
                className="w-full bg-slate-800 border border-rose-700/40 text-rose-400 rounded-lg px-6 py-3 font-semibold text-sm hover:bg-rose-950/30 transition-colors"
              >
                Remove {sheet.optionalLabel} from your trip
              </button>
            )}
          </div>
        )}

        {sheet.stage === "optional" && (
          <div className="space-y-4">
            {sheet.pitch && <p className="text-sm text-slate-300 leading-relaxed">{sheet.pitch}</p>}
            <button
              type="button"
              onClick={() => onAddOptional(sheet.optionalId)}
              className="w-full bg-teal text-slate-900 rounded-lg px-6 py-3 font-bold text-sm hover:opacity-90 transition-opacity"
            >
              Add {sheet.label}
            </button>
          </div>
        )}

        {sheet.stage === "move" && (
          <div className="space-y-3">
            {sheet.current && (
              <div className="rounded-lg bg-slate-800 border border-slate-700 p-3">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Where it is now</p>
                <p className="text-sm text-white">{sheet.current.after ? `After ${placeName(sheet.current.after)}` : sheet.optionalLabel}</p>
              </div>
            )}
            {sheet.options.length === 0 ? (
              <div className="rounded-lg bg-slate-800 border border-slate-700 p-4 space-y-1">
                <p className="text-sm font-semibold text-white">There&apos;s nowhere else to move it yet on this trip</p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {sheet.optionalLabel} only fits at one point in this route right now, so we&apos;ve left it where it is.
                </p>
              </div>
            ) : (
              sheet.options.map((o) => (
                <button
                  key={o.positionId}
                  type="button"
                  onClick={() => onPickMove(o.proposal)}
                  className="w-full text-left bg-slate-800 border border-slate-600 text-white rounded-lg px-4 py-3 font-semibold text-sm hover:bg-slate-700 transition-colors"
                >
                  {o.after ? `After ${placeName(o.after)}` : o.positionId}
                </button>
              ))
            )}
          </div>
        )}

        {sheet.stage === "move_confirm" && (
          <ProposalCard trip={trip} proposal={sheet.proposal} onUse={onUseProposal} onKeep={onBackToMove} />
        )}

        {sheet.stage === "refusal" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">{sheet.message}</p>
            {sheet.alternatives?.map((alt) => (
              <ProposalCard key={alt.id} trip={trip} proposal={alt} onUse={onUseProposal} onKeep={onClose} />
            ))}
          </div>
        )}

        {sheet.stage === "proposals" && (
          <div className="space-y-4">
            {sheet.proposals.map((p) => (
              <ProposalCard key={p.id} trip={trip} proposal={p} onUse={onUseProposal} onKeep={onClose} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SwapDayPicker({ picker, onConfirm, onClose }) {
  if (!picker) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-t-2xl bg-slate-900 border-t border-slate-700 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Swap Day {picker.dayNumber} with…</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">
            ×
          </button>
        </div>
        {picker.error && <p className="text-xs text-rose-400">{picker.error}</p>}
        <div className="flex flex-wrap gap-2">
          {picker.candidates.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onConfirm(n)}
              className="px-4 py-2 rounded-full bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white text-sm font-medium transition-colors"
            >
              Day {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Results: refine sheet ───────────────────────────────────────────────────

function RefineSheet({ open, onClose, form, toggleInterest, setPace, requiredPlaces, toggleRequired, onApply }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-t-2xl bg-slate-800 border-t border-slate-700 p-6 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Make it yours</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">What you&apos;re here for</p>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((interest) => (
              <button
                key={interest}
                type="button"
                onClick={() => toggleInterest(interest)}
                className={chipClass(form.interests.includes(interest))}
              >
                {interest}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">Pace</p>
          <div className="flex flex-wrap gap-2">
            {PACES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPace(p.value)}
                className={chipClass(form.pace === p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {requiredPlaces.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-400 mb-2">Must include</p>
            <div className="flex flex-wrap gap-2">
              {requiredPlaces.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleRequired(p.id)}
                  className={chipClass(form.required.includes(p.id))}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onApply}
          className="w-full bg-teal text-slate-900 rounded-lg px-6 py-3 font-bold text-sm hover:opacity-90 transition-opacity"
        >
          Apply and rebuild
        </button>
      </div>
    </div>
  );
}

// ── Results: failure panel ──────────────────────────────────────────────────

function FailurePanel({ result, thrown, onExtend, onRemovePlace }) {
  if (thrown) {
    return (
      <div className="rounded-xl bg-red-950/60 border border-red-700/50 p-5 space-y-2">
        <h3 className="font-semibold text-red-300">Something went wrong</h3>
        <p className="text-sm font-mono text-red-400 break-words">{thrown}</p>
        <p className="text-xs text-red-500">
          This is a data-integrity signal, not a normal failure state.
        </p>
      </div>
    );
  }

  if (!result || result.ok !== false) return null;

  return (
    <div className="rounded-xl bg-slate-800 border border-orange-700/50 p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-orange-300 mb-1">
          This trip can&apos;t be built yet
        </h3>
        <p className="text-sm text-slate-300">{result.message}</p>
      </div>

      {result.options?.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Options
          </p>
          {result.options.map((opt, i) => {
            if (opt.action === "extend") {
              return (
                <div key={i} className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => onExtend(opt.days)}
                    className="shrink-0 text-sm px-3 py-1.5 rounded-lg bg-orange-700 text-white hover:bg-orange-600 font-medium transition-colors"
                  >
                    Add {opt.days} day{opt.days !== 1 ? "s" : ""}
                  </button>
                  <span className="text-sm text-slate-400 pt-1">{opt.detail}</span>
                </div>
              );
            }
            if (opt.action === "remove_place") {
              return (
                <div key={i} className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => onRemovePlace(opt.placeId)}
                    className="shrink-0 text-sm px-3 py-1.5 rounded-lg bg-slate-700 text-white hover:bg-slate-600 font-medium transition-colors"
                  >
                    Drop {placeName(opt.placeId)}
                  </button>
                  <span className="text-sm text-slate-400 pt-1">{opt.detail}</span>
                </div>
              );
            }
            return (
              <div key={i} className="flex items-start gap-2 text-sm text-slate-400">
                <span className="shrink-0 mt-0.5 inline-block px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 text-xs font-mono">
                  {opt.action}
                </span>
                <span>{opt.detail}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Door2Plan() {
  const location = useLocation();
  const allowed = new URLSearchParams(location.search).get("key") === "door2";

  const [step, setStep] = useState("destination"); // 'destination' | 'basics'
  const [destQuery, setDestQuery] = useState("");
  const [form, setForm] = useState(DEFAULT_FORM);
  const [tripResult, setTripResult] = useState(null);
  const [editTrip, setEditTrip] = useState(null);
  const [editError, setEditError] = useState(null);
  const [blockErrors, setBlockErrors] = useState({});
  const [dayErrors, setDayErrors] = useState({});
  const [dayNotices, setDayNotices] = useState({});
  const [saveMsg, setSaveMsg] = useState(null);
  const [routeAlternatives, setRouteAlternatives] = useState([]);
  const [currentSpec, setCurrentSpec] = useState(null);
  const [showRefine, setShowRefine] = useState(false);
  const [structureSheet, setStructureSheet] = useState(null);
  const [dayMenu, setDayMenu] = useState(null);
  const [swapPicker, setSwapPicker] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  if (!allowed) return <PageNotFound />;

  const requiredPlaces = requiredPlacesForDestination(form.destination);

  const activeTrip = (() => {
    if (editTrip) return editTrip;
    if (tripResult?.result && tripResult.result.ok !== false) return tripResult.result;
    return null;
  })();

  const showResults = tripResult !== null;
  const isFailure =
    showResults &&
    (tripResult.thrown || (tripResult.result && tripResult.result.ok === false));

  function showToast(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  // ── Form handlers ──────────────────────────────────────────────────────────

  function updateForm(patch) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function pickDestination(value) {
    setForm((f) => ({ ...f, destination: value, required: [] }));
    setStep("basics");
  }

  function toggleInterest(interest) {
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(interest)
        ? f.interests.filter((x) => x !== interest)
        : [...f.interests, interest],
    }));
  }

  function toggleRequired(placeId) {
    setForm((f) => ({
      ...f,
      required: f.required.includes(placeId)
        ? f.required.filter((x) => x !== placeId)
        : [...f.required, placeId],
    }));
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  function runBuildFromSpec(spec) {
    setCurrentSpec(spec);
    let result = null;
    let thrown = null;
    try {
      result = buildFilledTrip(spec, PILOT_DATA, { reviewPolicy: "allow_drafts" });
    } catch (err) {
      thrown = String(err?.message ?? err);
    }
    setTripResult({ result, thrown });
    setEditTrip(null);
    setEditError(null);
    setBlockErrors({});
    setDayErrors({});
    setDayNotices({});
    if (!thrown && result && result.ok !== false) {
      const routes = selectRoutes(spec, PILOT_DATA, { reviewPolicy: "allow_drafts" });
      setRouteAlternatives(routes.ok ? routes.value.slice(1, 3) : []);
    } else {
      setRouteAlternatives([]);
    }
  }

  function runBuild(values) {
    const [kind, id] = values.destination.split(":");
    const spec = {
      originPlaceId: "vancouver",
      destination: { kind, id },
      totalDays: Number(values.totalDays),
      travelMonth: Number(values.travelMonth),
      travellerType: values.travellerType,
      interests: values.interests,
      pace: values.pace,
      budget: "mid",
      routeTemplateId: null,
      stops: [],
      requiredPlaceIds: values.required,
      choices: { pinned: [], rejected: [], placed: [] },
    };
    runBuildFromSpec(spec);
  }

  function handleBuildFromBasics() {
    runBuild(form);
  }

  function handleStartOver() {
    setTripResult(null);
    setEditTrip(null);
    setEditError(null);
    setBlockErrors({});
    setDayErrors({});
    setDayNotices({});
    setRouteAlternatives([]);
    setCurrentSpec(null);
    setShowRefine(false);
    setStep("destination");
    setDestQuery("");
    setForm(DEFAULT_FORM);
  }

  function handleExtend(days) {
    const newForm = { ...form, totalDays: Number(form.totalDays) + days };
    setForm(newForm);
    runBuild(newForm);
  }

  function handleRemovePlace(placeId) {
    const newForm = {
      ...form,
      required: form.required.filter((x) => x !== placeId),
    };
    setForm(newForm);
    runBuild(newForm);
  }

  function handleChangeRoute(routePackageId) {
    const newSpec = { ...currentSpec, routeTemplateId: routePackageId };
    runBuildFromSpec(newSpec);
    showToast("Route changed");
  }

  function handleApplyRefine() {
    runBuild(form);
    setShowRefine(false);
  }

  function handleSaveDraft() {
    const t = activeTrip;
    if (!t) return;
    try {
      saveDraftTrip(t, autoLabel(t.spec));
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 2500);
    } catch {
      setSaveMsg("Couldn't save — storage may be full.");
      setTimeout(() => setSaveMsg(null), 4000);
    }
  }

  function handleLoadDraft(trip) {
    setTripResult({ result: trip, thrown: null });
    setEditTrip(null);
    setEditError(null);
    setBlockErrors({});
    setDayErrors({});
    setDayNotices({});
    setSaveMsg(null);
    setRouteAlternatives([]);
    setCurrentSpec(null);
    setStep("basics");
  }

  // ── Edit handlers ──────────────────────────────────────────────────────────

  function handleSwap(blockId) {
    const t = activeTrip;
    if (!t) return;
    const result = swapActivity(t, blockId);
    if (result.ok) {
      setEditTrip(result.trip);
      setBlockErrors((e) => {
        const next = { ...e };
        delete next[blockId];
        return next;
      });
      showToast("Swapped");
    } else {
      setBlockErrors((e) => ({ ...e, [blockId]: result.message }));
    }
  }

  function handleMakeLighter(dayNumber) {
    const t = activeTrip;
    if (!t) return;
    const before = t.days.find((d) => d.dayNumber === dayNumber);
    const result = makeDayLighter(t, dayNumber);
    if (!result.ok) {
      setDayErrors((e) => ({ ...e, [dayNumber]: result.message }));
      return;
    }
    const after = result.trip.days.find((d) => d.dayNumber === dayNumber);
    const unchanged = JSON.stringify(before?.blocks) === JSON.stringify(after?.blocks);
    setEditTrip(result.trip);
    setDayErrors((e) => {
      const next = { ...e };
      delete next[dayNumber];
      return next;
    });
    if (unchanged) {
      setDayNotices((n) => ({ ...n, [dayNumber]: "This day's already about as light as it gets." }));
    } else {
      setDayNotices((n) => {
        const next = { ...n };
        delete next[dayNumber];
        return next;
      });
      showToast("Day lightened");
    }
  }

  function handleUndo() {
    const t = activeTrip;
    if (!t) return;
    const r = undo(t);
    if (r.ok) {
      setEditTrip(r.trip);
      setEditError(null);
      showToast("Undone");
    } else {
      setEditError(r.message);
    }
  }

  // ── Structural edit handlers (nights chips → preview → apply) ─────────────

  function handleOpenNightsSheet(node) {
    if (!node.routeStop) return;
    const optionalId = node.routeStop.optionalId ?? null;
    setStructureSheet({
      stage: "nights",
      stopKey: node.routeStop.key,
      placeId: node.placeId,
      nights: node.nights,
      optionalId,
      optionalLabel: optionalId ? optionalLabelFor(activeTrip, optionalId) : null,
    });
  }

  function handleOpenOptionalSheet(opt) {
    setStructureSheet({ stage: "optional", optionalId: opt.optionalId, label: opt.label, pitch: opt.pitch });
  }

  function handleAddOptional(optionalId) {
    const t = activeTrip;
    if (!t) return;
    const result = previewAddOptional(t, optionalId);
    if (result.ok) {
      setStructureSheet({ stage: "proposals", proposals: result.proposals });
    } else {
      setStructureSheet({ stage: "refusal", message: result.message, alternatives: result.alternatives ?? [] });
    }
  }

  function handleRemoveOptional(optionalId) {
    const t = activeTrip;
    if (!t) return;
    const result = previewRemoveOptional(t, optionalId);
    if (result.ok) {
      setStructureSheet({ stage: "proposals", proposals: result.proposals });
    } else {
      setStructureSheet({ stage: "refusal", message: result.message, alternatives: result.alternatives ?? [] });
    }
  }

  function handleMoveOptional(optionalId) {
    const t = activeTrip;
    if (!t) return;
    const { current, options } = listMoveOptions(t, optionalId);
    setStructureSheet({ stage: "move", optionalId, optionalLabel: optionalLabelFor(t, optionalId), current, options });
  }

  function handlePickMove(proposal) {
    setStructureSheet((s) => ({ ...s, stage: "move_confirm", proposal }));
  }

  function handleBackToMove() {
    setStructureSheet((s) => ({ ...s, stage: "move", proposal: undefined }));
  }

  function handleAdjustNights(stopKey, delta) {
    const t = activeTrip;
    if (!t) return;
    const result = previewAdjustNights(t, stopKey, delta);
    if (result.ok) {
      setStructureSheet({ stage: "proposals", proposals: result.proposals, stopKey });
    } else {
      setStructureSheet({
        stage: "refusal",
        stopKey,
        message: result.message,
        alternatives: result.alternatives ?? [],
      });
    }
  }

  function handleUseProposal(proposal) {
    const t = activeTrip;
    if (!t) return;
    const result = applyProposal(t, proposal);
    if (result.ok) {
      setEditTrip(result.trip);
      setStructureSheet(null);
      setBlockErrors({});
      setDayErrors({});
      setDayNotices({});
      showToast("Trip updated");
    } else {
      setStructureSheet((s) => ({ ...s, stage: "refusal", message: result.message, alternatives: [] }));
    }
  }

  // ── Day-menu handlers (⋯ menu: swap activity, make lighter, swap days) ────

  function handleToggleDayMenu(dayNumber) {
    const t = activeTrip;
    if (dayNumber == null || !t) {
      setDayMenu(null);
      return;
    }
    setDayMenu((m) => {
      if (m?.dayNumber === dayNumber) return null;
      return { dayNumber, candidates: swappableDays(t, dayNumber) };
    });
  }

  function handleSwapWithAnotherDay(dayNumber, candidates) {
    setSwapPicker({ dayNumber, candidates, error: null });
    setDayMenu(null);
  }

  function handleConfirmSwapDay(targetDayNumber) {
    const t = activeTrip;
    if (!t || !swapPicker) return;
    const result = swapDays(t, swapPicker.dayNumber, targetDayNumber);
    if (result.ok) {
      setEditTrip(result.trip);
      setSwapPicker(null);
      showToast(`Day ${swapPicker.dayNumber} and Day ${targetDayNumber} swapped`);
    } else {
      setSwapPicker((p) => ({ ...p, error: result.message }));
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const nights = activeTrip
    ? activeTrip.spec.stops
        .filter((s) => s.nights > 0)
        .map((s) => `${placeName(s.placeId)} ${nightsLabel(s.nights)}`)
        .join(" · ")
    : "";

  const placeGroups = activeTrip ? groupDaysByPlace(activeTrip) : [];

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-4">
        {!showResults && (
          <header className="space-y-0.5">
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">WhereNova · Pilot preview</p>
          </header>
        )}

        {/* Intake wizard */}
        {!showResults && step === "destination" && (
          <DestinationStep
            query={destQuery}
            onQueryChange={setDestQuery}
            onPick={pickDestination}
            onLoad={handleLoadDraft}
          />
        )}

        {!showResults && step === "basics" && (
          <BasicsStep
            form={form}
            updateForm={updateForm}
            onBack={() => setStep("destination")}
            onSubmit={handleBuildFromBasics}
          />
        )}

        {/* Results */}
        {showResults && (
          <div className="space-y-4">
            {/* Failure panel */}
            {isFailure && (
              <>
                <FailurePanel
                  result={tripResult.result}
                  thrown={tripResult.thrown}
                  onExtend={handleExtend}
                  onRemovePlace={handleRemovePlace}
                />
                <button
                  type="button"
                  onClick={handleStartOver}
                  className="text-sm px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-colors"
                >
                  Back to form
                </button>
              </>
            )}

            {/* Trip header + itinerary */}
            {activeTrip && (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="text-lg font-bold text-white truncate">
                      {destinationLabel(form.destination)}
                    </h1>
                    <p className="text-xs text-slate-500">
                      {activeTrip.days.length} days{nights ? ` · ${nights}` : ""}
                    </p>
                    {saveMsg && <p className="text-xs text-teal mt-0.5">{saveMsg}</p>}
                    {editError && <p className="text-xs text-rose-400 mt-0.5">{editError}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowRefine(true)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-colors"
                    >
                      Refine
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      className="text-xs px-3 py-1.5 rounded-lg bg-teal text-slate-900 hover:opacity-90 font-semibold transition-opacity"
                    >
                      Save
                    </button>
                  </div>
                </div>

                {activeTrip.status === "incomplete" && (
                  <p className="text-xs text-amber-400">Some days still need attention below.</p>
                )}

                <TripAtAGlance
                  trip={activeTrip}
                  routeAlternatives={routeAlternatives}
                  onChangeRoute={handleChangeRoute}
                  onOpenNightsSheet={handleOpenNightsSheet}
                  addableOptionals={addableOptionalsFor(activeTrip)}
                  onOpenOptionalSheet={handleOpenOptionalSheet}
                />

                <div className="space-y-5">
                  {placeGroups.map((group, i) => (
                    <PlaceSection
                      key={`${group.placeId}-${i}`}
                      placeId={group.placeId}
                      nights={group.nights}
                      days={group.days}
                      dayNotices={dayNotices}
                      dayErrors={dayErrors}
                      blockErrors={blockErrors}
                      onMakeLighter={handleMakeLighter}
                      onSwap={handleSwap}
                      menuState={dayMenu}
                      onToggleMenu={handleToggleDayMenu}
                      onSwapWithAnotherDay={handleSwapWithAnotherDay}
                    />
                  ))}
                </div>

                {activeTrip.history?.length > 0 && (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleUndo}
                      className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2"
                    >
                      Undo last change
                    </button>
                  </div>
                )}

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={handleStartOver}
                    className="text-xs text-slate-600 hover:text-slate-400 underline underline-offset-2"
                  >
                    Start a new trip
                  </button>
                </div>

                <p className="text-center text-xs text-slate-700 pt-4">
                  Draft data — pilot connections unreviewed. Not for real travellers.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <RefineSheet
        open={showRefine}
        onClose={() => setShowRefine(false)}
        form={form}
        toggleInterest={toggleInterest}
        setPace={(pace) => updateForm({ pace })}
        requiredPlaces={requiredPlaces}
        toggleRequired={toggleRequired}
        onApply={handleApplyRefine}
      />

      <StructureSheet
        sheet={structureSheet}
        trip={activeTrip}
        onMoreTime={(stopKey) => handleAdjustNights(stopKey, 1)}
        onLessTime={(stopKey) => handleAdjustNights(stopKey, -1)}
        onRemoveOptional={handleRemoveOptional}
        onAddOptional={handleAddOptional}
        onMoveOptional={handleMoveOptional}
        onPickMove={handlePickMove}
        onBackToMove={handleBackToMove}
        onUseProposal={handleUseProposal}
        onClose={() => setStructureSheet(null)}
      />

      <SwapDayPicker picker={swapPicker} onConfirm={handleConfirmSwapDay} onClose={() => setSwapPicker(null)} />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-700 border border-slate-600 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
