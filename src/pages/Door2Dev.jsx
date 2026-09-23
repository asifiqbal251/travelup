import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import PageNotFound from "@/lib/PageNotFound";
import { makeDayLighter, pinActivity, rejectActivity, swapActivity, undo, unpinActivity } from "@/lib/door2/edit";
import { PILOT_DATA, buildFilledTrip, buildSkeletonTrip } from "@/lib/door2/planner";
import { PILOT_PLACES } from "@/lib/door2/pilotData";

// Hidden dev harness for the Door 2 planner (skeleton + fill) (/dev/door2?key=door2).
// A test instrument, not product UI. Not linked from anywhere.

const BASE_SPEC = {
  originPlaceId: "vancouver",
  travelMonth: 10,
  travellerType: "couple",
  interests: [],
  pace: "balanced",
  budget: "mid",
  routeTemplateId: null,
  stops: [],
  choices: { pinned: [], rejected: [], placed: [] }
};

const PERU = "country:PE";
const st = (id, placeId, minNights, maxNights, excursions = []) => ({ id, placeId, minNights, maxNights, excursions });
const MP_EXCURSION = { placeId: "machu_picchu", connectionId: "conn_agc_mp_shuttle", hoursOnSite: 4 };

function testPackage(id, stops) {
  const placeIds = [];
  for (const s of stops) {
    if (!placeIds.includes(s.placeId)) placeIds.push(s.placeId);
    for (const ex of s.excursions) if (!placeIds.includes(ex.placeId)) placeIds.push(ex.placeId);
  }
  return { id, name: id, countryId: "PE", stops, placeIds, visitRules: { minNights: 0, maxNights: 0, extensions: [] }, reviewed: false };
}

const TEST_PACKAGES = {
  F8a: testPackage("test_huaraz_direct", [st("t_lima_in", "lima", 1, 2), st("t_huaraz", "huaraz", 2, 4), st("t_cusco", "cusco", 2, 4), st("t_lima_out", "lima", 1, 1)]),
  F8b: testPackage("test_atlantis", [st("t_lima", "lima", 1, 2), st("t_atlantis", "atlantis", 1, 2)]),
  F8c: testPackage("test_sleep_at_mp", [
    st("t_lima_in", "lima", 1, 1), st("t_cusco", "cusco", 2, 2), st("t_olly", "ollantaytambo", 0, 0), st("t_aguas", "aguas_calientes", 0, 0),
    st("t_mp", "machu_picchu", 1, 1), st("t_aguas_back", "aguas_calientes", 0, 0), st("t_olly_back", "ollantaytambo", 0, 0),
    st("t_cusco_back", "cusco", 0, 0), st("t_lima_out", "lima", 1, 1)
  ]),
  F8d: testPackage("test_lima_pass_through", [
    st("ph_lima_in", "lima", 1, 2), st("ph_huaraz", "huaraz", 2, 4), st("ph_lima_mid", "lima", 0, 0), st("ph_cusco", "cusco", 2, 4),
    st("ph_sacred_valley", "ollantaytambo", 0, 1), st("ph_aguas", "aguas_calientes", 1, 2, [MP_EXCURSION]),
    st("ph_olly_return", "ollantaytambo", 0, 0), st("ph_cusco_return", "cusco", 0, 0), st("ph_lima_out", "lima", 1, 1)
  ])
};

const FIXTURES = [
  { key: "F1", label: "F1 · NYC, 7 days", destination: "place:new_york", totalDays: 7, required: [] },
  { key: "F2", label: "F2 · Peru, 10 days", destination: PERU, totalDays: 10, required: [] },
  { key: "F3", label: "F3 · Peru, 5 days (too short)", destination: PERU, totalDays: 5, required: [] },
  { key: "F4", label: "F4 · Peru + Huaraz + MP, 12 days", destination: PERU, totalDays: 12, required: ["huaraz", "machu_picchu"] },
  { key: "F5", label: "F5 · Peru + Huaraz + MP, 9 days (conflict)", destination: PERU, totalDays: 9, required: ["huaraz", "machu_picchu"] },
  { key: "F6", label: "F6 · Tokyo, 7 days", destination: "place:tokyo", totalDays: 7, required: [] },
  { key: "F7", label: "F7 · Peru, 10 days, strict", destination: PERU, totalDays: 10, required: [], policy: "strict" },
  { key: "F8a", label: "F8a · test pkg: Huaraz→Cusco direct (missing)", destination: PERU, totalDays: 12, required: [] },
  { key: "F8b", label: "F8b · test pkg: stop at atlantis (throws)", destination: PERU, totalDays: 10, required: [] },
  { key: "F8c", label: "F8c · test pkg: night at Machu Picchu (throws)", destination: PERU, totalDays: 12, required: [] },
  { key: "F8d", label: "F8d · test pkg: Lima pass-through after Huaraz", destination: PERU, totalDays: 12, required: [] },
  { key: "F9", label: "F9 · Ljubljana, 7 days (uncovered)", destination: "place:ljubljana", totalDays: 7, required: [] },
  { key: "G5", label: "G5 · Tokyo, 10 days (runs out of content)", destination: "place:tokyo", totalDays: 10, required: [] },
  { key: "G7", label: "G7 · Peru, 10 days, Hiking", destination: PERU, totalDays: 10, required: [], interests: ["Hiking"] },
  { key: "G10", label: "G10 · Tokyo, 7 days, Relaxed", destination: "place:tokyo", totalDays: 7, required: [], pace: "relaxed" }
];

