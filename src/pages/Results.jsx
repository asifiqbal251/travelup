import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { base44 } from "@/api/base44Client";
import { getPrefs, setSelectedDestinationId } from "@/lib/storage";
import { TRAVEL_FALLBACK_IMAGE } from "@/lib/fallbackImage";
import { rankDestinations, buildReasons, buildSuggestions, practicalityExcludedCount } from "@/lib/scoring";
import { nameWithCountry } from "@/lib/destinationLabel";
import { flagForCountry } from "@/lib/countryFlag";
import TravelFitRing from "@/components/TravelFitRing";
import { ArrowLeft, ArrowRight, Info, ChevronDown, MapPin, Compass, Clock, Gauge } from "lucide-react";

export default function Results() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ranked, setRanked] = useState([]);
  const [allDestinations, setAllDestinations] = useState([]);
  const [prefs, setPrefsState] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const p = getPrefs();
    if (!p) {
      navigate("/questionnaire");
      return;
    }
    setPrefsState(p);
    base44.entities.Destination.list()
      .then((dests) => {
        setAllDestinations(dests);
        const r = rankDestinations(dests, p);
        setRanked(r);
        setLoading(false);
      })
      .catch(() => {
        setError("We couldn't load the destination list. Please try again.");
        setLoading(false);
      });
  }, [navigate]);

  const selectDest = (id) => {
    setSelectedDestinationId(id);
    navigate("/trip");
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-wn-page text-wn-text">
        <div className="max-w-2xl mx-auto px-4 py-20 text-center text-wn-text-2">
          <div className="w-8 h-8 mx-auto border-4 border-wn-line border-t-wn-cyan rounded-full animate-spin mb-4" />
          Finding your best matches…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-wn-page text-wn-text">
        <div className="max-w-2xl mx-auto px-4 py-20 text-center text-destructive">{error}</div>
      </div>
    );
  }

  const top = ranked.slice(0, 3);
  const suggestions = buildSuggestions(ranked, prefs);
  const practicalityExcluded = practicalityExcludedCount(allDestinations, prefs);
  const hasTripLengthHint = suggestions.some((s) => /increase your trip|longer|7 days/i.test(s.label));
  const showPracticalityNote = practicalityExcluded > 0 && !hasTripLengthHint;

  return (
    <div className="min-h-[100dvh] bg-wn-page text-wn-text">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-wn-cyan mb-2">Your Travel Fit</p>
            <h1 className="font-display text-3xl font-bold text-wn-text">Your top {top.length} matches</h1>
            <p className="text-[15px] text-wn-text-2 mt-1">
              Final scores combine your preference fit with travel practicality for your trip length. Estimates only.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/questionnaire")}
            className="min-h-11 flex-shrink-0 border-wn-line-2 bg-transparent text-wn-text hover:bg-wn-surface hover:text-wn-text"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Revise
          </Button>
        </div>

        {/* Methodology disclosure (collapsible) */}
        <details className="mb-6 rounded-2xl bg-wn-surface ring-1 ring-wn-line p-4 group">
          <summary className="cursor-pointer text-[15px] font-medium text-wn-text list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
            <Info className="w-4 h-4 text-wn-text-2" />
            How matches are calculated
            <ChevronDown className="w-4 h-4 ml-auto text-wn-text-2 motion-safe:transition-transform motion-safe:duration-200 group-open:rotate-180" />
          </summary>
          <p className="text-[15px] text-wn-text-2 mt-3 leading-relaxed">
            Scores are estimates based on your preferences and curated destination data, not live
            availability or flight schedules. Always verify visa and entry requirements through official
            government sources for your citizenship.
          </p>
        </details>

        {showPracticalityNote && (
          <div className="rounded-2xl bg-wn-surface ring-1 ring-wn-line p-4 mb-6">
            <p className="text-[15px] text-wn-text-2">
              Some longer-distance destinations weren't included because this trip length doesn't leave
              enough time to make the travel worthwhile — a longer trip would open up more options.
            </p>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="rounded-2xl bg-wn-surface ring-1 ring-wn-line p-4 mb-6">
            <p className="text-[15px] font-medium text-wn-text">
              These are weaker practical matches for your current preferences.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <Link
                  key={i}
                  to={`/questionnaire?step=${s.step}`}
                  className="inline-flex items-center gap-1.5 text-[15px] font-medium bg-wn-surface-2 ring-1 ring-wn-line-2 hover:ring-wn-cyan rounded-lg px-3 py-2 min-h-9 text-wn-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan"
                >
                  {s.label} <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {ranked.length > 0 && ranked.length < 3 && suggestions.length === 0 && (
          <div className="rounded-2xl bg-wn-surface ring-1 ring-wn-line p-4 mb-6">
            <p className="text-[15px] font-medium text-wn-text">
              We found {ranked.length} practical match{ranked.length === 1 ? "" : "es"} that fit your preferences well — there simply aren't more destinations in the catalogue that meet these specific constraints.
            </p>
          </div>
        )}

        {top.length === 0 ? (
          <div className="text-center py-16 text-wn-text-2">
            <p>No practical destinations were found for a {prefs.travelDays}-day trip from your location in the current catalogue.</p>
            <p className="mt-1">Try a longer trip, broader preferences, or nearby and domestic destinations.</p>
            <Button onClick={() => navigate("/questionnaire")} className="wn-cta-dark mt-4 min-h-11">Revise answers</Button>
          </div>
        ) : (
          <div className="space-y-6">
            {top[0] && (
              <HeroMatchCard dest={top[0].dest} result={top[0].result} prefs={prefs} onSelect={selectDest} />
            )}
            {top.length > 1 && (
              <div className="grid sm:grid-cols-2 gap-6">
                {top.slice(1).map(({ dest, result }) => (
                  <MatchCard key={dest.id} dest={dest} result={result} prefs={prefs} onSelect={selectDest} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Shared score-breakdown detail (collapsed by default) ----

function ScoreBreakdown({ result }) {
  const [open, setOpen] = useState(false);
  const b = result.breakdown;
  const rows = [
    ["Season fit", b.season, 25],
    ["Interest match", b.interest, 25],
    ["Budget fit", b.budget, 15],
    ["Trip length", b.length, 15],
    ["Climate", b.climate, 10],
    ["Pace, activity & traveller", b.pace, 10]
  ];
  if (result.visited) {
    rows.push(["Visited before", -result.visitedPenalty, result.visitedPenalty]);
  }
  const finalScore = result.finalScore;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-[15px] font-medium text-wn-text-2 hover:text-wn-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan rounded"
        aria-expanded={open}
      >
        How this score was built
        <ChevronDown className={`w-4 h-4 motion-safe:transition-transform motion-safe:duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-4 pt-4 border-t border-wn-line space-y-2.5">
          {rows.map(([label, got, max]) => {
            const penalty = got < 0;
            return (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-wn-text-2">{label}</span>
                  <span className={`font-medium ${penalty ? "text-destructive" : "text-wn-text"}`}>
                    {penalty ? `${got}` : `${Math.round(got)}/${max}`}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-wn-line overflow-hidden">
                  <div
                    className={penalty ? "h-full bg-destructive" : "h-full bg-wn-cyan"}
                    style={{ width: `${Math.max(0, (got / max) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
          <div className="border-t border-wn-line pt-3 mt-2 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-wn-text-2">Base preference score</span>
              <span className="font-medium text-wn-text">{result.baseScore}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-wn-text-2">Travel-practicality penalty</span>
              <span className="font-medium text-destructive">{result.travelPenalty > 0 ? `-${result.travelPenalty}` : "0"}</span>
            </div>
            <div className="flex justify-between text-[15px] font-semibold pt-1 text-wn-text">
              <span>Final match score</span>
              <span>{finalScore}/100</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Compact 3-fact travel-practicality row ----

function ThreeFactRow({ prac }) {
  const mode = prac.travelMode;
  return (
    <dl className="grid grid-cols-3 gap-3 py-4 border-y border-wn-line">
      <div className="min-w-0">
        <dt className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-wn-text-3">
          <Compass className="w-3 h-3" /> How you'll travel
        </dt>
        <dd className="text-[13px] sm:text-[15px] font-medium text-wn-text mt-1 break-words">{mode}</dd>
      </div>
      <div className="min-w-0">
        <dt className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-wn-text-3">
          <Clock className="w-3 h-3" /> Travel time
        </dt>
        <dd className="text-[13px] sm:text-[15px] font-medium text-wn-text mt-1">
          {prac.oneWayHours}h each way
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-wn-text-3">
          <Gauge className="w-3 h-3" /> Time on ground
        </dt>
        <dd className="text-[13px] sm:text-[15px] font-medium text-wn-text mt-1">
          {prac.usableDestinationDays}d
        </dd>
      </div>
    </dl>
  );
}

// ---- Featured top match: horizontal hero (desktop), stacked (mobile) ----

function HeroMatchCard({ dest, result, prefs, onSelect }) {
  const reasons = buildReasons(dest, prefs, result);
  const prac = result.practicality;
  const finalScore = result.finalScore;

  return (
    <article className="rounded-3xl bg-wn-surface ring-1 ring-wn-line-2 overflow-hidden sm:grid sm:grid-cols-5">
      <div className="relative h-64 sm:h-auto sm:col-span-2">
        <Image
          src={dest.image_url}
          alt={nameWithCountry(dest.name, dest.country)}
          fittingType="fill"
          fallbackSrc={TRAVEL_FALLBACK_IMAGE}
          className="w-full h-full"
        />
        <span
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(6,16,31,0.85) 0%, rgba(6,16,31,0.35) 45%, rgba(6,16,31,0) 100%)" }}
        />
        <span className="glass-badge absolute top-4 left-4 inline-flex items-center text-[11px] font-bold uppercase tracking-[0.14em] text-wn-coral px-3 py-1.5 rounded-full">
          Best fit
        </span>
        <span className="absolute top-4 right-4 rounded-full glass-badge p-1.5">
          <TravelFitRing score={finalScore} size="lg" />
        </span>
        <div className="absolute bottom-0 left-0 right-0 p-5 sm:hidden">
          <h2 className="font-display font-bold text-wn-text text-2xl flex items-center gap-2">
            <MapPin className="w-4 h-4 text-wn-text-2 shrink-0" /> {dest.name}
          </h2>
          <p className="text-wn-text-2 text-[15px] flex items-center gap-1.5">
            {flagForCountry(dest.country) && <span aria-hidden="true">{flagForCountry(dest.country)}</span>}
            {dest.country} · {dest.region}
          </p>
        </div>
      </div>

      <div className="p-5 sm:p-8 sm:col-span-3 flex flex-col justify-center">
        <h2 className="hidden sm:flex font-display font-bold text-wn-text text-3xl items-center gap-2">
          <MapPin className="w-5 h-5 text-wn-text-2 shrink-0" /> {dest.name}
        </h2>
        <p className="hidden sm:flex text-wn-text-2 text-[15px] items-center gap-1.5 mt-1">
          {flagForCountry(dest.country) && <span aria-hidden="true">{flagForCountry(dest.country)}</span>}
          {dest.country} · {dest.region}
        </p>

        {dest.intro && (
          <p className="text-wn-text text-[15px] sm:text-base leading-relaxed mt-4">{dest.intro}</p>
        )}

        <ThreeFactRow prac={prac} />

        <ul className="space-y-1.5 my-4">
          {reasons.map((r, i) => (
            <li key={i} className="text-[15px] text-wn-text-2 flex gap-2">
              <span className="text-wn-cyan">•</span> {r}
            </li>
          ))}
          {result.visited && (
            <li className="text-[13px] text-wn-text-3">You've been before — ranked a little lower as a result.</li>
          )}
        </ul>

        <ScoreBreakdown result={result} />

        <Button onClick={() => onSelect(dest.id)} className="w-full sm:w-auto mt-6 wn-cta-dark min-h-12 px-8">
          View my trip <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </article>
  );
}

// Qualitative match-tier badge — distinct info from the numeric ring and,
// unlike "Best fit", meaningful on the two non-featured cards.
const MATCH_LABEL_CLASS = {
  "Strong match": "bg-wn-cyan/15 ring-1 ring-wn-cyan text-wn-cyan",
  "Fair match": "bg-wn-surface-2 ring-1 ring-wn-line-2 text-wn-text",
  "Weak match": "bg-wn-surface-2 ring-1 ring-wn-line-2 text-wn-text-2",
  "Poor practical match": "bg-destructive text-destructive-foreground"
};

// ---- Supporting matches (#2, #3): identical component, identical props shape ----

function MatchCard({ dest, result, prefs, onSelect }) {
  const reasons = buildReasons(dest, prefs, result);
  const prac = result.practicality;
  const finalScore = result.finalScore;

  return (
    <article className="rounded-3xl bg-wn-surface ring-1 ring-wn-line overflow-hidden motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-1">
      <div className="relative h-48 sm:h-56">
        <Image
          src={dest.image_url}
          alt={nameWithCountry(dest.name, dest.country)}
          fittingType="fill"
          fallbackSrc={TRAVEL_FALLBACK_IMAGE}
          className="w-full h-full"
        />
        <span
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: "linear-gradient(to top, rgba(6,16,31,0.9) 0%, rgba(6,16,31,0.5) 42%, rgba(6,16,31,0) 100%)" }}
        />
        <span className={`absolute top-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full ${MATCH_LABEL_CLASS[result.matchLabel] || MATCH_LABEL_CLASS["Fair match"]}`}>
          {result.matchLabel}
        </span>
        <span className="absolute top-3 right-3 rounded-full glass-badge p-1">
          <TravelFitRing score={finalScore} size="md" />
        </span>
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <h2 className="font-display font-bold text-wn-text text-xl flex items-center gap-2">
            <MapPin className="w-4 h-4 text-wn-text-2 shrink-0" /> {dest.name}
          </h2>
          <p className="text-wn-text-2 text-[15px] flex items-center gap-1.5">
            {flagForCountry(dest.country) && <span aria-hidden="true">{flagForCountry(dest.country)}</span>}
            {dest.country} · {dest.region}
          </p>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {dest.intro && (
          <p className="text-wn-text text-[15px] leading-relaxed mb-4">{dest.intro}</p>
        )}

        <ThreeFactRow prac={prac} />

        <ul className="space-y-1.5 my-4">
          {reasons.map((r, i) => (
            <li key={i} className="text-[15px] text-wn-text-2 flex gap-2">
              <span className="text-wn-cyan">•</span> {r}
            </li>
          ))}
          {result.visited && (
            <li className="text-[13px] text-wn-text-3">You've been before — ranked a little lower as a result.</li>
          )}
        </ul>

        <ScoreBreakdown result={result} />

        <Button onClick={() => onSelect(dest.id)} className="w-full mt-5 wn-cta-dark min-h-12">
          View my trip <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </article>
  );
}
