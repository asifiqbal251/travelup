import { useState } from "react";
import { useLocation } from "react-router-dom";
import PageNotFound from "@/lib/PageNotFound";
import {
  makeDayLighter,
  pinActivity,
  rejectActivity,
  swapActivity,
  undo,
  unpinActivity,
} from "@/lib/door2/edit";
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

const DEFAULT_FORM = {
  destination: "country:PE",
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

function blockEndTime(block) {
  const [h, m] = block.startTime.split(":").map(Number);
  const total = Math.round(h * 60 + m + block.durationHours * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(
    total % 60
  ).padStart(2, "0")}`;
}

function requiredPlacesForDestination(destinationValue) {
  if (!destinationValue || destinationValue.startsWith("place:")) return [];
  const countryId = destinationValue.split(":")[1];
  return Object.values(PILOT_PLACES).filter(
    (p) => p.countryId === countryId && p.id !== "vancouver"
  );
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

// ── Sub-components ────────────────────────────────────────────────────────────

const BLOCK_TYPE_STYLES = {
  travel: "bg-sky-900/60 text-sky-300",
  arrive: "bg-blue-900/60 text-blue-300",
  open: "bg-emerald-900/60 text-emerald-300",
  activity: "bg-violet-900/60 text-violet-300",
};

function TypeBadge({ type, isGap }) {
  if (isGap)
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-900/60 text-amber-300">
        gap
      </span>
    );
  const cls = BLOCK_TYPE_STYLES[type] ?? "bg-slate-700 text-slate-300";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide ${cls}`}
    >
      {type}
    </span>
  );
}

function ActivityDetail({ block }) {
  const a = block.activity;
  const source = block.provenance.content;
  return (
    <div className="mt-2 pl-3 border-l-2 border-violet-700/50 space-y-1 text-sm text-slate-300">
      <div>
        <span className="font-semibold text-white">{a.title}</span>
        <span className="ml-2 text-slate-400">
          {a.slot} · {a.intensity}
        </span>
        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-slate-700 text-slate-400">
          {source?.kind === "extracted" ? (
            <>
              from <em className="ml-1">{source.bundleName}</em>
            </>
          ) : (
            "pilot-written"
          )}
        </span>
      </div>
      <div>{a.summary}</div>
      {a.slot === "full" && (
        <div className="text-slate-400 space-y-0.5">
          <div>
            <span className="font-medium text-slate-300">Morning:</span> {a.morning}
          </div>
          <div>
            <span className="font-medium text-slate-300">Afternoon:</span> {a.afternoon}
          </div>
          <div>
            <span className="font-medium text-slate-300">Evening:</span> {a.evening}
          </div>
        </div>
      )}
      {a.foodNote && (
        <div className="text-slate-400">
          <span className="font-medium text-slate-300">Food:</span> {a.foodNote}
        </div>
      )}
    </div>
  );
}