const DESTINATIONS = [
  { value: "country:PE", label: "Peru (country)" },
  { value: "country:US", label: "United States (country)" },
  { value: "country:JP", label: "Japan (country)" },
  ...Object.values(PILOT_PLACES)
    .filter((p) => p.id !== "vancouver")
    .map((p) => ({ value: `place:${p.id}`, label: `${p.name} (place)` }))
];

const PACES = [
  { value: "relaxed", label: "Relaxed" },
  { value: "balanced", label: "Balanced" },
  { value: "fast-paced", label: "Fast-paced" }
];

const INTERESTS = ["Cities", "Food", "History and culture", "Photography", "Nature", "Hiking", "Adventure", "Beaches", "Relaxation", "Wildlife"];

const placeName = (id) => PILOT_PLACES[id]?.name ?? id ?? "—";

function endTime(block) {
  const [h, m] = block.startTime.split(":").map(Number);
  const total = Math.round(h * 60 + m + block.durationHours * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function run(state) {
  const fixture = FIXTURES.find((f) => f.key === state.fixture);
  const [kind, id] = state.destination.split(":");
  const spec = {
    ...BASE_SPEC,
    destination: { kind, id },
    totalDays: Number(state.totalDays),
    requiredPlaceIds: state.required,
    pace: state.pace,
    interests: state.interests
  };
  const data = TEST_PACKAGES[fixture?.key] ? { ...PILOT_DATA, routePackages: [TEST_PACKAGES[fixture.key]] } : PILOT_DATA;
  const build = state.fill ? buildFilledTrip : buildSkeletonTrip;
  try {
    return { spec, result: build(spec, data, { reviewPolicy: state.policy }) };
  } catch (err) {
    return { spec, thrown: String(err?.message ?? err) };
  }
}

function tripSummary(trip) {
  const home = trip.days.flatMap((d) => d.blocks).find((b) => b.id.endsWith(">origin_home"));
  const nights = trip.spec.stops.filter((s) => s.nights > 0).map((s) => `${placeName(s.placeId)} ${s.nights}`).join(", ");
  return `${trip.days.length}-day trip · home arrival Day ${home.transport.arriveDayNumber} ${home.transport.arriveTime} · nights: ${nights}`;
}

function fixtureState(key, fill = true) {
  const f = FIXTURES.find((x) => x.key === key);
  return {
    fixture: f.key,
    destination: f.destination,
    totalDays: f.totalDays,
    required: [...f.required],
    policy: f.policy ?? "allow_drafts",
    pace: f.pace ?? "balanced",
    interests: [...(f.interests ?? [])],
    fill
  };
}

function ActivityDetail({ block }) {
  const a = block.activity;
  const source = block.provenance.content;
  return (
    <div className="basis-full pl-14 text-slate-700 space-y-0.5">
      <div>
        <span className="font-semibold text-slate-900">{a.title}</span>
        <span className="text-slate-500"> · {a.slot} · {a.intensity}</span>
        <span className="ml-2 text-xs px-1.5 rounded bg-slate-100 text-slate-600">
          {source?.kind === "extracted" ? <>from <em>{source.bundleName}</em></> : "pilot-written"}
        </span>
      </div>
      <div>{a.summary}</div>
      {a.slot === "full" && (
        <div className="text-slate-600">
          <div>Morning: {a.morning}</div>
          <div>Afternoon: {a.afternoon}</div>
          <div>Evening: {a.evening}</div>
        </div>
      )}
      {a.foodNote && <div className="text-slate-600">Food: {a.foodNote}</div>}
    </div>
  );
}

export default function Door2Dev() {
  const location = useLocation();
  const allowed = new URLSearchParams(location.search).get("key") === "door2";
  const [state, setState] = useState(() => fixtureState("F2"));
  const [copied, setCopied] = useState(false);
  const [editTrip, setEditTrip] = useState(null);
  const [editCount, setEditCount] = useState(0);
  const [editError, setEditError] = useState(null);
  const output = useMemo(() => run(state), [state]);

  if (!allowed) return <PageNotFound />;

  const update = (patch) => {
    setCopied(false);
    setEditTrip(null);
    setEditCount(0);
    setEditError(null);
    setState((s) => ({ ...s, ...patch }));
  };

  // The trip currently shown (editTrip overrides the built trip when edits are active)
  const activeTrip = (() => {
    if (editTrip) return editTrip;
    const r = output.result;
    return r && r.ok !== false ? r : null;
  })();

  function applyEdit(fn) {
    const t = activeTrip;
    if (!t) return;
    const result = fn(t);
    if (result.ok) {
      setEditTrip(result.trip);
      setEditCount((n) => n + 1);
      setEditError(null);
    } else {
      setEditError(result.message);
    }
  }

  function handleUndo() {
    const t = editTrip ?? activeTrip;
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
  const toggleRequired = (id) =>
    update({ required: state.required.includes(id) ? state.required.filter((x) => x !== id) : [...state.required, id] });
  const toggleInterest = (i) =>
    update({ interests: state.interests.includes(i) ? state.interests.filter((x) => x !== i) : [...state.interests, i] });

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(output.result ?? output, null, 2));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const result = output.result;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <h1 className="text-2xl font-bold">Door 2 planner (skeleton + fill) · dev harness</h1>

        {state.policy === "allow_drafts" && (
          <div className="rounded-lg bg-amber-400 text-amber-950 font-semibold px-4 py-3 border-2 border-amber-600">
            DRAFT DATA — pilot connections are unreviewed. Not for real travellers.
            {state.fill && " Pilot activities are unreviewed. Tokyo intentionally runs out after about 6 days."}
            {" "}Edits are local to this browser tab and are not saved anywhere yet.
          </div>
        )}

        <section className="rounded-lg bg-white border border-slate-200 p-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Fixture</span>
            <select className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 bg-white" value={state.fixture} onChange={(e) => { setCopied(false); setState(fixtureState(e.target.value, state.fill)); }}>
              {FIXTURES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Destination</span>
            <select className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 bg-white" value={state.destination} onChange={(e) => update({ destination: e.target.value })}>
              {DESTINATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Total days</span>
            <input type="number" min={1} max={60} className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" value={state.totalDays} onChange={(e) => update({ totalDays: e.target.value })} />
          </label>
          <fieldset className="text-sm">
            <legend className="font-medium">Review policy</legend>
            <div className="mt-1 flex gap-4">
              {["allow_drafts", "strict"].map((p) => (
                <label key={p} className="flex items-center gap-1.5">
                  <input type="radio" name="policy" checked={state.policy === p} onChange={() => update({ policy: p })} />
                  {p}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={state.fill} onChange={(e) => update({ fill: e.target.checked })} />
            Fill activities
          </label>
          <label className="block text-sm">
            <span className="font-medium">Pace</span>
            <select className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 bg-white" value={state.pace} onChange={(e) => update({ pace: e.target.value })}>
              {PACES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <fieldset className="text-sm md:col-span-2">
            <legend className="font-medium">Interests</legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {INTERESTS.map((i) => (
                <label key={i} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={state.interests.includes(i)} onChange={() => toggleInterest(i)} />
                  {i}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="text-sm md:col-span-2">
            <legend className="font-medium">Required places</legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {Object.values(PILOT_PLACES).map((p) => (
                <label key={p.id} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={state.required.includes(p.id)} onChange={() => toggleRequired(p.id)} />
                  {p.name}
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <div className="flex items-center gap-3">
          <button type="button" onClick={copyJson} className="rounded bg-slate-900 text-white text-sm px-3 py-1.5 hover:bg-slate-700">
            Copy JSON
          </button>
          {copied && <span className="text-sm text-slate-600">Copied</span>}
        </div>

        {output.thrown && (
          <section className="rounded-lg bg-red-50 border border-red-300 p-4 text-sm">
            <div className="font-semibold text-red-800">Engine threw (data-integrity / engine bug)</div>
            <div className="mt-1 font-mono text-red-900">{output.thrown}</div>
          </section>
        )}

        {result && result.ok === false && (
          <section className="rounded-lg bg-white border border-orange-300 p-4 text-sm space-y-2">
            <div><span className="font-semibold">Failure:</span> <code className="font-mono">{result.state}</code></div>
            <div>{result.message}</div>
            <ul className="list-disc pl-5 space-y-1">
              {result.options.map((o, i) => (
                <li key={i}>
                  <code className="font-mono">{o.action}</code> — {o.detail}
                  {o.days != null && ` (days: ${o.days})`}
                  {o.placeId && ` (placeId: ${o.placeId})`}
                  {o.routePackageId && ` (routePackageId: ${o.routePackageId})`}
                </li>
              ))}
            </ul>
            {result.detail && <pre className="text-xs bg-slate-50 rounded p-2 overflow-x-auto">{JSON.stringify(result.detail, null, 2)}</pre>}
          </section>
        )}

        {(activeTrip || (output.result && output.result.ok !== false)) && (() => {
          const displayTrip = activeTrip ?? output.result;
          return (
            <section className="space-y-3">
              <div className="rounded-lg bg-white border border-slate-200 p-4 text-sm">
                <div className="font-semibold">{tripSummary(displayTrip)}</div>
                <div className="text-slate-600 mt-1">
                  {displayTrip.id} · status <code className={displayTrip.status === "incomplete" ? "px-1 rounded bg-amber-200 text-amber-900" : undefined}>{displayTrip.status}</code> · route <code>{displayTrip.spec.routeTemplateId}</code>
                  {displayTrip.warnings?.length > 0 && <> · warnings: <code>{displayTrip.warnings.join(", ")}</code></>}
                  {displayTrip.contentGaps && <> · gaps: <code>{displayTrip.contentGaps.length}</code></>}
                  {" · "}content <code>{displayTrip.versions.content}</code>
                  {state.fill && <> · <span className="font-medium">{editCount} edits this session</span></>}
                </div>
                {state.fill && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!editTrip?.history?.length}
                      onClick={handleUndo}
                      className="rounded bg-slate-700 text-white text-xs px-2.5 py-1 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Undo
                    </button>
                    {editError && <span className="text-xs text-red-700">{editError}</span>}
                  </div>
                )}
              </div>
              {displayTrip.days.map((d) => (
                <div key={d.id} className="rounded-lg bg-white border border-slate-200 p-3">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-semibold text-sm">Day {d.dayNumber}</span>
                    {state.fill && (
                      <button
                        type="button"
                        onClick={() => applyEdit((t) => makeDayLighter(t, d.dayNumber))}
                        className="rounded bg-teal-100 text-teal-800 text-xs px-2 py-0.5 hover:bg-teal-200"
                      >
                        Make lighter
                      </button>
                    )}
                  </div>
                  <ul className="space-y-1 text-sm">
                    {d.blocks.map((b) => (
                      <li key={b.id} className="flex flex-wrap gap-x-2 items-baseline">
                        <span className="font-mono w-12">{b.startTime}</span>
                        <span className={`font-mono text-xs uppercase px-1.5 rounded ${b.type === "travel" ? "bg-sky-100 text-sky-900" : b.gap ? "bg-amber-200 text-amber-900" : b.type === "open" ? "bg-emerald-100 text-emerald-900" : b.type === "activity" ? "bg-violet-100 text-violet-900" : "bg-slate-100"}`}>{b.type}</span>
                        <span>{b.note === "in_transit" ? "in transit" : placeName(b.placeId)}</span>
                        <span className="text-slate-500">{b.durationHours.toFixed(2)}h{(b.type === "open" || b.type === "activity") && ` (until ${endTime(b)})`}</span>
                        {b.transport && (
                          <span className="text-slate-700">
                            {b.transport.mode} · {placeName(b.transport.fromPlaceId)} → {placeName(b.transport.toPlaceId)} · arrives Day {b.transport.arriveDayNumber} {b.transport.arriveTime}
                            {b.transport.overnight && <span className="ml-1.5 text-xs px-1.5 rounded bg-indigo-100 text-indigo-900">overnight</span>}
                          </span>
                        )}
                        {!b.provenance.reviewed && <span className="text-xs px-1.5 rounded bg-amber-200 text-amber-900">draft</span>}
                        {b.locked && <span className="text-xs px-1.5 rounded bg-indigo-200 text-indigo-900">📌 pinned</span>}
                        <span className="text-xs text-slate-400 font-mono">{b.id}</span>
                        {state.fill && b.type === "activity" && (
                          <span className="flex gap-1 ml-1">
                            <button type="button" onClick={() => applyEdit((t) => swapActivity(t, b.id))} className="rounded bg-violet-100 text-violet-800 text-xs px-1.5 py-0 hover:bg-violet-200">Swap</button>
                            <button type="button" onClick={() => applyEdit((t) => rejectActivity(t, b.id))} className="rounded bg-rose-100 text-rose-800 text-xs px-1.5 py-0 hover:bg-rose-200">Reject</button>
                            <button type="button" onClick={() => applyEdit((t) => b.locked ? unpinActivity(t, b.id) : pinActivity(t, b.id))} className="rounded bg-slate-100 text-slate-700 text-xs px-1.5 py-0 hover:bg-slate-200">{b.locked ? "Unpin" : "Pin"}</button>
                          </span>
                        )}
                        {b.type === "activity" && <ActivityDetail block={b} />}
                        {b.gap && (
                          <div className="basis-full pl-14 text-amber-800 font-medium">
                            No curated activity left for this slot yet <span className="font-normal text-amber-700">({b.gap.slot})</span>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          );
        })()}
      </div>
    </div>
  );
}
