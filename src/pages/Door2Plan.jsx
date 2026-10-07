import { buildF6Trip } from '@/lib/door2/connectionBuild';
import { newSessionId } from '@/lib/door2/sessionId';
import { connectionDisplay, editEvidenceGuard, hasEvidence, inspectEvidence, structuralEvidenceGuard } from '@/lib/door2/connectionEvidence';
import { createContext, useContext, useEffect, useRef, useState } from "react";
const EvidenceTripContext = createContext(null);
import { makeDayLighter, swapActivity, swapDays, swappableDays, undo } from "@/lib/door2/edit";
import { PILOT_DATA } from "@/lib/door2/planner";
import { PILOT_PLACES, PILOT_ROUTE_FAMILIES, PILOT_ROUTE_PACKAGES } from "@/lib/door2/pilotData";
import { backToMove, dayTripChangeLines, pickMove, positionLabel, proposalColumns } from "@/lib/door2/proposalView";
import {
  applyProposal,
  isDurationFlexible,
  listExcursionMenu,
  listMoveOptions,
  previewAddExcursion,
  previewAddOptional,
  previewAdjustNights,
  previewRemoveExcursion,
  previewRemoveOptional,
} from "@/lib/door2/restructure";
import { MONTHS } from "@/lib/options";
import {
  DraftNotStorableError,
  DraftStorageUnreadableError,
  deleteDraftTrip,
  draftDisplayLabel,
  draftStorageStatus,
  listDraftTrips,
  loadDraftTrip,
  saveDraftTrip,
} from "@/lib/door2/draftStorage";
import { buildClassicHandoff, handoffNote } from "@/lib/door2/classicHandoff";

// ── Constants ─────────────────────────────────────────────────────────────────

