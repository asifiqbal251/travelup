import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Info, MapPin, SlidersHorizontal } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  BLANK_ANSWERS, buildPrefs, QUESTIONS,
} from "@/lib/questionnaireFlow";
import { setPrefsWithHistory, setSelectedDestinationId } from "@/lib/storage";
import DayScroller from "@/components/questionnaire/DayScroller";
import DestinationSearch from "@/components/doorb/DestinationSearch";
import RefineSheet from "@/components/doorb/RefineSheet";
import Logo from "@/components/Logo";
import { MONTHS } from "@/lib/options";
import { cn } from "@/lib/utils";

// ---- Step machine ----

const STEP = {
  SEARCH: "search",
  ESSENTIALS: "essentials",
  REGION: "region",
};

const STEP_GLOW = {
  [STEP.SEARCH]:     "#1E4E6B",
  [STEP.ESSENTIALS]: "#2E4C74",
  [STEP.REGION]:     "#2E4C74",
};

function glowFor(hue) {
  return `radial-gradient(120% 90% at 50% 8%, ${hue} 0%, rgb(var(--wn-page)) 62%)`;
}

const SELECTED_FILL = {
  background: "linear-gradient(180deg, rgba(63,216,224,.16), rgba(63,216,224,.07))",
};

const TRAVELLER_Q = QUESTIONS.find((q) => q.id === "traveller");

// ---- Main page ----

