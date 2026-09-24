import { useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import PageNotFound from "@/lib/PageNotFound";
import { makeDayLighter, swapActivity, undo } from "@/lib/door2/edit";
import { PILOT_DATA, buildFilledTrip } from "@/lib/door2/planner";
import { PILOT_PLACES, PILOT_ROUTE_PACKAGES } from "@/lib/door2/pilotData";
import { selectRoutes } from "@/lib/door2/route";
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

  return { nodes: majorStops, edges };
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

function TripAtAGlance({ trip, routeAlternatives, onChangeRoute }) {
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
              <span className="text-sm text-slate-400">{nightsLabel(node.nights)}</span>
            </div>
          </div>
        ))}
      </div>

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

function DayView({ day, notice, dayError, onMakeLighter, onSwap, blockErrors }) {
  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700">
        <span className="font-semibold text-white">Day {day.dayNumber}</span>
        <button
          type="button"
          onClick={() => onMakeLighter(day.dayNumber)}
          className="text-xs text-teal hover:opacity-80 font-medium transition-opacity"
        >
          Make lighter
        </button>
      </div>
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

function PlaceSection({ placeId, nights, days, dayNotices, dayErrors, blockErrors, onMakeLighter, onSwap }) {
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
          />
        ))}
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

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-700 border border-slate-600 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
