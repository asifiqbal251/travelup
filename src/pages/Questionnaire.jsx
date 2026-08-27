import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from "@/components/ui/select";
import {
  ArrowLeft, ArrowRight, Check,
  User, Heart, Users, Baby, Wallet, Banknote, Gem, Crown,
  Sun, CloudSun, Cloud, Snowflake, Compass, Coffee, Scale, Zap,
  Feather, Footprints, Bike, Mountain, Trees, Landmark, UtensilsCrossed,
  Waves, Bird, Building2, Armchair, Camera
} from "lucide-react";
import {
  MONTHS, INTERESTS, CLIMATES, PACES, ACTIVITIES, DIETARY,
  TRAVELLER_TYPES, BUDGETS, COUNTRIES
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
    <div className="max-w-3xl mx-auto px-4 py-8 pb-24 sm:pb-10">
      {/* Progress header */}
      <div className="mb-8">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <span className="font-display text-2xl font-bold text-ink">{STEPS[step]}</span>
          <span className="text-sm text-muted-foreground">Step {step + 1} of {STEPS.length}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-teal rounded-full motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="space-y-7">
        {step === 0 && (
          <Step title="Your travel basics" subtitle="So we can tailor your travel recommendations.">
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
          <Step title="When and for how long" subtitle="Month helps us match the right season.">
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
              <p className="text-xs text-muted-foreground mt-1">Include all travel time—from leaving home until returning—including flights, driving, trains, buses, ferries and transfers.</p>
              <div className="mt-3">
                <Slider value={[form.travelDays]} min={3} max={14} step={1}
                  onValueChange={(v) => set("travelDays", v[0])} aria-label="Total trip length in days" />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>3 days</span><span>14 days</span>
              </div>
              {errors.travelDays && <ErrorText>{errors.travelDays}</ErrorText>}
            </div>
            <Segmented label="May we recommend destinations inside your country of residence?"
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
          <Step title="Your trip style" subtitle="Who you travel with and what you can spend.">
            <TileGroup label="Travelling as" value={form.travellerType}
              onChange={(v) => set("travellerType", v)} error={errors.travellerType}
              icons={TRAVELLER_ICONS}
              options={TRAVELLER_TYPES.map((t) => ({ value: t, label: t }))} />
            <TileGroup label="Budget per person (excluding international flights)" value={form.budget}
              onChange={(v) => set("budget", v)} error={errors.budget}
              icons={BUDGET_ICONS}
              options={BUDGETS.map((b, i) => ({
                value: b, label: b,
                desc: ["Lower-cost", "Mid-range", "Higher comfort", "Top-end"][i]
              }))} />
          </Step>
        )}

        {step === 3 && (
          <Step title="What do you love?" subtitle="Select all that appeal to you.">
            <div role="group" aria-label="Interests">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {INTERESTS.map((i) => {
                  const on = form.interests.includes(i);
                  const IIcon = INTEREST_ICONS[i];
                  return (
                    <button key={i} type="button" aria-pressed={on}
                      onClick={() => toggleInterest(i)}
                      className={`group min-h-16 px-4 py-4 rounded-2xl text-left flex flex-col gap-2 motion-safe:transition motion-safe:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${
                        on ? "bg-teal/15 ring-1 ring-teal" : "bg-card hover:bg-teal/5 ring-1 ring-border"
                      }`}>
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${on ? "bg-teal text-cinema" : "bg-muted text-muted-foreground"}`}>
                        {IIcon && <IIcon className="w-5 h-5" />}
                      </span>
                      <span className={`text-sm font-medium ${on ? "text-ink" : "text-ink/90"}`}>{i}</span>
                      {on && <Check className="w-4 h-4 text-teal self-end" />}
                    </button>
                  );
                })}
              </div>
              {errors.interests && <ErrorText>{errors.interests}</ErrorText>}
            </div>
          </Step>
        )}

        {step === 4 && (
          <Step title="Your preferences" subtitle="Climate, pace and how active you want to be.">
            <TileGroup label="Preferred climate" value={form.climate}
              onChange={(v) => set("climate", v)} error={errors.climate}
              icons={CLIMATE_ICONS}
              options={CLIMATES.map((c) => ({ value: c, label: c }))} />
            <TileGroup label="Preferred pace" value={form.pace}
              onChange={(v) => set("pace", v)} error={errors.pace}
              icons={PACE_ICONS}
              options={PACES.map((p) => ({ value: p, label: p }))} />
            <TileGroup label="Preferred physical activity" value={form.activity}
              onChange={(v) => set("activity", v)} error={errors.activity}
              icons={ACTIVITY_ICONS}
              options={ACTIVITIES.map((a) => ({ value: a, label: a }))} />
          </Step>
        )}

        {step === 5 && (
          <Step title="A few more details" subtitle="Optional fields help us refine your matches.">
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
          <Step title="Review your answers" subtitle="Make any changes before we find your matches.">
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
              Next <ArrowRight className="w-4 h-4 ml-2 flex-shrink-0" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting}
              className="bg-coral hover:bg-coral/90 text-white min-h-11 w-full sm:w-auto max-w-full whitespace-normal break-words text-center">
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

function Step({ title, subtitle, children }) {
  return (
    <div>
      <h1 className="font-display text-xl font-bold text-ink">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground mt-1 mb-5">{subtitle}</p>}
      <div className="space-y-6">{children}</div>
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

// Icon-supported selection tiles for mutually exclusive choices.
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
              className={`min-h-16 px-3 py-3 rounded-2xl text-left flex flex-col items-start gap-2 motion-safe:transition motion-safe:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${
                on ? "bg-teal/15 ring-1 ring-teal" : "bg-card hover:bg-teal/5 ring-1 ring-border"
              }`}>
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${on ? "bg-teal text-cinema" : "bg-muted text-muted-foreground"}`}>
                {IIcon && <IIcon className="w-5 h-5" />}
              </span>
              <span className="flex-1">
                <span className={`block text-sm font-medium ${on ? "text-ink" : "text-ink/90"}`}>{o.label}</span>
                {o.desc && <span className="block text-xs text-muted-foreground mt-0.5">{o.desc}</span>}
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
              className={`flex-1 min-h-11 px-3 rounded-lg text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${
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

function ReviewRow({ label, value }) {
  return (
    <div className="py-3 flex justify-between gap-4">
      <dt className="text-sm text-muted-foreground flex-shrink-0">{label}</dt>
      <dd className="text-sm font-medium text-right text-ink">{value}</dd>
    </div>
  );
}