export default function DoorB() {
  const navigate = useNavigate();

  const [destinations, setDestinations] = useState([]);
  const [loadingDests, setLoadingDests] = useState(true);
  const [errorDests, setErrorDests] = useState(false);

  const [step, setStep] = useState(STEP.SEARCH);
  const [selectedDest, setSelectedDest] = useState(null);
  const [answers, setAnswers] = useState({ ...BLANK_ANSWERS });
  const [refineOpen, setRefineOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    base44.entities.Destination.list()
      .then((list) => {
        if (cancelled) return;
        setDestinations(list);
        setLoadingDests(false);
      })
      .catch(() => {
        if (cancelled) return;
        setErrorDests(true);
        setLoadingDests(false);
      });
    return () => { cancelled = true; };
  }, []);

  const setField = (field, value) => setAnswers((a) => ({ ...a, [field]: value }));

  const handleDestinationSelect = (dest) => {
    setSelectedDest(dest);
    setStep(STEP.ESSENTIALS);
  };

  const essentialsComplete = !!answers.travelMonth && !!answers.travellerType;

  const buildAndGo = () => {
    const prefs = buildPrefs(answers);
    setPrefsWithHistory(prefs);
    setSelectedDestinationId(selectedDest.id);
    navigate("/trip");
  };

  const handleEssentialsContinue = () => {
    // Region sub-step only for region-type destinations with an intercity note
    if (
      selectedDest.destination_type === "region" &&
      selectedDest.intercity_note
    ) {
      setStep(STEP.REGION);
    } else {
      buildAndGo();
    }
  };

  const goPrev = () => {
    if (step === STEP.SEARCH) {
      navigate("/");
    } else if (step === STEP.ESSENTIALS) {
      setStep(STEP.SEARCH);
    } else if (step === STEP.REGION) {
      setStep(STEP.ESSENTIALS);
    }
  };

  const minDaysWarning =
    selectedDest &&
    typeof selectedDest.min_days === "number" &&
    selectedDest.min_days > answers.travelDays;

  const glowHue = STEP_GLOW[step] || STEP_GLOW[STEP.SEARCH];

  return (
    <div className="min-h-[100dvh] bg-wn-page text-wn-text grid grid-rows-[auto_1fr_auto] relative overflow-hidden min-w-0">
      {/* Background glow */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div
          className="absolute inset-0 motion-safe:transition-[background] motion-safe:duration-[1100ms] motion-safe:ease-[cubic-bezier(0.2,0.7,0.3,1)]"
          style={{ background: glowFor(glowHue) }}
        />
      </div>

      {/* Screen-reader live region */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {step === STEP.SEARCH
          ? "Where are you going?"
          : step === STEP.ESSENTIALS
          ? "Plan the essentials"
          : "About this region"}
      </div>

      {/* Header */}
      <header className="relative px-4 sm:px-6 pt-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/"
            aria-label="WhereNova home"
            className="shrink-0 leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan rounded"
          >
            <Logo surface="dark" size={26} />
          </Link>
          <span className="text-[12px] text-wn-text-2 tabular-nums shrink-0">
            {step === STEP.SEARCH && "I know where I'm going"}
            {step === STEP.ESSENTIALS && "Plan the essentials"}
            {step === STEP.REGION && "About this region"}
          </span>
        </div>
      </header>

      {/* Main content — vertically centred on the middle grid row */}
      <main className="grid place-items-start px-4 sm:px-6 py-4 outline-none min-h-0 min-w-0 overflow-y-auto">
        <div className="w-full mx-auto max-w-[640px] min-w-0">
          {step === STEP.SEARCH && (
            <SearchStep
              destinations={destinations}
              loading={loadingDests}
              error={errorDests}
              onSelect={handleDestinationSelect}
            />
          )}
          {step === STEP.ESSENTIALS && (
            <EssentialsStep
              dest={selectedDest}
              answers={answers}
              minDaysWarning={minDaysWarning}
              setField={setField}
              onRefine={() => setRefineOpen(true)}
            />
          )}
          {step === STEP.REGION && (
            <RegionStep dest={selectedDest} />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-4 sm:px-6 pb-5 pt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          aria-label={step === STEP.SEARCH ? "Back to home" : "Back"}
          className="inline-flex items-center justify-center h-11 w-11 rounded-full bg-wn-surface/60 ring-1 ring-wn-line-2 text-wn-text hover:bg-wn-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-wn-page motion-safe:transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div>
          {step === STEP.ESSENTIALS && (
            <button
              type="button"
              disabled={!essentialsComplete}
              onClick={handleEssentialsContinue}
              className="wn-cta-dark inline-flex items-center gap-2 h-12 px-7 rounded-xl font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-wn-page motion-safe:transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Build my trip <ArrowRight className="w-4 h-4" />
            </button>
          )}
          {step === STEP.REGION && (
            <button
              type="button"
              onClick={buildAndGo}
              className="wn-cta-dark inline-flex items-center gap-2 h-12 px-7 rounded-xl font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-wn-page motion-safe:transition"
            >
              Build my trip <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </footer>

      <RefineSheet
        open={refineOpen}
        onOpenChange={setRefineOpen}
        answers={answers}
        onApply={(updated) => {
          setAnswers(updated);
          setRefineOpen(false);
        }}
      />
    </div>
  );
}

// ---- Step: Search ----

function SearchStep({ destinations, loading, error, onSelect }) {
  return (
    <section className="step-enter text-center pt-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-wn-cyan mb-3">
        Destination
      </p>
      <h2
        className="font-display font-extrabold tracking-[-0.03em] leading-[1.08] text-wn-text mb-7"
        style={{ fontSize: "clamp(30px, 4.6vw, 50px)" }}
      >
        Where are you going?
      </h2>
      <DestinationSearch
        destinations={destinations}
        loading={loading}
        error={error}
        onSelect={onSelect}
      />
    </section>
  );
}

// ---- Climate alert ----

const ALERT_KEYWORDS = [
  "wet season", "monsoon", "extreme heat", "very hot", "cold", "snowy",
  "snow", "hurricane", "typhoon", "rainy season", "cold and",
];

function ClimateAlert({ dest, monthValue }) {
  const monthIdx = parseInt(monthValue, 10) - 1;
  if (!Number.isFinite(monthIdx) || monthIdx < 0 || monthIdx > 11) return null;
  const entry = Array.isArray(dest.climateByMonth) ? dest.climateByMonth[monthIdx] : null;
  if (!entry) return null;

  const conditions = entry.conditions || "";
  const tempC = entry.avgTempC;
  const low = conditions.toLowerCase();
  const isAlert = ALERT_KEYWORDS.some((kw) => low.includes(kw));

  const tempStr =
    Number.isFinite(tempC)
      ? ` · avg ${Math.round(tempC)}°C`
      : "";

  return (
    <div
      className={cn(
        "mt-4 flex items-start gap-2.5 rounded-xl px-4 py-3 text-[13px] leading-snug",
        isAlert
          ? "bg-wn-amber/10 border border-wn-amber/30 text-wn-text-2"
          : "bg-wn-surface border border-wn-line text-wn-text-3"
      )}
    >
      {isAlert
        ? <AlertTriangle className="shrink-0 mt-px w-4 h-4 text-wn-amber" aria-hidden="true" />
        : <Info className="shrink-0 mt-px w-4 h-4 text-wn-text-3" aria-hidden="true" />
      }
      <span>
        <span className="font-medium text-wn-text-2">{conditions}</span>
        {tempStr && <span className="text-wn-text-3">{tempStr}</span>}
      </span>
    </div>
  );
}

// ---- Step: Essentials ----

function EssentialsStep({ dest, answers, minDaysWarning, setField, onRefine }) {
  return (
    <section className="step-enter pt-2 pb-4">
      {/* Destination pill */}
      <div className="text-center mb-6">
        <span className="inline-flex items-center gap-2 bg-wn-surface/70 ring-1 ring-wn-line rounded-full px-4 py-2 text-[13px] text-wn-text-2">
          <MapPin className="w-3.5 h-3.5 text-wn-cyan shrink-0" aria-hidden="true" />
          <span className="font-medium text-wn-text">{dest.name}</span>
          {dest.country && <span className="text-wn-text-3">{dest.country}</span>}
        </span>
      </div>

      {/* min_days warning — non-blocking, information only */}
      {minDaysWarning && (
        <div className="mb-5 rounded-xl bg-wn-surface border border-wn-line px-4 py-3 text-[13px] text-wn-text-2 text-center">
          <span className="font-semibold text-wn-amber">Note:</span>{" "}
          {dest.name} is typically recommended for at least {dest.min_days} days.
          A {answers.travelDays}-day plan will be compact — we'll do our best.
        </div>
      )}

      {/* When? */}
      <EssentialSection eyebrow="Timing" title="When are you going?">
        <MonthGridInline value={answers.travelMonth} onMonth={(v) => setField("travelMonth", v)} />
        {answers.travelMonth && answers.travelMonth !== "flexible" && (
          <ClimateAlert dest={dest} monthValue={answers.travelMonth} />
        )}
      </EssentialSection>

      {/* How long? */}
      <EssentialSection eyebrow="Duration" title="How long do you have?">
        <DayScroller value={answers.travelDays} onSelect={(n) => setField("travelDays", n)} />
      </EssentialSection>

      {/* Who? */}
      <EssentialSection eyebrow="Company" title="Who's coming?">
        <TravellerChips
          value={answers.travellerType}
          onSelect={(key) => setField("travellerType", key)}
        />
      </EssentialSection>

      {/* Optional: customize further */}
      <div className="text-center mt-8">
        <button
          type="button"
          onClick={onRefine}
          className="inline-flex items-center gap-2 text-[13px] text-wn-text-3 hover:text-wn-text-2 underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan rounded motion-safe:transition"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
          Customize further — pace, budget, interests
        </button>
      </div>
    </section>
  );
}

function EssentialSection({ eyebrow, title, children }) {
  return (
    <div className="mb-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-wn-cyan mb-2 text-center">
        {eyebrow}
      </p>
      <h3
        className="font-display font-extrabold tracking-[-0.02em] text-wn-text text-center mb-5"
        style={{ fontSize: "clamp(22px, 3.4vw, 36px)" }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function MonthGridInline({ value, onMonth }) {
  return (
    <div>
      <div role="radiogroup" aria-label="Travel month" className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {MONTHS.map((m, i) => {
          const val = String(i + 1);
          const on = value === val;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onMonth(val)}
              className={cn(
                "min-h-12 rounded-xl px-2 text-sm font-semibold ring-1 focus:outline-none focus:ring-2 focus:ring-wn-cyan motion-safe:transition",
                on
                  ? "bg-wn-cyan/15 ring-wn-cyan text-wn-text"
                  : "bg-wn-surface/50 ring-wn-line-2 text-wn-text-2 hover:text-wn-text"
              )}
            >
              {m}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onMonth("flexible")}
        className={cn(
          "mt-4 min-h-11 inline-flex items-center px-1 text-[15px] underline underline-offset-4 rounded focus:outline-none focus:ring-2 focus:ring-wn-cyan",
          value === "flexible" ? "text-wn-cyan" : "text-wn-text-2 hover:text-wn-text"
        )}
      >
        I&apos;m flexible
      </button>
    </div>
  );
}

function TravellerChips({ value, onSelect }) {
  return (
    <div role="radiogroup" aria-label="Who's coming?" className="flex flex-wrap gap-[10px] justify-center">
      {TRAVELLER_Q.options.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(o.key)}
            style={on ? SELECTED_FILL : undefined}
            className={cn(
              "inline-flex items-center gap-2 px-5 py-3.5 rounded-xl text-[15px] font-medium motion-safe:transition motion-safe:hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan",
              on
                ? "border-2 border-wn-cyan text-wn-cyan"
                : "border border-wn-line bg-wn-surface text-wn-text hover:border-wn-line-2"
            )}
          >
            {o.label}
            {on && <Check className="w-4 h-4 text-wn-cyan shrink-0" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

// ---- Step: Region ----

function RegionStep({ dest }) {
  const shortName = (() => {
    const n = dest.name || "";
    const i = n.indexOf(",");
    return i > 0 ? n.slice(0, i).trim() : n;
  })();

  return (
    <section className="step-enter text-center pt-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-wn-cyan mb-3">
        Getting around
      </p>
      <h2
        className="font-display font-extrabold tracking-[-0.03em] leading-[1.08] text-wn-text mb-6"
        style={{ fontSize: "clamp(26px, 4vw, 44px)" }}
      >
        Moving around {shortName}
      </h2>
      <div className="mx-auto max-w-[520px] rounded-xl bg-wn-surface border border-wn-line px-5 py-5 text-left">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-wn-text-3 mb-2">
          Good to know
        </p>
        <p className="text-[15px] text-wn-text-2 leading-relaxed">{dest.intercity_note}</p>
      </div>
      <p className="mt-4 text-[13px] text-wn-text-3 max-w-[420px] mx-auto leading-relaxed">
        Your itinerary will account for travel time within the region. Hit "Build my trip" when you're ready.
      </p>
    </section>
  );
}