function BlockRow({ block, onSwap, onReject, onPin, blockError }) {
  const [showActions, setShowActions] = useState(false);
  const isGap = !!block.gap;
  const isActivity = block.type === "activity" && !isGap;
  const isTravel = block.type === "travel";
  const hasEndTime = block.type === "open" || isActivity;

  return (
    <li className="py-3 border-b border-slate-700 last:border-0">
      <div className="flex items-start gap-3">
        <span className="font-mono text-sm text-slate-500 w-12 shrink-0 mt-0.5">
          {block.startTime}
        </span>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={block.type} isGap={isGap} />
            <span className="text-sm font-medium text-white">
              {block.note === "in_transit" ? "In transit" : placeName(block.placeId)}
            </span>
            <span className="text-xs text-slate-500">
              {block.durationHours.toFixed(1)}h
              {hasEndTime && ` · until ${blockEndTime(block)}`}
            </span>
            {!block.provenance.reviewed && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-amber-900/60 text-amber-300 font-medium">
                draft
              </span>
            )}
            {block.locked && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-indigo-900/60 text-indigo-300 font-medium">
                📌 pinned
              </span>
            )}
          </div>

          {isTravel && block.transport && (
            <div className="text-sm text-slate-400">
              <span className="capitalize">
                {block.transport.mode.replace(/_/g, " ")}
              </span>
              {" · "}
              {placeName(block.transport.fromPlaceId)} →{" "}
              {placeName(block.transport.toPlaceId)}
              {" · "}Day {block.transport.arriveDayNumber} at{" "}
              {block.transport.arriveTime}
              {block.transport.overnight && (
                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-indigo-900/60 text-indigo-300">
                  overnight
                </span>
              )}
            </div>
          )}

          {isActivity && <ActivityDetail block={block} />}

          {isGap && (
            <div className="text-sm text-amber-300 font-medium">
              No curated activity left for this slot yet
              <span className="font-normal ml-1 text-amber-400">
                ({block.gap.slot})
              </span>
            </div>
          )}

          {isActivity && (
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => setShowActions((v) => !v)}
                className="text-xs px-2 py-0.5 rounded text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showActions ? "less" : "···"}
              </button>
              {showActions && (
                <>
                  <button
                    type="button"
                    onClick={() => onSwap(block.id)}
                    className="text-xs px-2.5 py-1 rounded-md bg-violet-900/60 text-violet-300 hover:bg-violet-900 font-medium transition-colors"
                  >
                    Swap
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject(block.id)}
                    className="text-xs px-2.5 py-1 rounded-md bg-rose-900/60 text-rose-300 hover:bg-rose-900 font-medium transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => onPin(block.id, block.locked)}
                    className="text-xs px-2.5 py-1 rounded-md bg-slate-700 text-slate-300 hover:bg-slate-600 font-medium transition-colors"
                  >
                    {block.locked ? "Unpin" : "Pin"}
                  </button>
                </>
              )}
            </div>
          )}

          {blockError && (
            <p className="text-xs text-rose-400 mt-0.5">{blockError}</p>
          )}
        </div>
      </div>
    </li>
  );
}

function DayCard({ day, onMakeLighter, onSwap, onReject, onPin, blockErrors, dayError }) {
  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700">
        <span className="font-semibold text-sm text-white">Day {day.dayNumber}</span>
        <div className="flex items-center gap-3">
          {dayError && (
            <span className="text-xs text-rose-400">{dayError}</span>
          )}
          <button
            type="button"
            onClick={() => onMakeLighter(day.dayNumber)}
            className="text-xs px-2.5 py-1 rounded-md bg-slate-700 text-teal hover:bg-slate-600 font-medium transition-colors"
          >
            Make day lighter
          </button>
        </div>
      </div>
      <ul className="px-4">
        {day.blocks.map((block) => (
          <BlockRow
            key={block.id}
            block={block}
            onSwap={onSwap}
            onReject={onReject}
            onPin={onPin}
            blockError={blockErrors[block.id]}
          />
        ))}
      </ul>
    </div>
  );
}

