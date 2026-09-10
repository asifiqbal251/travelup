import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { MONTHS } from "@/lib/options";
import {
  QUESTIONS,
  ORIGIN_CHIPS,
  suggestOrigins,
  inferCountry,
  budgetPositionToDollar,
  budgetDollarToPosition,
} from "@/lib/questionnaireFlow";
import DayScroller from "@/components/questionnaire/DayScroller";

const HEADLINE_STYLE = { fontSize: "clamp(30px, 4.6vw, 50px)" };

// Selected-state fill for chips/segments. Literal rgba(), not an opacity
// modifier on --wn-cyan -- Tailwind's bg-wn-cyan/NN silently fails because
// --wn-cyan is a plain hex custom property, not space-separated channels
// (see docs/travelfit-visual-fidelity-pass.md #5 for the root cause).
const SELECTED_FILL = { background: "linear-gradient(180deg, rgba(63,216,224,.16), rgba(63,216,224,.07))" };

export default function QuestionView({
  qIndex,
  answers,
  onSingle,
  onMonth,
  onDay,
  onMultiToggle,
  onChip,
  onText,
  onTextEnter,
  onBudget,
  onBudgetGrab,
  onBudgetRelease,
}) {
  const q = QUESTIONS[qIndex];

  return (
    <section aria-label={q.title} className="step-enter text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-wn-cyan mb-3">
        {q.eyebrow}
      </p>
      <h2
        className="font-display font-extrabold tracking-[-0.03em] leading-[1.08] text-wn-text"
        style={HEADLINE_STYLE}
      >
        {q.title}
      </h2>
      {q.hint && <p className="text-wn-text-2 mt-2 text-[15px]">{q.hint}</p>}

      <div className="mt-7">
        {q.type === "text" && (
          <OriginInput
            value={answers.departureCity}
            onText={onText}
            onChip={onChip}
            onTextEnter={onTextEnter}
          />
        )}
        {q.type === "days" && <DayScroller value={answers.travelDays} onSelect={onDay} />}
        {q.type === "months" && <MonthGrid value={answers.travelMonth} onMonth={onMonth} />}
        {q.type === "single" && (
          <SingleGroup q={q} qIndex={qIndex} answers={answers} onSingle={onSingle} />
        )}
        {q.type === "budget" && (
          <BudgetSlider
            q={q}
            qIndex={qIndex}
            answers={answers}
            onBudget={onBudget}
            onBudgetGrab={onBudgetGrab}
            onBudgetRelease={onBudgetRelease}
          />
        )}
        {q.type === "multi" && (
          <MultiGroup q={q} answers={answers} onToggle={onMultiToggle} />
        )}
      </div>
    </section>
  );
}