// A country here stands for the selected routes named beside it, never the whole
// country; `coverage` is shown with the label wherever a country can be picked.
const DESTINATIONS = [
  { value: "country:PE", label: "Peru", coverage: "Peru classic with Huaraz options" },
  { value: "country:US", label: "United States", coverage: "New York City" },
  { value: "country:JP", label: "Japan", coverage: "Tokyo with Kyoto options" },
  { value: "country:CA", label: "Canada", coverage: "Eastern Canada corridor" },
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

// The only origin this planner plans from. Stage 1 of direction B adds consent
// around it, not an origin engine.
const SUPPORTED_ORIGIN_ID = "vancouver";
const CLASSIC_PLANNER_PATH = "/find";
const FEEDBACK_HREF = "mailto:backstage.innovators@gmail.com";

// Owner-approved wording (build brief B §8, 6 Oct 2026), used verbatim. Changing
// any of it is an owner decision; tests/door2/flowBStage1.test.js asserts it as rendered.
export const APPROVED_COPY = {
  limits:
    "Plan selected routes from Vancouver: New York City, Tokyo with Kyoto options, Peru classic with Huaraz options, and the Eastern Canada corridor. Other destinations or departure cities? Use the classic planner. Trips made here are saved only in this browser; the classic planner supports account saving when you sign in.",
  departureQuestion: "Are you departing from Vancouver?",
  departureYes: "Yes, from Vancouver",
  departureNo: "No, another city",
  departureDeclined:
    "This planner currently plans from Vancouver. The classic planner doesn't ask for your departure city. Check travel to and from your destination separately.",
  beforeSave: "When you save, your trip stays in this browser on this device. These trips do not sync to your account.",
  afterSave: "Saved in this browser on this device. These trips do not sync to your account.",
  feedback: "Send feedback",
};

// Two modes for a link to the classic planner (build brief B Stage 2, revision 3):
//   "reentry" (the default) carries nothing and says so, with `reentry`;
//   "handoff" carries the basic answers in the href and says only what it carries.
// A link that is not deliberately opted into "handoff" stays honest by default.
export const CLASSIC_COPY = {
  link: "Go to the classic planner",
  reentry: "You'll need to enter your trip details again there.",
  escape: "Use the classic planner instead",
  // Added wherever a handoff follows work on a trip: the basics travel, the trip does not.
  disclosure: "Your itinerary, activities and edits won't be transferred.",
};

// Refusals this page recognises as an ordinary support or fit limit, as
// "state:reason". Anything else — invalid context, any declared phase, an authoring
// or estimation fault, a reason added later — is a fault. The broad state alone and
// the human-readable message are never used to decide.
const ORDINARY_REFUSALS = new Set([
  "destination_not_covered:not_covered",
  "destination_not_covered:country_unknown",
  "destination_not_covered:place_unknown",
  "destination_not_covered:required_place_uncovered",
  "route_not_supported:origin_unknown",
  "route_not_supported:no_package_covers_all_required",
  "route_not_supported:route_constraint_incompatible",
  "route_not_supported:too_long",
  "route_not_supported:duration_gap",
  "duration_too_short:too_short",
  "required_place_conflict:too_short",
  "connection_unreviewed:missing",
  "connection_unreviewed:unreviewed",
]);

/** "ordinary" for a recognised support or fit refusal, otherwise "fault". */
export function refusalKind(result) {
  const detail = result?.detail;
  if (!detail || detail.phase !== undefined) return "fault";
  return ORDINARY_REFUSALS.has(`${result.state}:${detail.reason}`) ? "ordinary" : "fault";
}

export const DEFAULT_FORM = {
  destination: "",
  totalDays: 10,
  travelMonth: 10,
  travellerType: "couple",
  pace: "balanced",
  interests: [],
  required: [],
};

/** The intake form that produced this trip, so Refine rebuilds the same trip.
 *  Inverse of the spec construction in runBuild. */
export function formFromSpec(spec) {
  if (!spec?.destination?.kind || !spec.destination.id) return null;
  return {
    destination: `${spec.destination.kind}:${spec.destination.id}`,
    totalDays: spec.totalDays,
    travelMonth: spec.travelMonth,
    travellerType: spec.travellerType,
    pace: spec.pace,
    interests: spec.interests ?? [],
    required: spec.requiredPlaceIds ?? [],
  };
}

// Every traveller-facing string of the day-trip picker (E3c). On screen it is a
// "day trip", never the engine's word for it. Reword here; the tests assert
// against these.
export const DAY_TRIP_COPY = {
  sectionHeading: (base) => `+ Add a day trip from ${base}`,
  addLabel: "Add",
  // hoursOnSite is time at the place, not the round trip.
  duration: (hours) => `About ${formatHours(hours)} hours there, plus travel`,
  nothingAdded: "Nothing is added until you choose it.",
  previewAddTitle: (place) => `Add a day trip to ${place}`,
  previewRemoveTitle: (place) => `Remove the day trip to ${place}`,
  keptItemsMoved: (list) => `${list} moved to make room.`,
  glanceRow: (place) => `Day trip: ${place}`,
  removeLabel: "Remove",
  keepMyTrip: "Keep my trip",
  previewLabel: "Preview",
  refusalOneMoreNight: (place, base) => `${place} needs one more night in ${base} to fit.`,
  refusalMoreNights: (place, base, n) => `${place} needs ${n} more nights in ${base} to fit.`,
  refusalExtendRow: (place, base, n) =>
    n === 1 ? `Add a night in ${base} and include ${place}` : `Add ${n} nights in ${base} and include ${place}`,
  refusalFullDay: (place) => `${place} needs a full day, and this trip doesn't have one to give.`,
  refusalDatesFixed: (place, base) => `${place} needs more time in ${base}, and your dates are fixed.`,
  refusalNotAvailable: (place) => `${place} isn't available as a day trip yet.`,
  refusalFallback: (place) => `${place} doesn't fit this trip right now.`,
  removeUnavailable: (place) => `Your day trip to ${place} can't be removed right now.`,
};

// Confirms before a rebuild that would throw away the traveller's work. Day trips
// are mentioned only when the trip has some; otherwise the edits-only wording.
export const DISCARD_COPY = {
  keepMyTrip: "Keep my trip",
  routeSwitch: {
    confirm: "Switch route",
    edits: {
      title: "Switch to this route?",
      body: "Switching routes starts this trip over, so the changes you've made will be lost.",
    },
    dayTrips: {
      title: "Switch to a different route",
      body: "This will replace your trip, and your day trips won't carry over.",
    },
  },
  refine: {
    confirm: "Rebuild",
    edits: { title: "Refine your trip", body: "Refining rebuilds it from scratch. You'll lose your edits." },
    dayTrips: { title: "Refine your trip", body: "Refining rebuilds it from scratch. You'll lose your edits and day trips." },
  },
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

/** The destination's display name for a spec — the first part of autoLabel, and the
 * draft's destinationLabel. */
function destinationLabelFor(spec) {
  return spec.destination?.kind === "place"
    ? (PILOT_PLACES[spec.destination.id]?.name ?? spec.destination.id)
    : (DESTINATIONS.find((d) => d.value === `country:${spec.destination?.id}`)?.label ?? spec.destination?.id ?? "Trip");
}

function autoLabel(spec) {
  const destLabel = destinationLabelFor(spec);
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

function hasDayTrips(trip) {
  return (trip?.routePlan?.stops || []).some((s) => s.selectedExcursionIds?.length > 0);
}

// true when the traveller has work that a rebuild would throw away
export function hasTravellerWork(trip) {
  if (trip?.history?.length > 0) return true;
  return hasDayTrips(trip);
}

/** 4 → "4", 4.5 → "4.5": whole numbers stay whole, anything else gets one decimal. */
function formatHours(hours) {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/** Every stop whose day-trip menu has at least one item, in route order. Driven
 * entirely by listExcursionMenu: no stop is named here. */
function dayTripMenusFor(trip) {
  if (!trip?.routePlan) return [];
  return trip.routePlan.stops
    .map((s) => ({ stopKey: s.key, placeId: s.placeId, items: listExcursionMenu(trip, s.key) }))
    .filter((m) => m.items.length > 0);
}

/**
 * Traveller-facing copy for a day trip that can't be added as asked. Never shows
 * the engine's own message; anything it can't classify (including a preview that
 * threw, passed as null) gets the place-specific fallback.
 * @returns {{message: string, alternative: {label: string, proposal: Object} | null}}
 */
export function dayTripRefusalView(result, { place, base, stop, spec }) {
  const C = DAY_TRIP_COPY;
  const only = (message) => ({ message, alternative: null });
  if (!result || result.ok !== false) return only(C.refusalFallback(place));
  if (result.why === "not_available") return only(C.refusalNotAvailable(place));
  if (result.why !== "excursion_does_not_fit" || !result.detail) return only(C.refusalFallback(place));
  const needed = result.detail.nightsNeeded;
  if (needed == null || needed > stop.maxNights) return only(C.refusalFullDay(place));
  if (!isDurationFlexible(spec)) return only(C.refusalDatesFixed(place, base));
  const extra = needed - stop.nights;
  if (!(extra >= 1)) return only(C.refusalFallback(place));
  const proposal = result.alternatives?.[0] ?? null;
  return {
    message: extra === 1 ? C.refusalOneMoreNight(place, base) : C.refusalMoreNights(place, base, extra),
    alternative: proposal ? { label: C.refusalExtendRow(place, base, extra), proposal } : null,
  };
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

// ── Stage 1: classic planner link, departure confirmation ───────────────────

/**
 * `mode` is "reentry" unless a caller opts in. In "handoff" the href carries `payload`
 * (see classicHandoff.js) and the sentence names only what the href carries; with
 * `followsTrip` it also says the itinerary and its edits are not part of that.
 */
function ClassicPlannerLink({ label = CLASSIC_COPY.link, mode = "reentry", payload = null, followsTrip = false }) {
  const handoff = mode === "handoff" ? buildClassicHandoff(payload ?? {}) : null;
  const note = handoff ? handoffNote(handoff.carried) : "";
  return (
    <p className="text-sm text-slate-400">
      <a href={handoff ? handoff.href : CLASSIC_PLANNER_PATH} className="text-teal font-medium underline underline-offset-2 hover:opacity-80">
        {label}
      </a>
      {handoff ? (
        <>
          {note && <>{" "}<span>{note}</span></>}
          {followsTrip && <>{" "}<span>{CLASSIC_COPY.disclosure}</span></>}
        </>
      ) : (
        <>{" "}<span>{CLASSIC_COPY.reentry}</span></>
      )}
    </p>
  );
}

/** The basic answers of a request, in the shape the handoff reads. */
function handoffBasics(source) {
  return {
    destination: source.destination,
    totalDays: source.totalDays,
    travelMonth: source.travelMonth,
    travellerType: source.travellerType,
  };
}

/** The basics of a spec that was actually attempted (a build or a rebuild). */
function specBasics(spec) {
  if (!spec?.destination?.kind || !spec.destination.id) return null;
  return handoffBasics({ ...spec, destination: `${spec.destination.kind}:${spec.destination.id}` });
}

/** `payload` null keeps the link in "reentry" mode: this limit then carries nothing. */
function DepartureLimit({ payload = null, followsTrip = false }) {
  return (
    <div role="status" className="space-y-1">
      <p className="text-sm text-amber-300">{APPROVED_COPY.departureDeclined}</p>
      <ClassicPlannerLink mode={payload ? "handoff" : "reentry"} payload={payload} followsTrip={followsTrip} />
    </div>
  );
}

/** The question and its two answers. `answer` is null until the traveller picks one. */
function DepartureQuestion({ answer, onAnswer, nudge = false, payload = null, followsTrip = false }) {
  return (
    <div className="space-y-2">
      <p
        role={nudge ? "alert" : undefined}
        className={`text-xs font-medium ${nudge ? "text-amber-300" : "text-slate-400"}`}
      >
        {APPROVED_COPY.departureQuestion}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={answer === "confirmed"}
          onClick={() => onAnswer("confirmed")}
          className={chipClass(answer === "confirmed")}
        >
          {APPROVED_COPY.departureYes}
        </button>
        <button
          type="button"
          aria-pressed={answer === "declined"}
          onClick={() => onAnswer("declined")}
          className={chipClass(answer === "declined")}
        >
          {APPROVED_COPY.departureNo}
        </button>
      </div>
      {answer === "declined" && <DepartureLimit payload={payload} followsTrip={followsTrip} />}
    </div>
  );
}

/** Asked when a rebuild is attempted outside the Basics step. A trip recorded from
 * another origin gets the limit only: answering could not make it a Vancouver trip. */
function DeparturePrompt({ prompt, answer, originUnsupported, onAnswer, onClose, fallbackFocusRef, payload }) {
  if (!prompt) return null;
  return (
    <DeparturePromptDialog
      answer={answer}
      originUnsupported={originUnsupported}
      onAnswer={onAnswer}
      onClose={onClose}
      fallbackFocusRef={fallbackFocusRef}
      payload={payload}
    />
  );
}

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The modal itself. Local focus management, because the page's sheets are plain
 * overlays and share no dialog component: focus moves in on open, Tab and Shift+Tab
 * cycle inside, Escape closes, and on close focus goes back to where the traveller
 * was. After "Yes" the question is gone and the tapped action has resumed, so focus
 * goes into whatever it opened instead (the topmost sheet, else the page itself). */
function DeparturePromptDialog({ answer, originUnsupported, onAnswer, onClose, fallbackFocusRef, payload = null }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const resumedRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const focusables = () => [...dialog.querySelectorAll(FOCUSABLE)];
    const [first] = focusables();
    // The answer buttons come after "Close"; start on the question, not the dismissal.
    (focusables().find((el) => el.getAttribute("aria-label") !== "Close") ?? first ?? dialog).focus();

    function onKeyDown(e) {
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); dialog.focus(); return; }
      const [head] = items;
      const tail = items[items.length - 1];
      const inside = dialog.contains(document.activeElement);
      if (!inside || (e.shiftKey && document.activeElement === head) || (!e.shiftKey && document.activeElement === tail)) {
        e.preventDefault();
        (e.shiftKey ? tail : head).focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (resumedRef.current) {
        const sheets = document.querySelectorAll("div.fixed.inset-0.z-50");
        const sheet = sheets[sheets.length - 1];
        const target = (sheet && sheet.querySelector(FOCUSABLE)) ?? fallbackFocusRef?.current;
        target?.focus();
      } else if (opener?.isConnected) {
        opener.focus();
      } else {
        fallbackFocusRef?.current?.focus();
      }
    };
  }, []);

  function answerAndRemember(next) {
    if (next === "confirmed") resumedRef.current = true;
    onAnswer(next);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={APPROVED_COPY.departureQuestion}
        tabIndex={-1}
        className="w-full max-w-2xl rounded-t-2xl bg-slate-900 border-t border-slate-700 p-6 space-y-4 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end">
          <button type="button" aria-label="Close" onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">
            ×
          </button>
        </div>
        {/* E4a and E4b: this dialog only opens over a trip, so the basics may travel and the trip may not. */}
        {originUnsupported
          ? <DepartureLimit payload={payload} followsTrip />
          : <DepartureQuestion answer={answer} onAnswer={answerAndRemember} payload={payload} followsTrip />}
      </div>
    </div>
  );
}

// ── Saved trips ──────────────────────────────────────────────────────────────

function SavedTripsList({ onLoad }) {
  const [drafts, setDrafts] = useState(() => listDraftTrips());
  const [unreadable] = useState(() => draftStorageStatus() === "unreadable");
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

  if (unreadable) {
    return (
      <div className="rounded-xl bg-slate-800 border border-slate-700 p-5 space-y-1">
        <h2 className="text-sm font-semibold text-slate-300">My saved trips</h2>
        <p className="text-xs text-rose-400">Saved trips couldn't be read from this browser's storage.</p>
      </div>
    );
  }

  if (drafts.length === 0) return null;

  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-slate-300">My saved trips</h2>
      <ul className="space-y-2">
        {drafts.map((d) => (
          <li key={d.id} className="flex items-start gap-3 py-2 border-b border-slate-700 last:border-0">
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-white truncate">{draftDisplayLabel(d)}</p>
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
          <p className="text-sm text-slate-500">Early-access catalogue · a handful of places, built properly.</p>
        </div>
        <div className="rounded-lg bg-slate-900/60 border border-slate-700 p-4 space-y-2">
          <p className="text-sm text-slate-300 leading-relaxed">{APPROVED_COPY.limits}</p>
          {/* E1: carries whatever is in the search box, and nothing at all when it is empty. */}
          <ClassicPlannerLink mode="handoff" payload={{ queryText: query }} />
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
              <>
                <p className="text-sm text-slate-500">No matches in the early-access catalogue yet.</p>
                {/* E2: carries the text the traveller typed. */}
                <ClassicPlannerLink mode="handoff" payload={{ queryText: query }} />
              </>
            )}
            {results.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => onPick(d.value)}
                className="w-full text-left px-4 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white text-sm font-medium transition-colors"
              >
                <span>{d.label}</span>
                {d.coverage && <span className="font-normal text-slate-400"> · {d.coverage}</span>}
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
                  <span>{d.label}</span>
                  <span className="font-normal text-slate-400"> · {d.coverage}</span>
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

function BasicsStep({ form, updateForm, onBack, onSubmit, departure, onDeparture, departureNudge }) {
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

        <DepartureQuestion answer={departure} onAnswer={onDeparture} nudge={departureNudge} payload={handoffBasics(form)} />

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

function TripAtAGlance({ trip, routeAlternatives, onChangeRoute, onOpenNightsSheet, addableOptionals, onOpenOptionalSheet, dayTripMenus, onOpenDayTrip, onRemoveDayTrip }) {
  const { nodes, edges } = tripAtGlanceSegments(trip);
  if (nodes.length === 0) return null;
  const selectedDayTrips = (stopKey) =>
    (dayTripMenus ?? []).find((m) => m.stopKey === stopKey)?.items.filter((item) => item.selected) ?? [];

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
            {node.routeStop &&
              selectedDayTrips(node.routeStop.key).map((item) => (
                <div key={item.excursionId} className="flex items-baseline gap-2 pl-4 pt-1">
                  <span className="text-sm text-slate-300">{DAY_TRIP_COPY.glanceRow(placeName(item.placeId))}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveDayTrip(node.routeStop.key, item)}
                    className="text-xs text-teal hover:opacity-80 font-medium transition-opacity"
                  >
                    {DAY_TRIP_COPY.removeLabel}
                  </button>
                </div>
              ))}
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

      {(dayTripMenus ?? []).map((menu) => {
        const open = menu.items.filter((item) => !item.selected);
        if (open.length === 0) return null;
        return (
          <div key={menu.stopKey} className="pt-3 border-t border-slate-700 space-y-2">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              {DAY_TRIP_COPY.sectionHeading(placeName(menu.placeId))}
            </p>
            {open.map((item) => (
              <button
                key={item.excursionId}
                type="button"
                onClick={() => onOpenDayTrip(menu.stopKey, item)}
                className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-slate-900/60 border border-slate-700 hover:border-slate-500 text-left transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-white">{placeName(item.placeId)}</span>
                  <span className="block text-xs text-slate-500">{DAY_TRIP_COPY.duration(item.hoursOnSite)}</span>
                </span>
                <span className="text-xs text-slate-500 shrink-0">{DAY_TRIP_COPY.addLabel}</span>
              </button>
            ))}
            <p className="text-xs text-slate-500">{DAY_TRIP_COPY.nothingAdded}</p>
          </div>
        );
      })}

      {routeAlternatives?.length > 0 && (
        <div className="pt-3 border-t border-slate-700 space-y-2">
          <p className="text-xs font-medium text-slate-400">Another way to do this trip</p>
          {routeAlternatives.map((alt) => {
            const { name, stops, stopCount } = routeLabel(alt);
            const estimate = alt.connectionEvidence?.entries.find(entry => entry.code === 'connection_estimated');
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
                {estimate && (
                  <>
                    <span className="block text-xs text-amber-300">Estimated transport · approximate flight time</span>
                    <span className="block text-xs text-slate-400">{estimate.values.recordedText}</span>
                  </>
                )}
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
  const evidenceTrip = useContext(EvidenceTripContext);
  const display = block.type === 'travel' ? connectionDisplay(evidenceTrip, block) : { experiences: [] };
  const displayPlace = id => (!display.readOnly && evidenceTrip?.evidence?.entries?.find(e => e.values.originSnapshot?.id === id)?.values.originSnapshot.name) || placeName(id);
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
              {displayPlace(block.transport.fromPlaceId)} → {displayPlace(block.transport.toPlaceId)}
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

          {isTravel && display.estimated && <p className="text-xs text-amber-400">Estimated transport · approximate flight time; no timetable</p>}
          {isTravel && display.experiences.map(x => <div key={x.id} className="text-sm text-slate-300"><p>{x.title}</p><p>{x.description}</p></div>)}
          {display.error && <p role="alert">{display.error}</p>}
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

function ProposalCard({ trip, proposal, title, onUse, onKeep }) {
  const columns = proposalColumns(trip.routePlan, proposal.routePlan);
  const keptItemsAffected = proposal.diff.keptItemsAffected ?? [];

  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-white">{title ?? proposal.label}</span>
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
          {columns.before.map((r) => (
            <p key={`b-${r.key}`} className="text-xs text-slate-300">
              {placeName(r.placeId)} <span className="text-slate-500">· {nightsLabel(r.nights)}</span>
            </p>
          ))}
        </div>
        <span className="self-center text-teal text-sm">→</span>
        <div className="flex-1 rounded-lg bg-slate-900/60 border border-teal/30 p-3 space-y-1">
          <p className="text-[10px] font-semibold text-teal uppercase tracking-wide">After</p>
          {columns.after.map((r) => (
            <p key={`a-${r.key}`} className="text-xs text-slate-300">
              {placeName(r.placeId)}{" "}
              <span className={r.changed ? "text-teal" : "text-slate-500"}>· {nightsLabel(r.nights)}</span>
            </p>
          ))}
        </div>
      </div>

      <p className="text-sm text-slate-300 leading-relaxed">{summarizeDiff(proposal.diff)}</p>
      {dayTripChangeLines(proposal.diff, placeName).map((line) => (
        <p key={line} className="text-sm text-slate-300 leading-relaxed">{line}</p>
      ))}
      {keptItemsAffected.length > 0 && (
        <p className="text-sm text-amber-400 leading-relaxed">
          {DAY_TRIP_COPY.keptItemsMoved(keptItemsAffected.map((k) => k.title).join(" & "))}
        </p>
      )}

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

export function StructureSheet({ sheet, trip, onMoreTime, onLessTime, onRemoveOptional, onAddOptional, onMoveOptional, onPickMove, onBackToMove, onUseProposal, onPreviewAlternative, onClose }) {
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
                <p className="text-sm text-white">{sheet.current.after ? positionLabel(sheet.current.positionId, placeName(sheet.current.after)) : sheet.optionalLabel}</p>
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
                  {positionLabel(o.positionId, o.after ? placeName(o.after) : null)}
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

        {sheet.stage === "day_trip_refusal" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">{sheet.message}</p>
            {sheet.alternative && (
              <button
                type="button"
                onClick={() => onPreviewAlternative(sheet.alternative)}
                className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-slate-800 border border-slate-600 hover:border-slate-400 text-left transition-colors"
              >
                <span className="text-sm font-medium text-white">{sheet.alternative.label}</span>
                <span className="text-xs text-slate-500 shrink-0">{DAY_TRIP_COPY.previewLabel}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-2.5 font-semibold text-sm hover:bg-slate-600 transition-colors"
            >
              {DAY_TRIP_COPY.keepMyTrip}
            </button>
          </div>
        )}

        {sheet.stage === "proposals" && (
          <div className="space-y-4">
            {sheet.proposals.map((p) => (
              <ProposalCard key={p.id} trip={trip} proposal={p} title={sheet.title} onUse={onUseProposal} onKeep={onClose} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DiscardConfirm({ copy, withDayTrips, onConfirm, onKeep }) {
  if (!copy) return null;
  const { title, body } = withDayTrips ? copy.dayTrips : copy.edits;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onKeep}>
      <div
        className="w-full max-w-2xl rounded-t-2xl bg-slate-900 border-t border-slate-700 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <p className="text-sm text-slate-300">{body}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 bg-teal text-slate-900 rounded-lg px-4 py-2.5 font-bold text-sm hover:opacity-90 transition-opacity"
          >
            {copy.confirm}
          </button>
          <button
            type="button"
            onClick={onKeep}
            className="flex-1 bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-2.5 font-semibold text-sm hover:bg-slate-600 transition-colors"
          >
            {DISCARD_COPY.keepMyTrip}
          </button>
        </div>
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

function RefineSheet({ open, onClose, form, toggleInterest, setPace, setDuration, requiredPlaces, toggleRequired, onApply }) {
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
          <p className="text-xs font-medium text-slate-400 mb-2">Trip length</p>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setDuration(Math.max(1, Number(form.totalDays) - 1))}
              className="px-3 py-1.5 rounded-lg bg-slate-700 text-white hover:bg-slate-600">−</button>
            <span className="text-sm text-white">{form.totalDays} days</span>
            <button type="button" onClick={() => setDuration(Math.min(60, Number(form.totalDays) + 1))}
              className="px-3 py-1.5 rounded-lg bg-slate-700 text-white hover:bg-slate-600">+</button>
          </div>
          <p className="text-xs text-slate-500 mt-2">Door to door — travel days included.</p>
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

// `handoffEligible` is true only where an ordinary refusal can be shown without a trip
// on screen (E6a). A thrown error (E5), a fault (E6b) and a failed rebuild above a
// retained trip (E7) never carry anything: they keep the escape label and the re-entry
// sentence. `handoffPayload` is the request that was refused; `followsTrip` is whether
// it replaced a trip that was on screen.
function FailurePanel({ result, thrown, onExtend, onRemovePlace, onSetDuration, onChangeRoute, handoffEligible = false, handoffPayload = null, followsTrip = false }) {
  if (thrown) {
    return (
      <div role="alert" className="rounded-xl bg-red-950/60 border border-red-700/50 p-5 space-y-2">
        <h3 className="font-semibold text-red-300">Something went wrong</h3>
        <p className="text-sm font-mono text-red-400 break-words">{thrown}</p>
        <p className="text-xs text-red-500">
          This is a data-integrity signal, not a normal failure state.
        </p>
        <ClassicPlannerLink label={CLASSIC_COPY.escape} />
      </div>
    );
  }

  if (!result || result.ok !== false) return null;

  // A fault keeps its own message and everything recorded with it, in the error
  // view: it is never presented as an unsupported destination.
  const fault = refusalKind(result) === "fault";

  const transportEvidence = result.detail?.phase === "pre_validation" ? [] :
    (result.evidence?.entries ?? []).filter(entry =>
      ["connection_estimated", "connection_estimation_refused"].includes(entry.code) &&
      typeof entry.values?.recordedText === "string");
  const usesEstimates = transportEvidence.some(entry => entry.code === "connection_estimated");

  return (
    <div
      role={fault ? "alert" : undefined}
      className={`rounded-xl p-5 space-y-4 border ${fault ? "bg-red-950/60 border-red-700/50" : "bg-slate-800 border-orange-700/50"}`}
    >
      <div>
        {fault ? (
          <h3 className="font-semibold text-red-300 mb-1">Something went wrong</h3>
        ) : (
          <h3 className="font-semibold text-orange-300 mb-1">
            This trip can&apos;t be built yet
          </h3>
        )}
        <p className="text-sm text-slate-300">{result.message}</p>
      </div>

      {transportEvidence.length > 0 && (
        <div className="rounded-lg border border-amber-700/50 p-3 space-y-2">
          <p className="text-sm font-medium text-amber-300">
            {usesEstimates ? "Estimated transport · approximate flight time" : "Transport estimate unavailable"}
          </p>
          {transportEvidence.map((entry, i) => (
            <p key={`${entry.refId}:${i}`} className="text-sm text-slate-300">
              {entry.values.recordedText}
            </p>
          ))}
        </div>
      )}

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
            if (opt.action === "set_duration" || opt.action === "alternate_route") {
              return (
                <div key={i} className="flex items-start gap-3">
                  <button type="button"
                    onClick={() => opt.action === "set_duration" ? onSetDuration(opt.totalDays) : onChangeRoute(opt.routePackageId)}
                    className="shrink-0 text-sm px-3 py-1.5 rounded-lg bg-slate-700 text-white hover:bg-slate-600 font-medium transition-colors">
                    {opt.action === "set_duration" ? `Use ${opt.totalDays} days` : opt.detail}
                  </button>
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

      <ClassicPlannerLink
        label={fault ? CLASSIC_COPY.escape : CLASSIC_COPY.link}
        mode={handoffEligible && !fault && handoffPayload ? "handoff" : "reentry"}
        payload={handoffPayload}
        followsTrip={followsTrip}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Door2Plan() {
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
  const [pendingRouteSwitch, setPendingRouteSwitch] = useState(null);
  const [pendingRefine, setPendingRefine] = useState(false);
  const [pendingFreshStart, setPendingFreshStart] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const connectionSession = useRef(null);
  // Departure confirmation: null (unanswered) | "confirmed" | "declined". Held in
  // memory only, so a reload never infers it. The ref lets a handler resumed from
  // the prompt read the answer given in the same event.
  const [departure, setDepartureState] = useState(null);
  const departureRef = useRef(null);
  const [departureNudge, setDepartureNudge] = useState(false);
  const [departurePrompt, setDeparturePrompt] = useState(null);
  const pageRef = useRef(null);
  // A fault from a rebuild attempted while a trip is on screen; the trip stays.
  const [rebuildFault, setRebuildFault] = useState(null);
  // Whether the result now on screen replaced a trip that was on screen when it was asked
  // for. The render site cannot tell: an ordinary refusal after Refine clears the trip and
  // renders exactly like a refusal of a first build.
  const [resultFollowedTrip, setResultFollowedTrip] = useState(false);
  const [savedTrip, setSavedTrip] = useState(null);

  const requiredPlaces = requiredPlacesForDestination(form.destination);

  const activeTrip = (() => {
    if (editTrip) return editTrip;
    if (tripResult?.result && tripResult.result.ok !== false) return tripResult.result;
    return null;
  })();

  // A restored trip recorded from another origin is never rebuilt here: a rebuild
  // would silently make it a Vancouver trip.
  const originUnsupported = !!activeTrip && activeTrip.spec?.originPlaceId !== SUPPORTED_ORIGIN_ID;

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

  function blockedStructure() {
    const blocked = activeTrip && structuralEvidenceGuard(activeTrip);
    if (blocked) { setEditError(blocked.message); return true; }
    return false;
  }

  function setDeparture(answer) {
    departureRef.current = answer;
    setDepartureState(answer);
    setDepartureNudge(false);
  }

  // The consent check for every entry point that constructs or reconstructs a route.
  // Without a confirmed Vancouver departure it asks instead of proceeding, and
  // `resume` re-enters the same handler once the traveller confirms.
  function departureBlocked(resume) {
    if (originUnsupported) { setDeparturePrompt({ resume: null }); return true; }
    if (departureRef.current === "confirmed") return false;
    setDeparturePrompt({ resume });
    return true;
  }

  function handlePromptAnswer(answer) {
    const resume = departurePrompt?.resume;
    setDeparture(answer);
    if (answer !== "confirmed") return;
    setDeparturePrompt(null);
    resume?.();
  }

  /** @returns {boolean} true when the planner ran and its result is now on screen. */
  function runBuildFromSpec(spec) {
    if (blockedStructure()) return false;
    if (departureBlocked(() => runBuildFromSpec(spec))) return false;
    if (!connectionSession.current) connectionSession.current = { schemaVersion: 1, sequenceId: newSessionId(), estimatorRulesetVersion: 'flight-gc-v1', estimates: [] };
    let result = null;
    let thrown = null;
    let alternatives = [];
    try {
      const planned = buildF6Trip(spec, PILOT_DATA, { reviewPolicy: "allow_drafts", connectionContext: { ...connectionSession.current, generatedAt: new Date().toISOString() } });
      if (activeTrip && !planned.ok && refusalKind(planned) === "fault") { setRebuildFault({ result: planned, thrown: null }); return false; }
      setCurrentSpec(spec);
      result = planned.ok ? planned.value.trip : planned;
      alternatives = planned.ok ? planned.value.alternatives.map(alt => {
        const evidence = planned.value.alternativeEvidence?.find(item => item.routePackageId === alt.routePackageId)?.evidence;
        return evidence ? { ...alt, connectionEvidence: evidence } : alt;
      }) : [];
    } catch (err) {
      thrown = String(err?.message ?? err);
      if (activeTrip) { setRebuildFault({ result: null, thrown }); return false; }
    }
    setRebuildFault(null);
    setResultFollowedTrip(Boolean(activeTrip));
    setTripResult({ result, thrown });
    setEditTrip(null);
    setEditError(null);
    setBlockErrors({});
    setDayErrors({});
    setDayNotices({});
    setRouteAlternatives(alternatives.slice(0, 2));
    return true;
  }

  function runBuild(values) {
    const [kind, id] = values.destination.split(":");
    const spec = {
      originPlaceId: SUPPORTED_ORIGIN_ID,
      destination: { kind, id },
      totalDays: Number(values.totalDays),
      travelMonth: Number(values.travelMonth),
      travellerType: values.travellerType,
      interests: values.interests,
      pace: values.pace,
      budget: "mid",
      routeTemplateId: currentSpec?.routeTemplateId ?? null,
      stops: [],
      requiredPlaceIds: values.required,
      choices: { pinned: [], rejected: [], placed: [] },
    };
    runBuildFromSpec(spec);
  }

  function handleBuildFromBasics() {
    // The question is on this step: point at it rather than asking it twice.
    if (departureRef.current !== "confirmed") { setDepartureNudge(true); return; }
    runBuild(form);
  }

  function handleStartOver() {
    if (hasEvidence(activeTrip) && hasTravellerWork(activeTrip)) { setPendingFreshStart(true); return; }
    confirmFreshStart();
  }

  function confirmFreshStart() {
    setPendingFreshStart(false);
    connectionSession.current = null;
    setDeparture(null);
    setDeparturePrompt(null);
    setRebuildFault(null);
    setSavedTrip(null);
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
    handleSetDuration(Number(form.totalDays) + days);
  }

  function handleSetDuration(totalDays) {
    if (blockedStructure()) return;
    if (departureBlocked(() => handleSetDuration(totalDays))) return;
    const newForm = { ...form, totalDays };
    setForm(newForm);
    runBuild(newForm);
  }

  function handleRemovePlace(placeId) {
    if (blockedStructure()) return;
    if (departureBlocked(() => handleRemovePlace(placeId))) return;
    const newForm = {
      ...form,
      required: form.required.filter((x) => x !== placeId),
    };
    setForm(newForm);
    runBuild(newForm);
  }

  function doChangeRoute(routePackageId) {
    const newSpec = { ...currentSpec, routeTemplateId: routePackageId };
    if (runBuildFromSpec(newSpec)) showToast("Route changed");
  }

  function handleChangeRoute(routePackageId) {
    if (blockedStructure()) return;
    if (departureBlocked(() => handleChangeRoute(routePackageId))) return;
    if (hasTravellerWork(activeTrip)) {
      setPendingRouteSwitch(routePackageId);
      return;
    }
    doChangeRoute(routePackageId);
  }

  function handleConfirmRouteSwitch() {
    const routePackageId = pendingRouteSwitch;
    setPendingRouteSwitch(null);
    if (routePackageId) doChangeRoute(routePackageId);
  }

  function handleKeepTripInsteadOfSwitch() {
    setPendingRouteSwitch(null);
  }

  function handleApplyRefine() {
    if (blockedStructure()) return;
    if (departureBlocked(() => handleApplyRefine())) return;
    setShowRefine(false);
    if (hasTravellerWork(activeTrip)) {
      setPendingRefine(true);
      return;
    }
    runBuild(form);
  }

  function handleConfirmRefine() {
    if (blockedStructure()) return;
    if (departureBlocked(() => handleConfirmRefine())) return;
    setPendingRefine(false);
    runBuild(form);
  }

  function handleSaveDraft() {
    const blocked = activeTrip && editEvidenceGuard(activeTrip);
    if (blocked) { setSaveMsg({ ok: false, text: blocked.message }); return; }
    const t = activeTrip;
    if (!t) return;
    try {
      // A draft is a saved plan, not an editing session: undo history is not persisted.
      saveDraftTrip({ ...t, history: [] }, autoLabel(t.spec), destinationLabelFor(t.spec));
      setSavedTrip(t);
      setSaveMsg({ text: "Saved", ok: true });
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (err) {
      let text;
      if (err instanceof DraftStorageUnreadableError) {
        text = "Couldn't save — saved trips in this browser's storage can't be read, so nothing was changed.";
      } else if (err instanceof DraftNotStorableError) {
        // The failing field is for diagnosis, not for the traveller.
        console.error(`Door2Plan: trip not storable (${err.check}: ${err.check === "shape" ? err.field : err.schema})`, err);
        text = "Couldn't save — this trip is missing information needed to reopen it, so nothing was saved.";
      } else {
        text = "Couldn't save — storage may be full.";
      }
      setSaveMsg({ text, ok: false });
      setTimeout(() => setSaveMsg(null), 4000);
    }
  }

  function handleLoadDraft(trip) {
    connectionSession.current = null;
    // Reopening never carries a confirmation over: the first rebuild asks.
    setDeparture(null);
    setDeparturePrompt(null);
    setRebuildFault(null);
    setSavedTrip(null);
    setTripResult({ result: trip, thrown: null });
    setEditTrip(null);
    setEditError(null);
    setBlockErrors({});
    setDayErrors({});
    setDayNotices({});
    setSaveMsg(null);
    setRouteAlternatives([]);
    // A reload leaves the form at DEFAULT_FORM; restore it from the trip's own
    // spec so Refine rebuilds this trip instead of one with no destination.
    const restored = formFromSpec(trip?.spec);
    if (restored) setForm(restored);
    setCurrentSpec(trip?.spec ?? null);
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
    if (blockedStructure()) return;
    if (!node.routeStop) return;
    if (departureBlocked(() => handleOpenNightsSheet(node))) return;
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
    if (blockedStructure()) return;
    if (departureBlocked(() => handleOpenOptionalSheet(opt))) return;
    setStructureSheet({ stage: "optional", optionalId: opt.optionalId, label: opt.label, pitch: opt.pitch });
  }

  function handleAddOptional(optionalId) {
    const t = activeTrip;
    if (!t) return;
    if (departureBlocked(() => handleAddOptional(optionalId))) return;
    const result = previewAddOptional(t, optionalId, undefined, { generatedAt: new Date().toISOString() });
    if (result.ok) {
      setStructureSheet({ stage: "proposals", proposals: result.proposals });
    } else {
      setStructureSheet({ stage: "refusal", message: result.message, alternatives: result.alternatives ?? [] });
    }
  }

  function handleRemoveOptional(optionalId) {
    const t = activeTrip;
    if (!t) return;
    if (departureBlocked(() => handleRemoveOptional(optionalId))) return;
    const result = previewRemoveOptional(t, optionalId, { generatedAt: new Date().toISOString() });
    if (result.ok) {
      setStructureSheet({ stage: "proposals", proposals: result.proposals });
    } else {
      setStructureSheet({ stage: "refusal", message: result.message, alternatives: result.alternatives ?? [] });
    }
  }

  function handleMoveOptional(optionalId) {
    if (blockedStructure()) return;
    const t = activeTrip;
    if (!t) return;
    if (departureBlocked(() => handleMoveOptional(optionalId))) return;
    const { current, options } = listMoveOptions(t, optionalId, { generatedAt: new Date().toISOString() });
    setStructureSheet({ stage: "move", optionalId, optionalLabel: optionalLabelFor(t, optionalId), current, options });
  }

  function handlePickMove(proposal) {
    setStructureSheet((s) => pickMove(s, proposal));
  }

  function handleBackToMove() {
    setStructureSheet((s) => backToMove(s));
  }

  function handleAdjustNights(stopKey, delta) {
    const t = activeTrip;
    if (!t) return;
    if (departureBlocked(() => handleAdjustNights(stopKey, delta))) return;
    const result = previewAdjustNights(t, stopKey, delta, { generatedAt: new Date().toISOString() });
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

  // ── Day-trip handlers (menu row / Remove → preview → apply) ──────────────

  function dayTripContext(t, stopKey, item) {
    const stop = t.routePlan.stops.find((s) => s.key === stopKey);
    return { place: placeName(item.placeId), base: placeName(stop?.placeId), stop, spec: t.spec };
  }

  function handleOpenDayTrip(stopKey, item) {
    if (blockedStructure()) return;
    const t = activeTrip;
    if (!t) return;
    if (departureBlocked(() => handleOpenDayTrip(stopKey, item))) return;
    const ctx = dayTripContext(t, stopKey, item);
    let result = null;
    try {
      result = previewAddExcursion(t, stopKey, item.excursionId, { generatedAt: new Date().toISOString() });
    } catch (err) {
      // An engine throw is a defect, not a refusal: say it plainly in the console, show the fallback.
      console.error("Door2Plan: day-trip preview failed", err);
    }
    if (result?.ok) {
      setStructureSheet({ stage: "proposals", proposals: result.proposals, title: DAY_TRIP_COPY.previewAddTitle(ctx.place) });
    } else {
      setStructureSheet({ stage: "day_trip_refusal", ...dayTripRefusalView(result, ctx) });
    }
  }

  function handleRemoveDayTrip(stopKey, item) {
    const t = activeTrip;
    if (!t) return;
    if (departureBlocked(() => handleRemoveDayTrip(stopKey, item))) return;
    const place = placeName(item.placeId);
    let result = null;
    try {
      result = previewRemoveExcursion(t, stopKey, item.excursionId, { generatedAt: new Date().toISOString() });
    } catch (err) {
      console.error("Door2Plan: day-trip removal preview failed", err);
    }
    if (result?.ok) {
      setStructureSheet({ stage: "proposals", proposals: result.proposals, title: DAY_TRIP_COPY.previewRemoveTitle(place) });
    } else {
      setStructureSheet({ stage: "day_trip_refusal", message: DAY_TRIP_COPY.removeUnavailable(place), alternative: null });
    }
  }

  function handlePreviewAlternative(alternative) {
    setStructureSheet({ stage: "proposals", proposals: [alternative.proposal], title: alternative.label });
  }

  function handleUseProposal(proposal) {
    const t = activeTrip;
    if (!t) return;
    if (departureBlocked(() => handleUseProposal(proposal))) return;
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

  const evidenceStatus = activeTrip ? inspectEvidence(activeTrip) : { ok: true };
  const placeGroups = activeTrip && evidenceStatus.ok ? groupDaysByPlace(activeTrip) : [];
  if (!evidenceStatus.ok) return <div role="alert">{evidenceStatus.message}</div>;

  return (
    <div ref={pageRef} tabIndex={-1} className="min-h-screen bg-slate-900 outline-none">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-4">
        {!showResults && (
          <header className="space-y-0.5">
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">WhereNova · Early access</p>
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
            departure={departure}
            onDeparture={setDeparture}
            departureNudge={departureNudge}
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
                  onSetDuration={handleSetDuration}
                  onChangeRoute={handleChangeRoute}
                  handoffEligible
                  handoffPayload={specBasics(currentSpec) ?? handoffBasics(form)}
                  followsTrip={resultFollowedTrip}
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
                {rebuildFault && (
                  <FailurePanel
                    result={rebuildFault.result}
                    thrown={rebuildFault.thrown}
                    onExtend={handleExtend}
                    onRemovePlace={handleRemovePlace}
                    onSetDuration={handleSetDuration}
                    onChangeRoute={handleChangeRoute}
                  />
                )}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="text-lg font-bold text-white truncate">
                      {destinationLabel(form.destination)}
                    </h1>
                    <p className="text-xs text-slate-500">
                      {activeTrip.days.length} days{nights ? ` · ${nights}` : ""}
                    </p>
                    {saveMsg && <p className={`text-xs ${saveMsg.ok ? "text-teal" : "text-rose-400"} mt-0.5`}>{saveMsg.text}</p>}
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

                <p className="text-xs text-slate-500">
                  {savedTrip === activeTrip ? APPROVED_COPY.afterSave : APPROVED_COPY.beforeSave}
                </p>

                {originUnsupported && <DepartureLimit />}

                {activeTrip.status === "incomplete" && (
                  <p className="text-xs text-amber-400">Some days still need attention below.</p>
                )}

                {evidenceStatus.readOnly && <p role="status">{evidenceStatus.notice}</p>}
                {activeTrip.evidence && <section aria-label="Recorded reasons"><h2>Recorded reasons</h2>{activeTrip.evidence.entries.map((e, i) => <p key={i}>{e.values.recordedText}</p>)}</section>}
                <TripAtAGlance
                  trip={activeTrip}
                  routeAlternatives={routeAlternatives}
                  onChangeRoute={handleChangeRoute}
                  onOpenNightsSheet={handleOpenNightsSheet}
                  addableOptionals={addableOptionalsFor(activeTrip)}
                  onOpenOptionalSheet={handleOpenOptionalSheet}
                  dayTripMenus={dayTripMenusFor(activeTrip)}
                  onOpenDayTrip={handleOpenDayTrip}
                  onRemoveDayTrip={handleRemoveDayTrip}
                />

                <div className="space-y-5">
                  <EvidenceTripContext.Provider value={activeTrip}>
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
                  </EvidenceTripContext.Provider>
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

                {activeTrip.status === "draft" ? (
                  <p className="text-center text-xs text-amber-500/80 pt-4">
                    Draft itinerary — some transport details have not been reviewed. Use this for testing and feedback, not for booking.
                  </p>
                ) : (
                  <p className="text-center text-xs text-slate-500 pt-4">
                    Early-access planner — selected routes from Vancouver: New York City, Tokyo with Kyoto options, Peru classic with Huaraz options, and the Eastern Canada corridor.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <footer className="pt-4 text-center">
          <a href={FEEDBACK_HREF} className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2">
            {APPROVED_COPY.feedback}
          </a>
        </footer>
      </div>

      <RefineSheet
        open={showRefine}
        onClose={() => setShowRefine(false)}
        form={form}
        toggleInterest={toggleInterest}
        setPace={(pace) => updateForm({ pace })}
        setDuration={(totalDays) => updateForm({ totalDays })}
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
        onPreviewAlternative={handlePreviewAlternative}
        onClose={() => setStructureSheet(null)}
      />

      <SwapDayPicker picker={swapPicker} onConfirm={handleConfirmSwapDay} onClose={() => setSwapPicker(null)} />

      <DiscardConfirm
        copy={pendingRouteSwitch !== null ? DISCARD_COPY.routeSwitch : null}
        withDayTrips={hasDayTrips(activeTrip)}
        onConfirm={handleConfirmRouteSwitch}
        onKeep={handleKeepTripInsteadOfSwitch}
      />

      <DiscardConfirm
        copy={pendingRefine ? DISCARD_COPY.refine : null}
        withDayTrips={hasDayTrips(activeTrip)}
        onConfirm={handleConfirmRefine}
        onKeep={() => setPendingRefine(false)}
      />

      <DiscardConfirm
        copy={pendingFreshStart ? { confirm: 'Start over', edits: { title: 'Start a new trip?', body: 'Your unsaved edits will be discarded.' } } : null}
        withDayTrips={false}
        onConfirm={confirmFreshStart}
        onKeep={() => setPendingFreshStart(false)}
      />

      <DeparturePrompt
        prompt={departurePrompt}
        answer={departure}
        originUnsupported={originUnsupported}
        onAnswer={handlePromptAnswer}
        onClose={() => setDeparturePrompt(null)}
        fallbackFocusRef={pageRef}
        payload={handoffBasics(form)}
      />
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-700 border border-slate-600 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