function TripSummaryCard({ trip, editCount, editError, onUndo, onStartOver, onSave, saveMsg, routeAlternatives, onChangeRoute }) {
  const [showAlt, setShowAlt] = useState(false);

  const home = trip.days
    .flatMap((d) => d.blocks)
    .find((b) => b.id.endsWith(">origin_home"));
  const nights = trip.spec.stops
    .filter((s) => s.nights > 0)
    .map((s) => `${placeName(s.placeId)} ${s.nights}n`)
    .join(" · ");

  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="text-lg font-bold text-white">
            {trip.days.length}-day trip
          </h2>
          {home && (
            <p className="text-sm text-slate-400">
              Home: Day {home.transport.arriveDayNumber} at{" "}
              {home.transport.arriveTime}
            </p>
          )}
          {nights && <p className="text-sm font-medium text-teal">{nights}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <button
            type="button"
            onClick={onSave}
            className="text-sm px-3 py-1.5 rounded-lg bg-teal text-slate-900 hover:opacity-90 font-semibold transition-opacity"
          >
            Save
          </button>
          {saveMsg && (
            <span className="text-sm text-teal font-medium">{saveMsg}</span>
          )}
          {routeAlternatives?.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAlt((v) => !v)}
              className="text-sm px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-colors"
            >
              {showAlt ? "Hide routes" : "Change route"}
            </button>
          )}
          <button
            type="button"
            onClick={onStartOver}
            className="text-sm px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-colors"
          >
            New trip
          </button>
        </div>
      </div>

      {showAlt && routeAlternatives?.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Alternative routes
          </p>
          {routeAlternatives.map((alt) => {
            const { name, stops, stopCount } = routeLabel(alt);
            return (
              <button
                key={alt.routePackageId}
                type="button"
                onClick={() => { setShowAlt(false); onChangeRoute(alt.routePackageId); }}
                className="w-full text-left px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 transition-colors space-y-0.5"
              >
                <span className="text-sm font-medium text-white">
                  Try: {name} · {stopCount} stops
                </span>
                <span className="block text-xs text-slate-400">{stops}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <span>
          Status:{" "}
          <span
            className={
              trip.status === "incomplete"
                ? "px-1 rounded bg-amber-900/60 text-amber-300 font-medium"
                : "font-medium text-slate-300"
            }
          >
            {trip.status}
          </span>
        </span>
        <span>
          Route:{" "}
          <span className="font-medium text-slate-300">
            {trip.spec.routeTemplateId ?? "—"}
          </span>
        </span>
        {trip.warnings?.length > 0 && (
          <span>
            Warnings:{" "}
            <span className="font-medium text-amber-400">
              {trip.warnings.join(", ")}
            </span>
          </span>
        )}
        {trip.contentGaps?.length > 0 && (
          <span>
            Content gaps:{" "}
            <span className="font-medium text-amber-400">
              {trip.contentGaps.length}
            </span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1 border-t border-slate-700">
        <span className="text-xs text-slate-500">
          {editCount} edit{editCount !== 1 ? "s" : ""}
        </span>
        <button
          type="button"
          disabled={!trip.history?.length}
          onClick={onUndo}
          className="text-sm px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
        >
          Undo
        </button>
        {editError && (
          <span className="text-sm text-rose-400">{editError}</span>
        )}
      </div>
    </div>
  );
}

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

  const [form, setForm] = useState(DEFAULT_FORM);
  const [tripResult, setTripResult] = useState(null);
  const [editTrip, setEditTrip] = useState(null);
  const [editCount, setEditCount] = useState(0);
  const [editError, setEditError] = useState(null);
  const [blockErrors, setBlockErrors] = useState({});
  const [dayErrors, setDayErrors] = useState({});
  const [saveMsg, setSaveMsg] = useState(null);
  const [routeAlternatives, setRouteAlternatives] = useState([]);
  const [currentSpec, setCurrentSpec] = useState(null);

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

  // ── Form handlers ──────────────────────────────────────────────────────────

  function updateForm(patch) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function handleDestinationChange(value) {
    setForm((f) => ({ ...f, destination: value, required: [] }));
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
    setEditCount(0);
    setEditError(null);
    setBlockErrors({});
    setDayErrors({});
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

  function handleSubmit(e) {
    e.preventDefault();
    runBuild(form);
  }

  function handleStartOver() {
    setTripResult(null);
    setEditTrip(null);
    setEditCount(0);
    setEditError(null);
    setBlockErrors({});
    setDayErrors({});
    setRouteAlternatives([]);
    setCurrentSpec(null);
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
    setEditCount(0);
    setEditError(null);
    setBlockErrors({});
    setDayErrors({});
    setSaveMsg(null);
    setRouteAlternatives([]);
    setCurrentSpec(null);
  }

  // ── Edit handlers ──────────────────────────────────────────────────────────

  function applyBlockEdit(fn, blockId) {
    const t = activeTrip;
    if (!t) return;
    const result = fn(t);
    if (result.ok) {
      setEditTrip(result.trip);
      setEditCount((n) => n + 1);
      setBlockErrors((e) => {
        const next = { ...e };
        delete next[blockId];
        return next;
      });
    } else {
      setBlockErrors((e) => ({ ...e, [blockId]: result.message }));
    }
  }

  function applyDayEdit(fn, dayNumber) {
    const t = activeTrip;
    if (!t) return;
    const result = fn(t);
    if (result.ok) {
      setEditTrip(result.trip);
      setEditCount((n) => n + 1);
      setDayErrors((e) => {
        const next = { ...e };
        delete next[dayNumber];
        return next;
      });
    } else {
      setDayErrors((e) => ({ ...e, [dayNumber]: result.message }));
    }
  }

  function handleUndo() {
    const t = activeTrip;
    if (!t) return;
    const r = undo(t);
    if (r.ok) {
      setEditTrip(r.trip);
      setEditCount((n) => Math.max(0, n - 1));
      setEditError(null);
    } else {
      setEditError(r.message);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <header className="space-y-0.5">
          <h1 className="text-2xl font-bold text-slate-900">Plan a trip</h1>
          <p className="text-sm text-slate-400">Hidden preview · pilot catalogue only</p>
        </header>

        {/* Intake form */}
        {!showResults && (
          <>
          <SavedTripsList onLoad={handleLoadDraft} />
          <form
            onSubmit={handleSubmit}
            className="rounded-xl bg-white border border-slate-200 p-6 space-y-6"
          >
            {/* Destination */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Destination
              </label>
              <select
                value={form.destination}
                onChange={(e) => handleDestinationChange(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                {DESTINATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Total days */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Total days, door to door
              </label>
              <input
                type="number"
                min={1}
                max={60}
                required
                value={form.totalDays}
                onChange={(e) => updateForm({ totalDays: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                From when you leave home to when you&apos;re back — travel days included.
              </p>
            </div>

            {/* When */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                When
              </label>
              <select
                value={form.travelMonth}
                onChange={(e) =>
                  updateForm({ travelMonth: Number(e.target.value) })
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Traveller type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Who&apos;s going
              </label>
              <select
                value={form.travellerType}
                onChange={(e) => updateForm({ travellerType: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                {TRAVELLER_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Pace */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Pace
              </label>
              <select
                value={form.pace}
                onChange={(e) => updateForm({ pace: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                {PACES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Interests */}
            <fieldset>
              <legend className="text-sm font-medium text-slate-700 mb-2">
                Interests
              </legend>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {INTERESTS.map((interest) => (
                  <label
                    key={interest}
                    className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={form.interests.includes(interest)}
                      onChange={() => toggleInterest(interest)}
                      className="rounded border-slate-300"
                    />
                    {interest}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Required places */}
            {requiredPlaces.length > 0 && (
              <fieldset>
                <legend className="text-sm font-medium text-slate-700 mb-1.5">
                  Required places
                </legend>
                <p className="text-xs text-slate-500 mb-2">
                  Places this trip must include.
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {requiredPlaces.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={form.required.includes(p.id)}
                        onChange={() => toggleRequired(p.id)}
                        className="rounded border-slate-300"
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <button
              type="submit"
              className="w-full bg-slate-900 text-white rounded-lg px-6 py-3 font-semibold text-sm hover:bg-slate-800 transition-colors"
            >
              Plan my trip
            </button>
          </form>
          </>
        )}

        {/* Results */}
        {showResults && (
          <div className="space-y-4">
            {/* Non-dismissible draft banner */}
            <div className="rounded-lg bg-amber-400 text-amber-950 font-semibold px-4 py-3 border-2 border-amber-600 text-sm">
              DRAFT DATA — pilot connections are unreviewed. Not for real
              travellers. Edits are local to this browser tab and are not saved
              anywhere yet.
            </div>

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
                  className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium transition-colors"
                >
                  Back to intake
                </button>
              </>
            )}

            {/* Trip summary + day view */}
            {activeTrip && (
              <>
                <TripSummaryCard
                  trip={activeTrip}
                  editCount={editCount}
                  editError={editError}
                  onUndo={handleUndo}
                  onStartOver={handleStartOver}
                  onSave={handleSaveDraft}
                  saveMsg={saveMsg}
                  routeAlternatives={routeAlternatives}
                  onChangeRoute={handleChangeRoute}
                />
                {activeTrip.days.map((day) => (
                  <DayCard
                    key={day.id}
                    day={day}
                    blockErrors={blockErrors}
                    dayError={dayErrors[day.dayNumber]}
                    onMakeLighter={(dayNum) =>
                      applyDayEdit((t) => makeDayLighter(t, dayNum), dayNum)
                    }
                    onSwap={(blockId) =>
                      applyBlockEdit((t) => swapActivity(t, blockId), blockId)
                    }
                    onReject={(blockId) =>
                      applyBlockEdit(
                        (t) => rejectActivity(t, blockId),
                        blockId
                      )
                    }
                    onPin={(blockId, isLocked) =>
                      applyBlockEdit(
                        (t) =>
                          isLocked
                            ? unpinActivity(t, blockId)
                            : pinActivity(t, blockId),
                        blockId
                      )
                    }
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