function OriginInput({ value, onText, onChip, onTextEnter }) {
  const [focused, setFocused] = useState(false);
  const suggestions = suggestOrigins(value);
  const inferred = inferCountry(value);

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        placeholder="City or airport"
        aria-label="Departure city"
        autoComplete="off"
        onChange={(e) => onText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onTextEnter();
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        className="w-full min-h-12 px-[18px] py-4 rounded-xl bg-wn-surface border border-wn-line text-wn-text text-[17px] text-center placeholder:text-wn-text-3 focus:outline-none focus:ring-2 focus:ring-wn-cyan"
      />
      {inferred && (
        <p className="mt-2 text-[13px] text-wn-text-3">
          We'll assume {inferred} for travel-time estimates.
        </p>
      )}
      {focused && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-2 w-full rounded-xl bg-wn-surface-2 ring-1 ring-wn-line-2 overflow-hidden shadow-2xl backdrop-blur">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChip(s)}
                className="w-full text-left min-h-11 px-4 inline-flex items-center text-[15px] text-wn-text hover:bg-[rgba(63,216,224,0.15)] focus:bg-[rgba(63,216,224,0.15)] focus:outline-none"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2 justify-center">
        {ORIGIN_CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChip(c)}
            className="min-h-11 px-[14px] py-2 rounded-full bg-transparent border border-dashed border-wn-line-2 text-wn-text-2 text-sm hover:border-wn-cyan hover:text-wn-cyan focus:outline-none focus:ring-2 focus:ring-wn-cyan motion-safe:transition"
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

function MonthGrid({ value, onMonth }) {
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
        I'm flexible
      </button>
    </div>
  );
}

// Budget (Q9, the last question) -- a continuous slider over a normalized
// 0-1 position, converted to dollars via budgetPositionToDollar (piecewise-
// linear across the non-uniform BUDGET_STOPS breakpoints in
// questionnaireFlow.js -- see the comment there for why that keeps the
// dense $65-$200 catalogue band getting proportionally more of the travel).
// Local `dollar` decouples the visual thumb position from the committed
// answer: the slider needs *some* position to render before the user has
// touched it, but touching it is what actually answers the question
// (unlike DayScroller, where every position is already a valid,
// pre-answered default).
const DEFAULT_BUDGET = 125; // neutral starting point, mid-way through the dense band

function BudgetSlider({ q, qIndex, answers, onBudget, onBudgetGrab, onBudgetRelease }) {
  const stops = q.budgetStops;
  const committed = typeof answers.budget === "number" ? answers.budget : null;
  const noPref = answers.budget === "no-pref";

  const [dollar, setDollar] = useState(() => (committed != null ? committed : DEFAULT_BUDGET));

  useEffect(() => {
    if (committed != null) setDollar(committed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committed]);

  const position = budgetDollarToPosition(dollar);
  const isTop = dollar >= stops[stops.length - 1];
  const travelDays = answers.travelDays;
  const hasTotal = committed != null && typeof travelDays === "number";

  const handleChange = (e) => {
    const next = budgetPositionToDollar(Number(e.target.value));
    setDollar(next);
    onBudget(qIndex, next);
  };
  const release = () => onBudgetRelease(qIndex);

  return (
    <div className="mx-auto max-w-[420px]">
      <div className={cn("motion-safe:transition-opacity", noPref && "opacity-40")}>
        <div className="text-center">
          <span className="text-[40px] font-display font-extrabold tracking-[-0.02em] text-wn-text tabular-nums">
            ${dollar}
            {isTop && "+"}
          </span>
          <span className="ml-1 text-[15px] text-wn-text-2">USD/day</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step="any"
          value={position}
          onChange={handleChange}
          onPointerDown={onBudgetGrab}
          onPointerUp={release}
          onKeyDown={onBudgetGrab}
          onKeyUp={release}
          aria-label="Daily budget in US dollars, not counting flights"
          className="mt-4 w-full h-2 rounded-full bg-wn-surface-2 accent-wn-cyan cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan"
        />
        <div className="flex justify-between mt-2 text-sm text-wn-text-3 tabular-nums">
          <span>${stops[0]}</span>
          <span>${stops[stops.length - 1]}+</span>
        </div>
        <div className="mt-3 min-h-[20px] text-center text-[14px] text-wn-text-2 tabular-nums">
          {hasTotal
            ? `About $${dollar * travelDays} for your ${travelDays} day${travelDays === 1 ? "" : "s"}`
            : " "}
        </div>
      </div>
      {q.noPref && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => onBudget(qIndex, "no-pref")}
            className={cn(
              "mt-2 min-h-11 inline-flex items-center px-1 text-[15px] underline underline-offset-4 rounded focus:outline-none focus:ring-2 focus:ring-wn-cyan",
              noPref ? "text-wn-cyan" : "text-wn-text-2 hover:text-wn-text"
            )}
          >
            No preference
          </button>
        </div>
      )}
    </div>
  );
}

// Pace/Activity (Q7/Q8) carry a one-line example under each option so the
// two questions read as clearly different things (a tester couldn't tell
// them apart -- see docs/wherenova-pace-activity-brief.md). A segmented
// control has no room for that second line at mobile widths (measured: 3-4
// equal columns in ~288px), so these two render as a full-width stacked
// list instead. Detected via `option.description` presence rather than a
// separate id allowlist, mirroring how `noPref` already flags "this is a
// scale question" below (Budget is its own slider, see BudgetSlider above;
// Climate is multi-select, see MultiGroup below).
function DescriptiveOptionList({ q, qIndex, answers, onSingle }) {
  const selected = answers[q.field];
  const opts = q.options.filter((o) => !o.noPref);
  return (
    <div>
      <div
        role="radiogroup"
        aria-label={q.title}
        className="mx-auto max-w-[420px] flex flex-col gap-2.5"
      >
        {opts.map((o) => {
          const on = selected === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onSingle(qIndex, o.key)}
              style={on ? SELECTED_FILL : undefined}
              className={cn(
                "w-full text-left rounded-xl border px-4 py-3 motion-safe:transition focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan",
                on ? "border-wn-cyan" : "border-wn-line hover:border-wn-line-2"
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={cn("text-[15px] font-semibold", on ? "text-wn-cyan" : "text-wn-text")}>
                  {o.label}
                </span>
                {on && <Check className="w-4 h-4 text-wn-cyan shrink-0" aria-hidden="true" />}
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-wn-text-2">
                {o.description}
              </span>
            </button>
          );
        })}
      </div>
      {q.noPref && (
        <button
          type="button"
          onClick={() => onSingle(qIndex, "no-pref")}
          className={cn(
            "mt-4 min-h-11 inline-flex items-center px-1 text-[15px] underline underline-offset-4 rounded focus:outline-none focus:ring-2 focus:ring-wn-cyan",
            selected === "no-pref" ? "text-wn-cyan" : "text-wn-text-2 hover:text-wn-text"
          )}
        >
          No preference
        </button>
      )}
    </div>
  );
}

// Pace/Activity (single-select) use a segmented control instead of loose
// chips: one bordered container, equal-width cells, divided by hairlines.
// (Budget used to be a fourth segmented-control question here too, but its
// 4-cell layout clipped "Premium" to "Pr" at 320px -- it's now the
// BudgetSlider above instead. Climate moved to MultiGroup below when it
// became multi-select -- a segmented control implies mutually-exclusive
// choices, which no longer fits.) These carry noPref -- that's already a
// reliable, existing signal for "this is a scale question" so no separate
// id allowlist is needed.
function SegmentedGroup({ q, qIndex, answers, onSingle }) {
  const selected = answers[q.field];
  const opts = q.options.filter((o) => !o.noPref);
  return (
    <div>
      <div
        role="radiogroup"
        aria-label={q.title}
        className="mx-auto max-w-[520px] flex rounded-xl border border-wn-line overflow-hidden"
      >
        {opts.map((o, i) => {
          const on = selected === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onSingle(qIndex, o.key)}
              style={on ? SELECTED_FILL : undefined}
              className={cn(
                "flex-1 min-h-14 px-2 text-[15px] font-medium motion-safe:transition focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-wn-cyan",
                i > 0 && "border-l border-wn-line",
                on ? "text-wn-cyan font-semibold" : "text-wn-text hover:bg-wn-surface"
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {q.noPref && (
        <button
          type="button"
          onClick={() => onSingle(qIndex, "no-pref")}
          className={cn(
            "mt-4 min-h-11 inline-flex items-center px-1 text-[15px] underline underline-offset-4 rounded focus:outline-none focus:ring-2 focus:ring-wn-cyan",
            selected === "no-pref" ? "text-wn-cyan" : "text-wn-text-2 hover:text-wn-text"
          )}
        >
          No preference
        </button>
      )}
    </div>
  );
}

// Auto-width pills that wrap and centre, for Q4 (Traveller, single) and Q5
// (Interests, multi). Selection is never colour-alone: border width steps
// up (1px -> 2px) on top of the colour/fill change, and the checkmark is
// kept as a third, non-colour signal.
function OptionChip({ label, on, onClick, role, ariaState }) {
  return (
    <button
      type="button"
      role={role}
      {...ariaState}
      onClick={onClick}
      style={on ? SELECTED_FILL : undefined}
      className={cn(
        "inline-flex items-center gap-2 px-5 py-3.5 rounded-xl text-[15px] font-medium motion-safe:transition motion-safe:hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan",
        on
          ? "border-2 border-wn-cyan text-wn-cyan"
          : "border border-wn-line bg-wn-surface text-wn-text hover:border-wn-line-2"
      )}
    >
      {label}
      {on && <Check className="w-4 h-4 text-wn-cyan shrink-0" aria-hidden="true" />}
    </button>
  );
}

function SingleGroup({ q, qIndex, answers, onSingle }) {
  const selected = answers[q.field];
  if (q.options.some((o) => o.description)) {
    return <DescriptiveOptionList q={q} qIndex={qIndex} answers={answers} onSingle={onSingle} />;
  }
  if (q.noPref) {
    return <SegmentedGroup q={q} qIndex={qIndex} answers={answers} onSingle={onSingle} />;
  }
  return (
    <div role="radiogroup" aria-label={q.title} className="flex flex-wrap gap-[10px] justify-center">
      {q.options.map((o) => (
        <OptionChip
          key={o.key}
          label={o.label}
          on={selected === o.key}
          onClick={() => onSingle(qIndex, o.key)}
          role="radio"
          ariaState={{ "aria-checked": selected === o.key }}
        />
      ))}
    </div>
  );
}

function MultiGroup({ q, answers, onToggle }) {
  const arr = answers[q.field] || [];
  const opts = q.options.filter((o) => !o.noPref);
  const noPrefOpt = q.options.find((o) => o.noPref);
  const noPrefOn = !!noPrefOpt && arr.length === 1 && arr[0] === noPrefOpt.key;
  return (
    <div>
      <div role="group" aria-label={q.title} className="flex flex-wrap gap-[10px] justify-center">
        {opts.map((o) => (
          <OptionChip
            key={o.key}
            label={o.label}
            on={arr.includes(o.key)}
            onClick={() => onToggle(q.field, o.key)}
            ariaState={{ "aria-pressed": arr.includes(o.key) }}
          />
        ))}
      </div>
      {noPrefOpt && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => onToggle(q.field, noPrefOpt.key)}
            className={cn(
              "mt-4 min-h-11 inline-flex items-center px-1 text-[15px] underline underline-offset-4 rounded focus:outline-none focus:ring-2 focus:ring-wn-cyan",
              noPrefOn ? "text-wn-cyan" : "text-wn-text-2 hover:text-wn-text"
            )}
          >
            No preference
          </button>
        </div>
      )}
    </div>
  );
}