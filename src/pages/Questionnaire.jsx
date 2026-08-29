import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import {
  QUESTIONS,
  screenOrderFor,
  screenStartFor,
  screenQuestions,
  isAnswered,
  buildPrefs,
  hydrateAnswers,
  answerSummary,
} from "@/lib/questionnaireFlow";
import { getPrefs, setPrefs, setSelectedDestinationId } from "@/lib/storage";
import ProgressRail from "@/components/questionnaire/ProgressRail";
import QuestionView from "@/components/questionnaire/QuestionView";
import CompletionScreen from "@/components/questionnaire/CompletionScreen";

function useMinWidth(px) {
  const [ok, setOk] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= px : false
  );
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${px}px)`);
    const onChange = () => setOk(mql.matches);
    mql.addEventListener("change", onChange);
    setOk(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [px]);
  return ok;
}

// Per-question background glow -- one hue per question (indices match
// QUESTIONS), shifting warmer as the flow advances. See
// docs/travelfit-visual-fidelity-pass.md #2. All 10 hues verified >=5.4:1
// contrast against --wn-text.
const QUESTION_HUES = [
  "#1E4E6B", // 1 Origin
  "#28506E", // 2 Duration
  "#2E4C74", // 3 Month
  "#3A4A78", // 4 Company
  "#46426F", // 5 Interests
  "#57406A", // 6 Budget
  "#5E4160", // 7 Climate
  "#664253", // 8 Pace
  "#6B4448"  // 9 Activity
];
const COMPLETION_HUE = "#2E6B6E";

function glowFor(hue) {
  return `radial-gradient(120% 90% at 50% 8%, ${hue} 0%, var(--wn-page) 62%)`;
}

export default function Questionnaire() {
  const navigate = useNavigate();
  const desktop = useMinWidth(1024);

  const [answers, setAnswers] = useState(() => hydrateAnswers(getPrefs()));
  const [current, setCurrent] = useState(0); // screen start index
  const [done, setDone] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mountedComplete, setMountedComplete] = useState(false);

  const advanceTimer = useRef(null);
  const mainRef = useRef(null);
  const liveRef = useRef(null);

  const order = useMemo(() => screenOrderFor(desktop), [desktop]);
  const sQuestions = useMemo(
    () => (done ? [] : screenQuestions(current, desktop)),
    [current, desktop, done]
  );
  const screenComplete = sQuestions.length > 0 && sQuestions.every((qi) => isAnswered(qi, answers));
  const answeredFlags = useMemo(
    () => QUESTIONS.map((_, i) => isAnswered(i, answers)),
    [answers]
  );

  // On screen change: record mount-completeness (before paint, so the Continue
  // button reflects the back-nav state with no flash) and clear pending advance.
  useLayoutEffect(() => {
    setMountedComplete(sQuestions.length > 0 && sQuestions.every((qi) => isAnswered(qi, answers)));
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, desktop, done]);

  // Move focus to the content so screen readers announce the new screen.
  useEffect(() => {
    const t = setTimeout(() => mainRef.current?.focus(), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, desktop, done]);

  // Live region announcement.
  useEffect(() => {
    if (liveRef.current) {
      liveRef.current.textContent = done
        ? "Your Travel Fit is ready."
        : sQuestions.map((qi) => QUESTIONS[qi].title).join(". ");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, done, desktop]);

  const setField = (field, value) => setAnswers((a) => ({ ...a, [field]: value }));

  const clearAdvance = () => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  };
  const scheduleAdvance = (delay) => {
    clearAdvance();
    advanceTimer.current = setTimeout(() => {
      advanceTimer.current = null;
      goNext();
    }, delay);
  };

  const goNext = () => {
    clearAdvance();
    if (done) return;
    const idx = order.indexOf(current);
    const next = order[idx + 1];
    if (next === undefined) setDone(true);
    else setCurrent(next);
  };
  const goPrev = () => {
    clearAdvance();
    if (done) {
      setDone(false);
      return;
    }
    const idx = order.indexOf(current);
    if (idx <= 0) {
      navigate("/");
      return;
    }
    setCurrent(order[idx - 1]);
  };

  // --- answer handlers (engine-value mapping happens in buildPrefs) ---

  const onSingle = (qIndex, key) => {
    setField(QUESTIONS[qIndex].field, key);
    const qs = screenQuestions(current, desktop);
    const complete = qs.every((qi) => qi === qIndex || isAnswered(qi, answers));
    if (complete) scheduleAdvance(key === "no-pref" ? 0 : 300);
  };
  const onMonth = (value) => {
    setField("travelMonth", value);
    scheduleAdvance(300);
  };
  const onDay = (n) => {
    setField("travelDays", n);
    scheduleAdvance(420);
  };
  const onMultiToggle = (key) => {
    setAnswers((a) => {
      const arr = a.interests.includes(key)
        ? a.interests.filter((k) => k !== key)
        : [...a.interests, key];
      return { ...a, interests: arr };
    });
  };
  const onChip = (city) => {
    setField("departureCity", city);
    scheduleAdvance(300);
  };
  const onText = (v) => setField("departureCity", v);
  const onTextEnter = () => {
    if (String(answers.departureCity || "").trim()) scheduleAdvance(300);
  };

  const jumpTo = (qIndex) => {
    clearAdvance();
    setSheetOpen(false);
    setDone(false);
    setCurrent(screenStartFor(qIndex, desktop));
  };

  const reveal = () => {
    setPrefs(buildPrefs(answers));
    setSelectedDestinationId(null);
    navigate("/results");
  };

  // Continue button visibility.
  const showContinue = !done && (() => {
    const q = sQuestions.length ? QUESTIONS[sQuestions[0]] : null;
    if (!q) return false;
    if (q.type === "multi") return answers.interests.length > 0;
    if (q.type === "text") return !!String(answers.departureCity || "").trim();
    return screenComplete && mountedComplete;
  })();

  const counter = done
    ? ""
    : `${sQuestions.map((qi) => qi + 1).join("–")} of 9`;

  // current is the screen-START question index, which for paired desktop
  // screens (6+7, 8+9) is already the first question's index -- so this
  // naturally satisfies "use the first question's hue" with no extra logic.
  const glowHue = done ? COMPLETION_HUE : (QUESTION_HUES[current] || QUESTION_HUES[0]);

  return (
    <div className="min-h-[100dvh] bg-wn-page text-wn-text grid grid-rows-[auto_1fr_auto] relative overflow-hidden">
      {/* background glow -- see docs/travelfit-visual-fidelity-pass.md #2 */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div
          className="absolute inset-0 motion-safe:transition-[background] motion-safe:duration-[1100ms] motion-safe:ease-[cubic-bezier(0.2,0.7,0.3,1)]"
          style={{ background: glowFor(glowHue) }}
        />
      </div>

      {/* screen-reader live region */}
      <div ref={liveRef} aria-live="polite" aria-atomic="true" className="sr-only" />

      {/* header: wordmark + progress rail. Full-bleed immersive route -- no
          site chrome, see docs/travelfit-visual-fidelity-pass.md #1. */}
      <header className="relative px-4 sm:px-6 pt-5 pb-3">
        <ProgressRail
          currentSet={sQuestions}
          answered={answeredFlags}
          desktop={desktop}
          onJump={jumpTo}
          onOpenSheet={() => setSheetOpen(true)}
        />
        <Link
          to="/"
          aria-label="WhereNova home"
          className="absolute z-10 left-4 sm:left-6 top-5 leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan rounded"
        >
          <span
            className="font-display font-extrabold whitespace-nowrap text-wn-text"
            style={{ fontSize: 17, letterSpacing: "-0.01em" }}
          >
            Where<span className="text-wn-cyan">N</span>ova
          </span>
        </Link>
      </header>

      {/* main — optically centred (grid row 2, 1fr, place-items:center) */}
      <main
        ref={mainRef}
        tabIndex={-1}
        className="grid place-items-center px-4 sm:px-6 py-6 outline-none min-h-0"
      >
        <div className="w-full max-w-3xl mx-auto">
          {done ? (
            <CompletionScreen answers={answers} onContinue={reveal} />
          ) : (
            <div className={sQuestions.length > 1 ? "grid md:grid-cols-2 gap-8 lg:gap-12" : ""}>
              {sQuestions.map((qi) => (
                <QuestionView
                  key={qi}
                  qIndex={qi}
                  answers={answers}
                  onSingle={onSingle}
                  onMonth={onMonth}
                  onDay={onDay}
                  onMultiToggle={onMultiToggle}
                  onChip={onChip}
                  onText={onText}
                  onTextEnter={onTextEnter}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* footer */}
      <footer className="px-4 sm:px-6 pb-5 pt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          aria-label={current === 0 && !done ? "Back to home" : "Back"}
          className="inline-flex items-center justify-center h-11 w-11 rounded-full bg-wn-surface/60 ring-1 ring-wn-line-2 text-wn-text hover:bg-wn-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-wn-page motion-safe:transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4">
          {showContinue && (
            <button
              type="button"
              onClick={goNext}
              className="wn-cta-dark inline-flex items-center gap-2 h-12 px-7 rounded-xl font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-wn-page motion-safe:transition"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          )}
          {counter && <span className="text-sm text-wn-text-2 tabular-nums">{counter}</span>}
        </div>
      </footer>

      {/* mobile review sheet */}
      {sheetOpen && (
        <ReviewSheet
          answers={answers}
          answeredFlags={answeredFlags}
          onJump={jumpTo}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

function ReviewSheet({ answers, answeredFlags, onJump, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Review your answers"
    >
      <button
        type="button"
        aria-label="Close review sheet"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="relative bg-wn-page-2 border-t border-wn-line-2 rounded-t-2xl p-5 pb-8 max-h-[80dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-lg text-wn-text">Your answers</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-9 w-9 rounded-full flex items-center justify-center text-wn-text-2 hover:text-wn-text hover:bg-wn-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <ul className="divide-y divide-wn-line">
          {QUESTIONS.map((q, i) =>
            answeredFlags[i] ? (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onJump(i)}
                  className="w-full text-left flex items-center justify-between gap-3 py-3 px-1 rounded-lg hover:bg-wn-surface/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan"
                >
                  <span className="text-wn-text-3 text-sm">{q.title}</span>
                  <span className="text-wn-text text-[15px] font-medium text-right">
                    {answerSummary(i, answers)}
                  </span>
                </button>
              </li>
            ) : null
          )}
        </ul>
      </div>
    </div>
  );
}