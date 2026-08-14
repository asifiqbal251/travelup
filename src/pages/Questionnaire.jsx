import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
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

const blank = {
  residenceCountry: "",
  departureCity: "",
  citizenship: "",
  allowDomestic: true,
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
    // Deep-link from Results revision suggestions without clearing answers.
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex justify-between text-xs text-[#0B1F3A]/60 mb-2">
          <span>Step {step + 1} of {STEPS.length}</span>
          <span>{STEPS[step]}</span>
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="h-2" />
      </div>

      <div className="bg-white rounded-2xl border border-[#E6E2D8] shadow-sm p-6 sm:p-8">
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
              <Label>Number of travel days: <span className="font-semibold text-[#0B1F3A]">{form.travelDays} days</span></Label>
              <div className="mt-3">
                <Slider value={[form.travelDays]} min={3} max={14} step={1}
                  onValueChange={(v) => set("travelDays", v[0])} aria-label="Number of travel days" />
              </div>
              <div className="flex justify-between text-xs text-[#0B1F3A]/50 mt-1">
                <span>3 days</span><span>14 days</span>
              </div>
              {errors.travelDays && <ErrorText>{errors.travelDays}</ErrorText>}
            </div>
            <RadioCards label="May we recommend destinations inside your country of residence?"
              value={form.allowDomestic ? "yes" : "no"}
              onChange={(v) => set("allowDomestic", v === "yes")}
              options={[{ value: "yes", label: "Yes, include domestic trips" }, { value: "no", label: "No, only international" }]} />
          </Step>
        )}

        {step === 2 && (
          <Step title="Your trip style" subtitle="Who you travel with and what you can spend.">
            <RadioCards label="Travelling as" value={form.travellerType}
              onChange={(v) => set("travellerType", v)} error={errors.travellerType}
              options={TRAVELLER_TYPES.map((t) => ({ value: t, label: t }))} />
            <RadioCards label="Budget per person (excluding international flights)" value={form.budget}
              onChange={(v) => set("budget", v)} error={errors.budget}
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
                  return (
                    <button key={i} type="button" aria-pressed={on}
                      onClick={() => toggleInterest(i)}
                      className={`min-h-11 px-4 rounded-xl border text-sm font-medium transition text-left flex items-center gap-2 ${
                        on ? "border-[#2EC4B6] bg-[#2EC4B6]/10 text-[#0B1F3A]"
                          : "border-[#E6E2D8] bg-white hover:border-[#2EC4B6]/60"
                      }`}>
                      <span className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                        on ? "bg-[#2EC4B6] border-[#2EC4B6]" : "border-[#C9C3B6]"
                      }`}>
                        {on && <Check className="w-3 h-3 text-white" />}
                      </span>
                      {i}
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
            <RadioCards label="Preferred climate" value={form.climate}
              onChange={(v) => set("climate", v)} error={errors.climate}
              options={CLIMATES.map((c) => ({ value: c, label: c }))} />
            <RadioCards label="Preferred pace" value={form.pace}
              onChange={(v) => set("pace", v)} error={errors.pace}
              options={PACES.map((p) => ({ value: p, label: p }))} />
            <RadioCards label="Preferred physical activity" value={form.activity}
              onChange={(v) => set("activity", v)} error={errors.activity}
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
            <dl className="divide-y divide-[#E6E2D8]">
              <ReviewRow label="Residence / departure / citizenship"
                value={`${form.residenceCountry || "—"} · ${form.departureCity || "—"} · ${form.citizenship || "—"}`} />
              <ReviewRow label="When" value={`${form.travelMonth === "flexible" || !form.travelMonth ? "Flexible" : MONTHS[Number(form.travelMonth) - 1]} · ${form.travelDays} days`} />
              <ReviewRow label="Domestic" value={form.allowDomestic ? "Included" : "International only"} />
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

        {/* Nav */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-8 pt-6 border-t border-[#E6E2D8]">
          <Button variant="ghost" onClick={back} disabled={step === 0}
            className="min-h-11 w-full sm:w-auto justify-center">
            <ArrowLeft className="w-4 h-4 mr-2 flex-shrink-0" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}
              className="bg-[#0B1F3A] hover:bg-[#0B1F3A]/90 text-white min-h-11 w-full sm:w-auto">
              Next <ArrowRight className="w-4 h-4 ml-2 flex-shrink-0" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting}
              className="bg-[#FF6B5B] hover:bg-[#FF6B5B]/90 text-white min-h-11 w-full sm:w-auto max-w-full whitespace-normal break-words text-center">
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
      <h1 className="text-xl font-semibold">{title}</h1>
      {subtitle && <p className="text-sm text-[#0B1F3A]/60 mt-1 mb-6">{subtitle}</p>}
      <div className="space-y-6">{children}</div>
    </div>
  );
}

function ErrorText({ children }) {
  return <p role="alert" className="text-sm text-[#FF6B5B] mt-2">{children}</p>;
}

function TextField({ label, value, onChange, error, placeholder }) {
  return (
    <div>
      <Label htmlFor={label}>{label}</Label>
      <Input id={label} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error} className="mt-2 min-h-11" />
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function SelectField({ label, value, onChange, error, placeholder, children }) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-2 min-h-11" aria-label={label} aria-invalid={!!error}>
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

function RadioCards({ label, value, onChange, options, error }) {
  return (
    <div>
      <span className="text-sm font-medium">{label}</span>
      <div role="radiogroup" aria-label={label} className="grid sm:grid-cols-2 gap-3 mt-2">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on}
              onClick={() => onChange(o.value)}
              className={`min-h-11 px-4 rounded-xl border text-left transition ${
                on ? "border-[#2EC4B6] bg-[#2EC4B6]/10"
                  : "border-[#E6E2D8] bg-white hover:border-[#2EC4B6]/60"
              }`}>
              <div className="font-medium text-sm">{o.label}</div>
              {o.desc && <div className="text-xs text-[#0B1F3A]/55 mt-0.5">{o.desc}</div>}
            </button>
          );
        })}
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div className="py-3 flex justify-between gap-4">
      <dt className="text-sm text-[#0B1F3A]/55 flex-shrink-0">{label}</dt>
      <dd className="text-sm font-medium text-right">{value}</dd>
    </div>
  );
}