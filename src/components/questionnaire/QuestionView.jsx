import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { MONTHS } from "@/lib/options";
import {
  QUESTIONS,
  ORIGIN_CHIPS,
  suggestOrigins,
  inferCountry,
} from "@/lib/questionnaireFlow";
import DayScroller from "@/components/questionnaire/DayScroller";

const HEADLINE_STYLE = { fontSize: "clamp(30px, 4.6vw, 50px)" };

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
}) {
  const q = QUESTIONS[qIndex];

  return (
    <section aria-label={q.title} className="step-enter text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-wn-cyan mb-3">
        {q.eyebrow}
      </p>
      <h2
        className="font-display font-extrabold tracking-[-0.02em] leading-[1.08] text-wn-text"
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
        className="w-full min-h-12 px-4 rounded-xl bg-wn-surface/70 ring-1 ring-wn-line-2 text-wn-text text-[15px] text-center placeholder:text-wn-text-3 focus:outline-none focus:ring-2 focus:ring-wn-cyan"
      />
      {inferred && (
        <p className="mt-2 text-[13px] text-wn-text-3">
          We'll assume {inferred} for travel-time estimates.
        </p>
      )}
      {focused && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-2 w-full rounded-xl bg-wn-surface/95 ring-1 ring-wn-line-2 overflow-hidden shadow-2xl backdrop-blur">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChip(s)}
                className="w-full text-left min-h-11 px-4 inline-flex items-center text-[15px] text-wn-text hover:bg-wn-cyan/15 focus:bg-wn-cyan/15 focus:outline-none"
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
            className="min-h-11 px-4 rounded-full bg-wn-surface/60 ring-1 ring-wn-line-2 text-wn-text text-sm hover:ring-wn-cyan/60 hover:text-wn-text focus:outline-none focus:ring-2 focus:ring-wn-cyan motion-safe:transition"
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

function SingleGroup({ q, qIndex, answers, onSingle }) {
  const selected = answers[q.field];
  return (
    <div>
      <div role="radiogroup" aria-label={q.title} className="grid grid-cols-2 gap-3">
        {q.options.filter((o) => !o.noPref).map((o) => {
          const on = selected === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onSingle(qIndex, o.key)}
              className={cn(
                "min-h-14 rounded-2xl px-4 py-4 text-left flex items-center gap-3 ring-1 focus:outline-none focus:ring-2 focus:ring-wn-cyan motion-safe:transition",
                on
                  ? "bg-wn-cyan/15 ring-wn-cyan text-wn-text font-semibold"
                  : "bg-wn-surface/50 ring-wn-line-2 text-wn-text-2 hover:text-wn-text"
              )}
            >
              <span className="flex-1 text-[15px]">{o.label}</span>
              {on && <Check className="w-5 h-5 text-wn-cyan shrink-0" aria-hidden="true" />}
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

function MultiGroup({ q, answers, onToggle }) {
  const arr = answers.interests || [];
  return (
    <div role="group" aria-label={q.title} className="grid grid-cols-2 gap-3">
      {q.options.map((o) => {
        const on = arr.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.key)}
            className={cn(
              "min-h-14 rounded-2xl px-4 py-4 text-left flex items-center justify-between gap-3 ring-1 focus:outline-none focus:ring-2 focus:ring-wn-cyan motion-safe:transition",
              on
                ? "bg-wn-cyan/15 ring-wn-cyan text-wn-text font-semibold"
                : "bg-wn-surface/50 ring-wn-line-2 text-wn-text-2 hover:text-wn-text"
            )}
          >
            <span className="text-[15px]">{o.label}</span>
            {on && <Check className="w-5 h-5 text-wn-cyan shrink-0" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}