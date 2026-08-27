import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import SnapSlider from "@/components/SnapSlider";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from "@/components/ui/select";
import {
  ArrowLeft, ArrowRight, Check, Compass,
  User, Heart, Users, Baby, Wallet, Banknote, Gem, Crown,
  Sun, CloudSun, Cloud, Snowflake, Coffee, Scale, Zap,
  Feather, Footprints, Bike, Mountain, Trees, Landmark, UtensilsCrossed,
  Waves, Bird, Building2, Armchair, Camera
} from "lucide-react";
import {
  MONTHS, INTERESTS, DIETARY, TRAVELLER_TYPES, COUNTRIES,
  BUDGET_ORDER, PACE_ORDER, ACTIVITY_ORDER, CLIMATE_ORDER
} from "@/lib/options";
import { setPrefs, getPrefs, setSelectedDestinationId } from "@/lib/storage";

const STEPS = [
  "Your travel basics",
  "Timing",
  "Trip style",
  "Your interests",
  "Preferences",
  "Details",
  "Review"
];

const TRAVELLER_ICONS = { Solo: User, Couple: Heart, Friends: Users, Family: Baby };
const BUDGET_ICONS = { Budget: Wallet, Moderate: Banknote, Comfortable: Gem, Premium: Crown };
const CLIMATE_ICONS = { Warm: Sun, Mild: CloudSun, Cool: Cloud, "Cold or snowy": Snowflake, "No preference": Compass };
const PACE_ICONS = { Relaxed: Coffee, Balanced: Scale, "Fast-paced": Zap };
const ACTIVITY_ICONS = { Light: Feather, Moderate: Footprints, Active: Bike, "Highly active": Mountain };
const INTEREST_ICONS = {
  "Nature": Trees, "History and culture": Landmark, "Food": UtensilsCrossed,
  "Beaches": Waves, "Hiking": Mountain, "Wildlife": Bird, "Adventure": Compass,
  "Cities": Building2, "Relaxation": Armchair, "Photography": Camera
};

// Ordered scales used by the scoring engine — the slider stores these exact
// string values; no new backend vocabulary is introduced.
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

