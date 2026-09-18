import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Info, MapPin, SlidersHorizontal } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  BLANK_ANSWERS, buildPrefs, QUESTIONS, inferCountry,
} from "@/lib/questionnaireFlow";
import {
  setPrefsWithHistory, setSelectedDestinationId,
  setMultiStopLegs, clearMultiStopLegs, getPrefs,
} from "@/lib/storage";
import { nearestNeighborOrder, fitDestinationsToDays } from "@/lib/tripFit";
import DayScroller from "@/components/questionnaire/DayScroller";
import DestinationSearch from "@/components/doorb/DestinationSearch";
import TripProposal from "@/components/doorb/TripProposal";
import RefineSheet from "@/components/doorb/RefineSheet";
import Logo from "@/components/Logo";
import { MONTHS } from "@/lib/options";
import { cn } from "@/lib/utils";

// ---- Step machine ----

const STEP = {
  SEARCH:    "search",
  DAYS:      "days",
  PROPOSAL:  "proposal",
  ESSENTIALS:"essentials",
  REGION:    "region",
};

const STEP_GLOW = {
  [STEP.SEARCH]:     "#1E4E6B",
  [STEP.DAYS]:       "#1E4E6B",
  [STEP.PROPOSAL]:   "#1E4E6B",
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
  const [multiLegs, setMultiLegs] = useState(null); // [{destination, days}] for combine path
  const [pendingMultiDests, setPendingMultiDests] = useState(null); // ordered route before day budget is known
  const [proposalDroppedCount, setProposalDroppedCount] = useState(0);
  const [proposalFreeDays, setProposalFreeDays] = useState(0);
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
    setMultiLegs(null);
    setStep(STEP.ESSENTIALS);
  };

  // Only orders the destinations; day budget is collected next in DAYS step.
  const handleCombine = (dests) => {
    const storedPrefs = getPrefs();
    const depCity = answers.departureCity || storedPrefs?.departureCity || "";
    const residenceCountry = inferCountry(depCity);
    const ordered = nearestNeighborOrder(dests, depCity, residenceCountry);
    setPendingMultiDests(ordered);
    setSelectedDest(null);
    setStep(STEP.DAYS);
  };

  const essentialsComplete = !!answers.travelMonth && !!answers.travellerType;

  const buildAndGo = () => {
    const prefs = buildPrefs(answers);
    setPrefsWithHistory(prefs);
    if (multiLegs) {
      // Multi-stop: store the ordered leg IDs + days; TripDetail fetches full objects.
      setMultiStopLegs(multiLegs.map((l) => ({ destinationId: l.destination.id, days: l.days })));
      setSelectedDestinationId(null);
    } else {
      clearMultiStopLegs();
      setSelectedDestinationId(selectedDest.id);
    }
    navigate("/trip");
  };

  const handleEssentialsContinue = () => {
    if (multiLegs) {
      // Multi-stop: no region sub-step, go straight to build
      buildAndGo();
      return;
    }
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
    } else if (step === STEP.DAYS) {
      setStep(STEP.SEARCH);
    } else if (step === STEP.PROPOSAL) {
      setStep(STEP.DAYS);
    } else if (step === STEP.ESSENTIALS) {
      setStep(multiLegs ? STEP.PROPOSAL : STEP.SEARCH);
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
          : step === STEP.DAYS
          ? "How long do you have?"
          : step === STEP.PROPOSAL
          ? "Plan your multi-stop trip"
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
            {step === STEP.DAYS && "Multi-stop planner"}
            {step === STEP.PROPOSAL && "Multi-stop planner"}
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
              onCombine={handleCombine}
            />
          )}
          {step === STEP.DAYS && pendingMultiDests && (
            <DaysStep
              pendingMultiDests={pendingMultiDests}
              onContinue={(result) => {
                setMultiLegs(result.legs);
                setProposalDroppedCount(result.droppedCount);
                setProposalFreeDays(result.freeDays);
                setStep(STEP.PROPOSAL);
              }}
            />
          )}
          {step === STEP.PROPOSAL && multiLegs && (
            <ProposalStep
              legs={multiLegs}
              setLegs={setMultiLegs}
              droppedCount={proposalDroppedCount}
              setDroppedCount={setProposalDroppedCount}
              freeDays={proposalFreeDays}
              setFreeDays={setProposalFreeDays}
              pendingMultiDests={pendingMultiDests}
            />
          )}
          {step === STEP.ESSENTIALS && (
            <EssentialsStep
              dest={selectedDest}
              multiLegs={multiLegs}
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
          {step === STEP.PROPOSAL && (
            <button
              type="button"
              disabled={!multiLegs?.length}
              onClick={() => setStep(STEP.ESSENTIALS)}
              className="wn-cta-dark inline-flex items-center gap-2 h-12 px-7 rounded-xl font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-wn-page motion-safe:transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Build full itinerary <ArrowRight className="w-4 h-4" />
            </button>
          )}
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

function SearchStep({ destinations, loading, error, onSelect, onCombine }) {
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
        onCombine={onCombine}
      />
    </section>
  );
}

// ---- Step: Days (new — ask day budget before building the route) ----

function DaysStep({ pendingMultiDests, onContinue }) {
  const [days, setDays] = useState(BLANK_ANSWERS.travelDays);
  const [tooShort, setTooShort] = useState(false);

  const country = pendingMultiDests[0]?.country || "";
  const firstName = pendingMultiDests[0]?.name || "";
  const firstMinDays = pendingMultiDests[0]?.min_days || 1;

  const handleContinue = () => {
    const result = fitDestinationsToDays(pendingMultiDests, days);
    if (result.tooShort) {
      setTooShort(true);
      return;
    }
    setTooShort(false);
    onContinue(result);
  };

  return (
    <section className="step-enter pt-4 pb-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-wn-cyan mb-3 text-center">
        Duration
      </p>
      <h2
        className="font-display font-extrabold tracking-[-0.03em] leading-[1.08] text-wn-text mb-2 text-center"
        style={{ fontSize: "clamp(24px, 3.8vw, 42px)" }}
      >
        How long do you have?
      </h2>
      {country && (
        <p className="text-center text-[14px] text-wn-text-3 mb-7">
          for your {country} trip
        </p>
      )}

      <DayScroller
        value={days}
        onSelect={(n) => { setDays(n); setTooShort(false); }}
      />

      {tooShort && (
        <div className="mt-5 rounded-xl bg-wn-surface border border-wn-line px-4 py-3 text-[13px] text-wn-text-2 text-center">
          <span className="font-semibold text-wn-amber">Not enough time:</span>{" "}
          {firstName} alone needs at least {firstMinDays}d. Try more days, or go back
          and pick a single destination instead.
        </div>
      )}

      <button
        type="button"
        onClick={handleContinue}
        className="mt-8 w-full wn-cta-dark inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-wn-page motion-safe:transition"
      >
        Continue <ArrowRight className="w-4 h-4" />
      </button>
    </section>
  );
}

// ---- Step: Proposal (renamed from LegPlanner) ----

function ProposalStep({
  legs, setLegs,
  droppedCount, setDroppedCount,
  freeDays, setFreeDays,
  pendingMultiDests,
}) {
  const country = legs[0]?.destination?.country || pendingMultiDests?.[0]?.country || "";
  return (
    <section className="step-enter pt-4 pb-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-wn-cyan mb-3 text-center">
        Multi-stop
      </p>
      <h2
        className="font-display font-extrabold tracking-[-0.03em] leading-[1.08] text-wn-text mb-7 text-center"
        style={{ fontSize: "clamp(24px, 3.8vw, 42px)" }}
      >
        {country ? `Your ${country} trip` : "Your route"}
      </h2>
      <TripProposal
        legs={legs}
        setLegs={setLegs}
        droppedCount={droppedCount}
        setDroppedCount={setDroppedCount}
        freeDays={freeDays}
        setFreeDays={setFreeDays}
        orderedDests={pendingMultiDests}
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

function EssentialsStep({ dest, multiLegs, answers, minDaysWarning, setField, onRefine }) {
  return (
    <section className="step-enter pt-2 pb-4">
      {/* Destination pill — single or multi-stop */}
      <div className="text-center mb-6">
        {multiLegs ? (
          <span className="inline-flex items-center gap-2 bg-wn-surface/70 ring-1 ring-wn-line rounded-full px-4 py-2 text-[13px] text-wn-text-2">
            <MapPin className="w-3.5 h-3.5 text-wn-cyan shrink-0" aria-hidden="true" />
            <span className="font-medium text-wn-text">
              {multiLegs.map((l) => l.destination.name).join(" → ")}
            </span>
          </span>
        ) : dest ? (
          <span className="inline-flex items-center gap-2 bg-wn-surface/70 ring-1 ring-wn-line rounded-full px-4 py-2 text-[13px] text-wn-text-2">
            <MapPin className="w-3.5 h-3.5 text-wn-cyan shrink-0" aria-hidden="true" />
            <span className="font-medium text-wn-text">{dest.name}</span>
            {dest.country && <span className="text-wn-text-3">{dest.country}</span>}
          </span>
        ) : null}
      </div>

      {/* min_days warning — non-blocking, single-destination only */}
      {!multiLegs && minDaysWarning && (
        <div className="mb-5 rounded-xl bg-wn-surface border border-wn-line px-4 py-3 text-[13px] text-wn-text-2 text-center">
          <span className="font-semibold text-wn-amber">Note:</span>{" "}
          {dest.name} is typically recommended for at least {dest.min_days} days.
          A {answers.travelDays}-day plan will be compact — we'll do our best.
        </div>
      )}

      {/* When? */}
      <EssentialSection eyebrow="Timing" title="When are you going?">
        <MonthGridInline value={answers.travelMonth} onMonth={(v) => setField("travelMonth", v)} />
        {!multiLegs && dest && answers.travelMonth && answers.travelMonth !== "flexible" && (
          <ClimateAlert dest={dest} monthValue={answers.travelMonth} />
        )}
      </EssentialSection>

      {/* Duration — single-destination only; multi-stop days are fixed in DaysStep */}
      {!multiLegs && (
        <EssentialSection eyebrow="Duration" title="How long do you have?">
          <DayScroller value={answers.travelDays} onSelect={(n) => setField("travelDays", n)} />
        </EssentialSection>
      )}

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
