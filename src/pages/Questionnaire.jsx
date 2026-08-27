import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import SnapSlider from "@/components/SnapSlider";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from "@/components/ui/select";
import {
  ArrowLeft, ArrowRight, Check, Compass, Sparkles,
  User, Heart, Users, Baby, Wallet, Banknote, Gem, Crown,
  Sun, CloudSun, Cloud, Snowflake, Coffee, Scale, Zap,
  Feather, Footprints, Bike, Mountain, Trees, Landmark, UtensilsCrossed,
  Waves, Bird, Building2, Armchair, Camera, ChevronDown
} from "lucide-react";
import {
  MONTHS, INTERESTS, DIETARY, TRAVELLER_TYPES, COUNTRIES,
  BUDGET_ORDER, PACE_ORDER, ACTIVITY_ORDER, CLIMATE_ORDER
} from "@/lib/options";
import { setPrefs, getPrefs, setSelectedDestinationId } from "@/lib/storage";

// Compact two-screen Travel Fit experience (+ a minimal match-reveal state).
// Screen 1 "Your trip": origin, timing, trip length, scope, traveller type,
//   interests.
// Screen 2 "Your travel style": budget, climate, pace, activity (snap sliders,
//   each with an optional "No preference" opt-out) + optional refinements
//   (dietary, visited, excluded).
// Reveal state: "Your Travel Fit is ready." → primary CTA → short transition
//   into Results.
//
// Every value still maps to the SAME recommendation inputs and controlled
// vocabulary. "No preference" is stored as the literal string the engine already
// recognises: climate "No preference" scores full climate points; pace/activity
// "No preference" fall outside the ordered scales and score neutrally (0), which
// is the existing absence behaviour. No new backend values, no formula changes.
const STAGE_LABELS = ["Your trip", "Your travel style", "Ready"];

const TRAVELLER_ICONS = { Solo: User, Couple: Heart, Friends: Users, Family: Baby };
const BUDGET_ICONS = { Budget: Wallet, Moderate: Banknote, Comfortable: Gem, Premium: Crown };
const CLIMATE_ICONS = { Warm: Sun, Mild: CloudSun, Cool: Cloud, "Cold or snowy": Snowflake };
const PACE_ICONS = { Relaxed: Coffee, Balanced: Scale, "Fast-paced": Zap };
const ACTIVITY_ICONS = { Light: Feather, Moderate: Footprints, Active: Bike, "Highly active": Mountain };
const INTEREST_ICONS = {
  "Nature": Trees, "History and culture": Landmark, "Food": UtensilsCrossed,
  "Beaches": Waves, "Hiking": Mountain, "Wildlife": Bird, "Adventure": Compass,
  "Cities": Building2, "Relaxation": Armchair, "Photography": Camera
};

const BUDGET_POINTS = BUDGET_ORDER.map((b) => ({ value: b, label: b, icon: BUDGET_ICONS[b] }));
const PACE_POINTS = PACE_ORDER.map((p) => ({ value: p, label: p, icon: PACE_ICONS[p] }));
const ACTIVITY_POINTS = ACTIVITY_ORDER.map((a) => ({ value: a, label: a, icon: ACTIVITY_ICONS[a] }));
const CLIMATE_POINTS = CLIMATE_ORDER.map((c) => ({ value: c, label: c, icon: CLIMATE_ICONS[c] }));

const blank = {
  residenceCountry: "",
  departureCity: "",
  citizenship: "",
  travelScope: "both",
  travelMonth: "",
  travelDays: 7,
  travellerType: "",
  budget: "",
  interests: [],
  climate: "",
  pace: "",
  activity: "",
  dietary: "None",
  dietaryOther: "",
  visitedCountries: "",
  excludedDestinations: ""
};

const PRIMARY_CTA =
  "inline-flex items-center justify-center gap-2 h-12 px-8 rounded-full bg-ink text-on-dark font-semibold ring-1 ring-teal/40 shadow-[0_10px_30px_-12px_rgba(2,218,227,0.55)] hover:bg-surface-dark hover:ring-teal/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark motion-safe:transition";