export default function Questionnaire() {
  const navigate = useNavigate();
  const [step, setStep] = useState(() => {
    if (!getPrefs()) return 0;
    const s = Number(new URLSearchParams(window.location.search).get("step"));
    return Number.isFinite(s) && s >= 0 && s < STEPS.length ? Math.floor(s) : 0;
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
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e = {};
    if (step === 0) {
      if (!form.residenceCountry) e.residenceCountry = "Please select your country of residence.";
      if (!form.departureCity.trim()) e.departureCity = "Please enter your departure city.";
      if (!form.citizenship) e.citizenship = "Please select your citizenship.";
    }
    if (step === 1) {
      if (!form.travelMonth) e.travelMonth = "Please choose a month or flexible.";
      if (!form.travelDays || form.travelDays < 3 || form.travelDays > 14)
        e.travelDays = "Choose between 3 and 14 days.";
    }
    if (step === 2) {
      if (!form.travellerType) e.travellerType = "Please select who you are travelling with.";
      if (!form.budget) e.budget = "Please select a budget level.";
    }
    if (step === 3) {
      if (!form.interests.length) e.interests = "Pick at least one interest.";
    }
    if (step === 4) {
      if (!form.climate) e.climate = "Please choose a climate preference.";
      if (!form.pace) e.pace = "Please choose a preferred pace.";
      if (!form.activity) e.activity = "Please choose an activity level.";
    }
    if (step === 5) {
      if (!form.dietary) e.dietary = "Please select a dietary option.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate()) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submit = () => {
    setSubmitError("");
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      const toArray = (v) =>
        Array.isArray(v)
          ? v.map((s) => String(s).trim()).filter(Boolean)
          : v
          ? String(v).split(",").map((s) => s.trim()).filter(Boolean)
          : [];
      const prefs = {
        ...form,
        departureCity: form.departureCity.trim(),
        dietary: form.dietary === "Other" ? (form.dietaryOther || "").trim() || "Other" : form.dietary,
        visitedCountries: toArray(form.visitedCountries),
        excludedDestinations: toArray(form.excludedDestinations)
      };
      setPrefs(prefs);
      setSelectedDestinationId(null);
      navigate("/results");
    } catch (e) {
      setSubmitError("Something went wrong saving your answers. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleInterest = (i) =>
    set("interests", form.interests.includes(i)
      ? form.interests.filter((x) => x !== i)
      : [...form.interests, i]);

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-24 sm:pb-12">
      {/* Subtle progress: "3 / 7" + thin teal bar */}
      <div className="mb-8">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <span className="text-sm font-semibold text-ink">
            {step + 1} <span className="text-muted-foreground font-normal">/ {STEPS.length}</span>
          </span>
          <span className="text-xs text-muted-foreground">{STEPS[step]}</span>
        </div>
        <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-teal motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div key={step} className="step-enter space-y-7">
        {step === 0 && (
          <Step question="Where are you starting from?" hint="So we can tailor your matches.">
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
          </Step>
        )}

        {step === 1 && (
          <Step question="When works for you?" hint="Month helps us match the right season.">
            <SelectField label="Preferred travel month" value={form.travelMonth}
              onChange={(v) => set("travelMonth", v)} error={errors.travelMonth}
              placeholder="Choose a month or flexible">
              <SelectItem value="flexible">Flexible / anytime</SelectItem>
              {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectField>
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <Label>Total trip length</Label>
                <span className="font-display font-bold text-ink text-lg">{form.travelDays} days</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Include all travel time — flights, driving, trains, ferries and transfers.</p>
              <div className="mt-3">
                <Slider value={[form.travelDays]} min={3} max={14} step={1}
                  onValueChange={(v) => set("travelDays", v[0])} aria-label="Total trip length in days" />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>3 days</span><span>14 days</span>
              </div>
              {errors.travelDays && <ErrorText>{errors.travelDays}</ErrorText>}
            </div>
            <Segmented label="Include destinations inside your country of residence?"
              value={form.travelScope}
              onChange={(v) => set("travelScope", v)}
              options={[
                { value: "both", label: "Both" },
                { value: "international", label: "International only" },
                { value: "domestic", label: "Domestic only" }
              ]} />
          </Step>
        )}

        {step === 2 && (
          <Step question="Who's going, and what's your budget?" hint="Budget per person, excluding international flights.">
            <TileGroup label="Travelling as" value={form.travellerType}
              onChange={(v) => set("travellerType", v)} error={errors.travellerType}
              icons={TRAVELLER_ICONS}
              options={TRAVELLER_TYPES.map((t) => ({ value: t, label: t }))} />
            <PrefSlider label="Budget" value={form.budget}
              onChange={(v) => set("budget", v)} error={errors.budget}
              points={BUDGET_POINTS} ariaLabel="Budget level" />
          </Step>
        )}

        {step === 3 && (
          <Step question="What do you love?" hint="Select all that appeal.">
            <div role="group" aria-label="Interests">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {INTERESTS.map((i) => {
                  const on = form.interests.includes(i);
                  const IIcon = INTEREST_ICONS[i];
                  return (
                    <button key={i} type="button" aria-pressed={on}
                      onClick={() => toggleInterest(i)}
                      className={`min-h-14 px-3 py-3 rounded-xl text-left flex items-center gap-2.5 motion-safe:transition motion-safe:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
                        on ? "bg-ink ring-1 ring-ink text-on-dark" : "bg-card hover:bg-muted ring-1 ring-border text-ink"
                      }`}>
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${on ? "bg-on-dark/15 text-on-dark" : "bg-muted text-muted-foreground"}`}>
                        {IIcon && <IIcon className="w-4 h-4" />}
                      </span>
                      <span className="text-sm font-medium flex-1">{i}</span>
                      {on && <Check className="w-4 h-4 text-on-dark shrink-0" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
              {errors.interests && <ErrorText>{errors.interests}</ErrorText>}
            </div>
          </Step>
        )}

        {step === 4 && (
          <Step question="What feels right?" hint="Weather, pace and how active you want to be.">
            <ClimateField value={form.climate} onChange={(v) => set("climate", v)} error={errors.climate} />
            <PrefSlider label="Pace" value={form.pace}
              onChange={(v) => set("pace", v)} error={errors.pace}
              points={PACE_POINTS} ariaLabel="Preferred pace" />
            <PrefSlider label="Activity" value={form.activity}
              onChange={(v) => set("activity", v)} error={errors.activity}
              points={ACTIVITY_POINTS} ariaLabel="Activity level" />
          </Step>
        )}

        {step === 5 && (
          <Step question="Anything else?" hint="Optional, but it helps us refine your matches.">
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
          </Step>
        )}

        {step === 6 && (
          <Step question="Ready to see your matches?" hint="Check your answers below.">
            <dl className="divide-y divide-border">
              <ReviewRow label="Residence / departure / citizenship"
                value={`${form.residenceCountry || "—"} · ${form.departureCity || "—"} · ${form.citizenship || "—"}`} />
              <ReviewRow label="When" value={form.travelMonth === "flexible" || !form.travelMonth ? "Flexible" : MONTHS[Number(form.travelMonth) - 1]} />
              <ReviewRow label="Total trip" value={`${form.travelDays} days, including travel time`} />
              <ReviewRow label="Domestic" value={
                form.travelScope === "international" ? "International only"
                  : form.travelScope === "domestic" ? "Domestic only"
                  : "Both"
              } />
              <ReviewRow label="Traveller & budget" value={`${form.travellerType || "—"} · ${form.budget || "—"}`} />
              <ReviewRow label="Interests" value={form.interests.join(", ") || "—"} />
              <ReviewRow label="Climate / pace / activity" value={`${form.climate || "—"} · ${form.pace || "—"} · ${form.activity || "—"}`} />
              <ReviewRow label="Dietary" value={form.dietary === "Other" ? form.dietaryOther || "Other" : form.dietary} />
              <ReviewRow label="Visited" value={form.visitedCountries || "None"} />
              <ReviewRow label="Excluded" value={form.excludedDestinations || "None"} />
            </dl>
            {submitError && <ErrorText>{submitError}</ErrorText>}
          </Step>
        )}
      </div>

      {/* Sticky action area on mobile; inline on desktop */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-workflow/95 backdrop-blur border-t border-border px-4 py-3 sm:static sm:bg-transparent sm:border-0 sm:backdrop-blur-0 sm:py-0 sm:mt-8">
        <div className="max-w-3xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:pt-6 sm:border-t sm:border-border">
          <Button variant="ghost" onClick={back} disabled={step === 0}
            className="min-h-11 w-full sm:w-auto justify-center">
            <ArrowLeft className="w-4 h-4 mr-2 flex-shrink-0" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}
              className="bg-ink hover:bg-ink/90 text-on-dark min-h-11 w-full sm:w-auto">
              Continue <ArrowRight className="w-4 h-4 ml-2 flex-shrink-0" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting}
              className="bg-ink hover:bg-ink/90 text-on-dark shadow-lg min-h-12 w-full sm:w-auto px-8 text-base">
              {submitting ? "Finding recommendations…" : "See my recommendations"}
              {!submitting && <ArrowRight className="w-4 h-4 ml-2 flex-shrink-0" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- small building blocks ---------- */

function Step({ question, hint, children }) {
  return (
    <div>
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink leading-tight">{question}</h1>
      {hint && <p className="text-sm text-muted-foreground mt-1.5">{hint}</p>}
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  );
}

function ErrorText({ children }) {
  return <p role="alert" className="text-sm text-destructive mt-2">{children}</p>;
}

function TextField({ label, value, onChange, error, placeholder }) {
  return (
    <div>
      <Label htmlFor={label}>{label}</Label>
      <Input id={label} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error} className="mt-2 min-h-11 bg-card" />
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function SelectField({ label, value, onChange, error, placeholder, children }) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-2 min-h-11 bg-card" aria-label={label} aria-invalid={!!error}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {children}
        </SelectContent>
      </Select>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

// Icon-supported selection tiles for mutually exclusive categorical choices
// (traveller type). Ordered preferences use SnapSlider / PrefSlider instead.
function TileGroup({ label, value, onChange, options, error, icons }) {
  return (
    <div>
      <span className="text-sm font-medium text-ink">{label}</span>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
        {options.map((o) => {
          const on = value === o.value;
          const IIcon = icons[o.value];
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on}
              onClick={() => onChange(o.value)}
              className={`min-h-14 px-3 py-3 rounded-2xl text-left flex flex-col items-start gap-2 motion-safe:transition motion-safe:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
                on ? "bg-ink ring-1 ring-ink text-on-dark" : "bg-card hover:bg-muted ring-1 ring-border text-ink"
              }`}>
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${on ? "bg-on-dark/15 text-on-dark" : "bg-muted text-muted-foreground"}`}>
                {IIcon && <IIcon className="w-5 h-5" />}
              </span>
              <span className="flex-1">
                <span className={`block text-sm font-medium ${on ? "text-on-dark" : "text-ink/90"}`}>{o.label}</span>
              </span>
            </button>
          );
        })}
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

// Compact segmented control for short mutually exclusive choices (travel scope).
function Segmented({ label, value, onChange, options }) {
  return (
    <div>
      <span className="text-sm font-medium text-ink">{label}</span>
      <div role="radiogroup" aria-label={label}
        className="mt-2 inline-flex w-full rounded-xl bg-muted p-1 ring-1 ring-border">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on}
              onClick={() => onChange(o.value)}
              className={`flex-1 min-h-11 px-3 rounded-lg text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
                on ? "bg-card text-ink shadow-sm" : "text-muted-foreground hover:text-ink"
              }`}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Live-value snap slider field for ordered preferences (budget, pace, activity).
function PrefSlider({ label, value, onChange, error, points, ariaLabel }) {
  const index = points.findIndex((p) => p.value === value);
  const current = index >= 0 ? points[index] : null;
  return (
    <div>
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="mt-1 flex items-center gap-2 min-h-9">
        <span className={`font-display text-2xl font-bold ${current ? "text-ink" : "text-muted-foreground"}`}>
          {current ? current.label : "—"}
        </span>
        {current?.icon && <current.icon className="w-5 h-5 text-teal" aria-hidden="true" />}
      </div>
      <div className="mt-2">
        <SnapSlider points={points} value={value} onChange={onChange} ariaLabel={ariaLabel || label} />
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

// Climate uses the 4-point ordered slider plus a separate "No preference"
// toggle, preserving the full controlled vocabulary expected by the engine.
function ClimateField({ value, onChange, error }) {
  const isNoPref = value === "No preference";
  const ActiveIcon = !isNoPref && value ? CLIMATE_ICONS[value] : null;
  return (
    <div>
      <span className="text-sm font-medium text-ink">Weather</span>
      <div className="mt-1 flex items-center gap-2 min-h-9">
        <span className={`font-display text-2xl font-bold ${value && !isNoPref ? "text-ink" : "text-muted-foreground"}`}>
          {isNoPref ? "No preference" : (value || "—")}
        </span>
        {ActiveIcon && <ActiveIcon className="w-5 h-5 text-teal" aria-hidden="true" />}
      </div>
      <div className="mt-2">
        <SnapSlider points={CLIMATE_POINTS} value={isNoPref ? "" : value} onChange={onChange}
          ariaLabel="Preferred weather" dimmed={isNoPref} />
      </div>
      <div className="mt-2">
        <button type="button" aria-pressed={isNoPref}
          onClick={() => onChange(isNoPref ? "" : "No preference")}
          className={`inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
            isNoPref ? "bg-ink text-on-dark" : "bg-muted text-muted-foreground hover:text-ink ring-1 ring-border"
          }`}>
          <Compass className="w-4 h-4" aria-hidden="true" /> No preference
        </button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div className="py-3 flex justify-between gap-4">
      <dt className="text-sm text-muted-foreground flex-shrink-0">{label}</dt>
      <dd className="text-sm font-medium text-right text-ink">{value}</dd>
    </div>
  );
}