export default function Questionnaire() {
  const navigate = useNavigate();
  const [stage, setStage] = useState(() => {
    const s = Number(new URLSearchParams(window.location.search).get("step"));
    // Old 7-step suggestion links: steps 0–3 map to Screen 1, 4+ to Screen 2.
    return Number.isFinite(s) && s >= 4 ? 1 : 0;
  });
  const [form, setForm] = useState(() => {
    const p = getPrefs();
    if (!p) return { ...blank };
    return {
      ...blank,
      ...p,
      travelScope: p.travelScope || (p.allowDomestic === false ? "international" : "both"),
      visitedCountries: Array.isArray(p.visitedCountries)
        ? p.visitedCountries.join(", ")
        : p.visitedCountries || "",
      excludedDestinations: Array.isArray(p.excludedDestinations)
        ? p.excludedDestinations.join(", ")
        : p.excludedDestinations || ""
    };
  });
  const [errors, setErrors] = useState({});
  const [revealing, setRevealing] = useState(false);
  const [barW, setBarW] = useState(0);
  const [showRefinements, setShowRefinements] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleInterest = (i) =>
    set("interests", form.interests.includes(i)
      ? form.interests.filter((x) => x !== i)
      : [...form.interests, i]);

  const validateStage = (s) => {
    const e = {};
    if (s === 0) {
      if (!form.residenceCountry) e.residenceCountry = "Select your country of residence.";
      if (!form.departureCity.trim()) e.departureCity = "Enter your departure city.";
      if (!form.citizenship) e.citizenship = "Select your citizenship.";
      if (!form.travelMonth) e.travelMonth = "Choose a month or flexible.";
      if (!form.travelDays || form.travelDays < 3 || form.travelDays > 14)
        e.travelDays = "Choose between 3 and 14 days.";
      if (!form.travellerType) e.travellerType = "Select who you're travelling with.";
      if (!form.interests.length) e.interests = "Pick at least one interest.";
    }
    if (s === 1) {
      if (!form.budget) e.budget = "Choose a budget level.";
      if (!form.climate) e.climate = "Choose a weather preference.";
      if (!form.pace) e.pace = "Choose a preferred pace.";
      if (!form.activity) e.activity = "Choose an activity level.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const advance = () => {
    if (!validateStage(stage)) return;
    setStage((s) => Math.min(s + 1, 2));
  };
  const back = () => {
    if (stage === 0) { navigate("/"); return; }
    setStage((s) => s - 1);
  };

  const buildPrefs = () => {
    const toArray = (v) =>
      Array.isArray(v)
        ? v.map((s) => String(s).trim()).filter(Boolean)
        : v
        ? String(v).split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    return {
      ...form,
      departureCity: form.departureCity.trim(),
      dietary: form.dietary === "Other" ? (form.dietaryOther || "").trim() || "Other" : form.dietary,
      visitedCountries: toArray(form.visitedCountries),
      excludedDestinations: toArray(form.excludedDestinations)
    };
  };

  const reveal = () => {
    if (revealing) return;
    setPrefs(buildPrefs());
    setSelectedDestinationId(null);
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setRevealing(true);
    requestAnimationFrame(() => setBarW(100));
    window.setTimeout(() => navigate("/results"), reduced ? 250 : 1100);
  };

  // Dynamic, subtle microcopy reflecting current selections.
  const microcopy =
    stage === 0
      ? form.departureCity.trim() && form.travellerType && form.travelDays
        ? `A ${form.travelDays}-day ${form.travellerType.toLowerCase()} trip from ${form.departureCity.trim()}.`
        : "A few details so we can match you."
      : stage === 1
      ? [
          form.budget || "Budget —",
          form.climate === "No preference" || !form.climate ? "any weather" : form.climate.toLowerCase(),
          form.pace === "No preference" || !form.pace ? "any pace" : form.pace.toLowerCase()
        ].join(" · ")
      : "";

  const progress = stage === 0 ? 50 : 100;

  return (
    <div className="min-h-screen bg-cinema text-on-dark">
      {revealing && <RevealOverlay barW={barW} />}

      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
        {/* Top bar: back arrow + step progress */}
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={back}
            aria-label={stage === 0 ? "Back to home" : "Back"}
            className="inline-flex items-center justify-center h-11 w-11 rounded-full bg-white/5 ring-1 ring-white/10 text-on-dark hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal motion-safe:transition shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs font-semibold text-on-dark/80">
                {stage < 2 ? `Step ${stage + 1} of 2` : "Ready"}
              </span>
              <span className="text-xs text-on-dark/50">{STAGE_LABELS[stage]}</span>
            </div>
            <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-teal motion-safe:transition-[width] motion-safe:duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div key={stage} className="step-enter">
          {stage === 0 && (
            <section className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5 sm:p-7 space-y-7">
              <header>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-on-dark leading-tight">Your trip</h1>
                <p className="text-sm text-on-dark/65 mt-1.5">{microcopy}</p>
              </header>

              <div className="space-y-4">
                <SelectField label="Country of residence" value={form.residenceCountry}
                  onChange={(v) => set("residenceCountry", v)} error={errors.residenceCountry}
                  placeholder="Select country">
                  {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectField>
                <TextField label="Departure city" value={form.departureCity}
                  onChange={(v) => set("departureCity", v)} error={errors.departureCity}
                  placeholder="e.g. London" />
                <SelectField label="Citizenship" value={form.citizenship}
                  onChange={(v) => set("citizenship", v)} error={errors.citizenship}
                  placeholder="Select citizenship">
                  {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectField>
              </div>

              <div className="space-y-4">
                <SelectField label="Travel month" value={form.travelMonth}
                  onChange={(v) => set("travelMonth", v)} error={errors.travelMonth}
                  placeholder="Choose a month or flexible">
                  <SelectItem value="flexible">Flexible / anytime</SelectItem>
                  {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectField>
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-on-dark/80">Trip length</span>
                    <span className="font-display font-bold text-on-dark text-lg">{form.travelDays} days</span>
                  </div>
                  <p className="text-xs text-on-dark/50 mt-1">All travel time, including flights and transfers.</p>
                  <div className="mt-2">
                    <Slider dark value={[form.travelDays]} min={3} max={14} step={1}
                      onValueChange={(v) => set("travelDays", v[0])} aria-label="Total trip length in days" />
                  </div>
                  <div className="flex justify-between text-xs text-on-dark/50 mt-1">
                    <span>3 days</span><span>14 days</span>
                  </div>
                  {errors.travelDays && <p className="text-coral text-sm mt-1.5">{errors.travelDays}</p>}
                </div>
                <Segmented label="Destinations inside your country of residence?"
                  value={form.travelScope}
                  onChange={(v) => set("travelScope", v)}
                  options={[
                    { value: "both", label: "Both" },
                    { value: "international", label: "International only" },
                    { value: "domestic", label: "Domestic only" }
                  ]} />
              </div>

              <TileGroup label="Travelling as" value={form.travellerType}
                onChange={(v) => set("travellerType", v)} error={errors.travellerType}
                icons={TRAVELLER_ICONS}
                options={TRAVELLER_TYPES.map((t) => ({ value: t, label: t }))} />

              <div>
                <span className="text-sm font-medium text-on-dark/80">Interests</span>
                <p className="text-xs text-on-dark/50 mt-1">Select all that appeal.</p>
                <div role="group" aria-label="Interests" className="mt-2">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {INTERESTS.map((i) => {
                      const on = form.interests.includes(i);
                      const IIcon = INTEREST_ICONS[i];
                      return (
                        <button key={i} type="button" aria-pressed={on}
                          onClick={() => toggleInterest(i)}
                          className={`min-h-12 px-3 py-2.5 rounded-xl text-left flex items-center gap-2.5 motion-safe:transition motion-safe:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${
                            on ? "bg-teal text-cinema ring-1 ring-teal" : "bg-white/5 text-on-dark ring-1 ring-white/10 hover:bg-white/10"
                          }`}>
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${on ? "bg-cinema/15 text-cinema" : "bg-white/10 text-on-dark/70"}`}>
                            {IIcon && <IIcon className="w-4 h-4" />}
                          </span>
                          <span className="text-sm font-medium flex-1">{i}</span>
                          {on && <Check className="w-4 h-4 text-cinema shrink-0" aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                  {errors.interests && <p className="text-coral text-sm mt-2">{errors.interests}</p>}
                </div>
              </div>
            </section>
          )}

          {stage === 1 && (
            <section className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5 sm:p-7 space-y-7">
              <header>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-on-dark leading-tight">Your travel style</h1>
                <p className="text-sm text-on-dark/65 mt-1.5">{microcopy}</p>
              </header>

              <PrefSlider label="Budget" value={form.budget}
                onChange={(v) => set("budget", v)} error={errors.budget}
                points={BUDGET_POINTS} ariaLabel="Budget level" />

              <PrefSlider label="Weather" value={form.climate}
                onChange={(v) => set("climate", v)} error={errors.climate}
                points={CLIMATE_POINTS} ariaLabel="Preferred weather" noPref noPrefLabel="No preference" />

              <PrefSlider label="Pace" value={form.pace}
                onChange={(v) => set("pace", v)} error={errors.pace}
                points={PACE_POINTS} ariaLabel="Preferred pace" noPref noPrefLabel="No preferred pace" />

              <PrefSlider label="Activity" value={form.activity}
                onChange={(v) => set("activity", v)} error={errors.activity}
                points={ACTIVITY_POINTS} ariaLabel="Activity level" noPref noPrefLabel="No preference" />

              {/* Optional refinements (collapsible) — preserves dietary / visited / excluded */}
              <div className="pt-2 border-t border-white/10">
                <button type="button" onClick={() => setShowRefinements((o) => !o)}
                  aria-expanded={showRefinements}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-on-dark/80 hover:text-on-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal rounded">
                  More refinements (optional)
                  <ChevronDown className={`w-4 h-4 motion-safe:transition-transform motion-safe:duration-200 ${showRefinements ? "rotate-180" : ""}`} />
                </button>
                {showRefinements && (
                  <div className="mt-4 space-y-4 step-enter">
                    <SelectField label="Dietary considerations" value={form.dietary}
                      onChange={(v) => set("dietary", v)} error={errors.dietary}
                      placeholder="Select an option">
                      {DIETARY.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectField>
                    {form.dietary === "Other" && (
                      <TextField label="Please specify" value={form.dietaryOther}
                        onChange={(v) => set("dietaryOther", v)} placeholder="e.g. Kosher, pescatarian" />
                    )}
                    <TextField label="Previously visited countries (optional)" value={form.visitedCountries}
                      onChange={(v) => set("visitedCountries", v)}
                      placeholder="Comma-separated, e.g. Japan, Portugal" />
                    <TextField label="Destinations to exclude (optional)" value={form.excludedDestinations}
                      onChange={(v) => set("excludedDestinations", v)}
                      placeholder="Comma-separated, e.g. Iceland, Thailand" />
                  </div>
                )}
              </div>
            </section>
          )}

          {stage === 2 && (
            <section className="text-center py-10 sm:py-16">
              <div className="mx-auto w-16 h-16 rounded-full bg-teal/15 ring-1 ring-teal/30 flex items-center justify-center mb-6">
                <Sparkles className="w-7 h-7 text-teal" aria-hidden="true" />
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-on-dark">Your Travel Fit is ready.</h1>
              <p className="text-on-dark/70 mt-3 max-w-md mx-auto">
                We've matched your trip and style. Reveal your top destinations.
              </p>
              <button type="button" onClick={reveal} className={`${PRIMARY_CTA} mt-8`}>
                Reveal my matches <ArrowRight className="w-4 h-4" />
              </button>
            </section>
          )}
        </div>

        {/* Subtle next control between the two input screens */}
        {stage < 2 && (
          <div className="flex justify-end mt-6">
            <button
              type="button"
              onClick={advance}
              aria-label={`Next: ${stage === 0 ? "Your travel style" : "Your matches"}`}
              className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-teal text-cinema font-semibold shadow-[0_10px_30px_-12px_rgba(2,218,227,0.6)] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark motion-safe:transition"
            >
              {stage === 0 ? "Travel style" : "See matches"} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RevealOverlay({ barW }) {
  return (
    <div className="fixed inset-0 z-50 bg-cinema flex flex-col items-center justify-center" role="status" aria-live="polite">
      <div className="text-center px-6">
        <div className="relative w-14 h-14 mx-auto mb-6">
          <span className="absolute inset-0 rounded-full bg-teal/20 motion-safe:animate-ping opacity-60" aria-hidden="true" />
          <span className="relative inline-flex w-14 h-14 rounded-full bg-teal items-center justify-center">
            <Compass className="w-6 h-6 text-cinema" aria-hidden="true" />
          </span>
        </div>
        <p className="font-display text-xl font-semibold text-on-dark">Finding your Travel Fit…</p>
        <div className="mt-5 w-48 mx-auto h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-teal motion-safe:transition-[width] motion-safe:duration-1000 ease-out"
            style={{ width: `${barW}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------- dark-surface building blocks ---------- */

function TextField({ label, value, onChange, error, placeholder }) {
  return (
    <div>
      <span className="text-sm font-medium text-on-dark/80">{label}</span>
      <Input value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        className="mt-2 min-h-11 bg-white/10 border-white/15 text-on-dark placeholder:text-on-dark/40 focus-visible:ring-teal" />
      {error && <p className="text-coral text-sm mt-2">{error}</p>}
    </div>
  );
}

function SelectField({ label, value, onChange, error, placeholder, children }) {
  return (
    <div>
      <span className="text-sm font-medium text-on-dark/80">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-2 min-h-11 bg-white/10 border-white/15 text-on-dark hover:bg-white/15 focus-visible:ring-teal"
          aria-label={label} aria-invalid={!!error}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
      {error && <p className="text-coral text-sm mt-2">{error}</p>}
    </div>
  );
}

function TileGroup({ label, value, onChange, options, error, icons }) {
  return (
    <div>
      <span className="text-sm font-medium text-on-dark/80">{label}</span>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-2">
        {options.map((o) => {
          const on = value === o.value;
          const IIcon = icons[o.value];
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on}
              onClick={() => onChange(o.value)}
              className={`min-h-14 px-3 py-3 rounded-2xl text-left flex flex-col items-start gap-2 motion-safe:transition motion-safe:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${
                on ? "bg-teal text-cinema ring-1 ring-teal" : "bg-white/5 text-on-dark ring-1 ring-white/10 hover:bg-white/10"
              }`}>
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${on ? "bg-cinema/15 text-cinema" : "bg-white/10 text-on-dark/70"}`}>
                {IIcon && <IIcon className="w-5 h-5" />}
              </span>
              <span className="text-sm font-medium">{o.label}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="text-coral text-sm mt-2">{error}</p>}
    </div>
  );
}

function Segmented({ label, value, onChange, options }) {
  return (
    <div>
      <span className="text-sm font-medium text-on-dark/80">{label}</span>
      <div role="radiogroup" aria-label={label}
        className="mt-2 inline-flex w-full rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on}
              onClick={() => onChange(o.value)}
              className={`flex-1 min-h-10 px-3 rounded-lg text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${
                on ? "bg-white/15 text-on-dark shadow-sm" : "text-on-dark/60 hover:text-on-dark"
              }`}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Live-value snap slider field for ordered preferences (budget, climate, pace,
// activity). `noPref` enables a "No preference" opt-out chip; when active the
// slider is dimmed and the literal "No preference" string is stored.
function PrefSlider({ label, value, onChange, error, points, ariaLabel, noPref, noPrefLabel }) {
  const isNoPref = noPref && value === "No preference";
  const index = points.findIndex((p) => p.value === value);
  const current = index >= 0 ? points[index] : null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-on-dark/80">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`font-display text-xl font-bold ${isNoPref || !current ? "text-on-dark/60" : "text-on-dark"}`}>
            {isNoPref ? (noPrefLabel || "No preference") : current ? current.label : "—"}
          </span>
          {current && !isNoPref && current.icon && <current.icon className="w-4 h-4 text-teal" aria-hidden="true" />}
        </div>
      </div>
      <div className="mt-2">
        <SnapSlider dark points={points} value={isNoPref ? "" : value} onChange={onChange}
          ariaLabel={ariaLabel || label} dimmed={isNoPref} />
      </div>
      {noPref && (
        <div className="mt-2">
          <button type="button" aria-pressed={isNoPref}
            onClick={() => onChange(isNoPref ? "" : "No preference")}
            className={`inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${
              isNoPref ? "bg-teal text-cinema" : "bg-white/5 text-on-dark/70 ring-1 ring-white/10 hover:bg-white/10"
            }`}>
            <Compass className="w-3.5 h-3.5" aria-hidden="true" /> {noPrefLabel || "No preference"}
          </button>
        </div>
      )}
      {error && <p className="text-coral text-sm mt-2">{error}</p>}
    </div>
  );
}