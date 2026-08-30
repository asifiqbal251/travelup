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
import { ArrowLeft, ArrowRight, Info, ChevronDown, Compass, Clock, Gauge } from "lucide-react";

// Sibling-deduplication for the fit-reason pills (C4): walk the three cards
// in display order (hero first) sharing one "already used" set, so the same
// reason string (e.g. "Peak season in October") never repeats verbatim
// across cards -- each card falls through to its own next-best reason from
// buildReasons() instead. Caps at 2 pills per card.
function withDedupedPills(top, prefs) {
  const used = new Set();
  return top.map(({ dest, result }) => {
    const reasons = buildReasons(dest, prefs, result);
    const pills = [];
    for (const r of reasons) {
      if (pills.length >= 2) break;
      if (used.has(r)) continue;
      pills.push(r);
      used.add(r);
    }
    return { dest, result, pills };
  });
}

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
  const withPills = withDedupedPills(top, prefs);
  const suggestions = buildSuggestions(ranked, prefs);
  const lowScore = top.some((r) => r.result.finalScore < 50);
  const practicalityExcluded = practicalityExcludedCount(allDestinations, prefs);
  const hasTripLengthHint = suggestions.some((s) => /increase your trip|longer|7 days/i.test(s.label));
  const showPracticalityNote = practicalityExcluded > 0 && !hasTripLengthHint;

  return (
    <div className="min-h-[100dvh] bg-wn-page text-wn-text">
      {/* C1: 1320px container, 32px padding, centred */}
      <div className="max-w-[1320px] mx-auto px-8">
        <div className="pt-14 pb-8 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-wn-cyan mb-3.5 flex items-center gap-2">
              Your Travel Fit
            </p>
            <h1 className="font-display font-extrabold text-wn-text" style={{ fontSize: "clamp(34px, 4.4vw, 54px)", lineHeight: 1.02, letterSpacing: "-0.03em", marginBottom: 12 }}>
              {top.length === 0
                ? "Your matches"
                : top.length === 1
                ? "Your top match"
                : `Your top ${top.length} matches`}
            </h1>
            <p className="text-wn-text-2 max-w-[52ch] text-base">
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
              {lowScore
                ? "These are weaker practical matches for your current preferences."
                : "Want more options to choose from? Here's what you could adjust."}
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

        {withPills.length === 0 ? (
          <div className="text-center py-16 text-wn-text-2">
            <p>No practical destinations were found for a {prefs.travelDays}-day trip from your location in the current catalogue.</p>
            <p className="mt-1">Try a longer trip, broader preferences, or nearby and domestic destinations.</p>
            <Button onClick={() => navigate("/questionnaire")} className="wn-cta-dark mt-4 min-h-11">Revise answers</Button>
          </div>
        ) : (
          <div className="space-y-7 pb-16">
            {withPills[0] && (
              <HeroMatchCard dest={withPills[0].dest} result={withPills[0].result} pills={withPills[0].pills} onSelect={selectDest} />
            )}
            {withPills.length > 1 && (
              <div className={`grid gap-7 ${withPills.length > 2 ? "md:grid-cols-2" : "md:max-w-[calc(50%-14px)] md:mx-auto"}`}>
                {withPills.slice(1).map(({ dest, result, pills }) => (
                  <MatchCard key={dest.id} dest={dest} result={result} pills={pills} onSelect={selectDest} />
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
    ["Season", b.season, 25],
    ["Interests", b.interest, 25],
    ["Budget", b.budget, 15],
    ["Trip length", b.length, 15],
    ["Climate", b.climate, 10],
    ["Pace & activity", b.pace, 10]
  ];
  if (result.visited) {
    rows.push(["Visited before", -result.visitedPenalty, result.visitedPenalty]);
  }
  const finalScore = result.finalScore;

  return (
    <details className="why border-t border-wn-line pt-4" open={open} onToggle={(e) => setOpen(e.target.open)}>
      <summary className="cursor-pointer list-none text-[14px] font-semibold text-wn-text-2 flex items-center gap-2 [&::-webkit-details-marker]:hidden">
        How this score was built
        <ChevronDown className={`w-4 h-4 motion-safe:transition-transform motion-safe:duration-200 ${open ? "rotate-180" : ""}`} />
      </summary>
      <div className="mt-3.5 flex flex-col gap-2.5">
        {rows.map(([label, got, max]) => {
          const penalty = got < 0;
          const pct = Math.max(0, Math.min(100, (got / max) * 100));
          return (
            <div key={label} className="flex items-center gap-3 text-[14px] text-wn-text-2">
              <span className="w-28 shrink-0 text-wn-text">{label}</span>
              <span className="flex-1 h-[5px] rounded-full bg-wn-line overflow-hidden">
                <span
                  className={`block h-full rounded-full ${penalty ? "bg-destructive" : "bg-wn-cyan"}`}
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className={`w-9 text-right tabular-nums font-semibold ${penalty ? "text-destructive" : "text-wn-text"}`}>
                {penalty ? got : Math.round(got)}
              </span>
            </div>
          );
        })}
        <div className="border-t border-wn-line pt-2.5 mt-1 flex justify-between text-[14px] font-semibold text-wn-text">
          <span>Final match score</span>
          <span>{finalScore}/100</span>
        </div>
      </div>
    </details>
  );
}

// ---- C5: compact 3-fact bordered grid ----

function FactsGrid({ prac }) {
  const mode = prac.travelMode;
  return (
    <dl className="grid grid-cols-3 gap-[2px] bg-wn-line border border-wn-line rounded-xl overflow-hidden">
      <div className="bg-wn-surface px-4 py-3.5 min-w-0">
        <dt className="text-[10px] font-bold uppercase tracking-[0.13em] text-wn-text-3 mb-1.5 flex items-center gap-1">
          <Compass className="w-3 h-3" /> Getting there
        </dt>
        <dd className="text-[14.5px] font-semibold text-wn-text break-words">{mode}</dd>
      </div>
      <div className="bg-wn-surface px-4 py-3.5 min-w-0">
        <dt className="text-[10px] font-bold uppercase tracking-[0.13em] text-wn-text-3 mb-1.5 flex items-center gap-1">
          <Clock className="w-3 h-3" /> Travel time
        </dt>
        <dd className="text-[14.5px] font-semibold text-wn-text">{prac.oneWayHours}h each way</dd>
      </div>
      <div className="bg-wn-surface px-4 py-3.5 min-w-0">
        <dt className="text-[10px] font-bold uppercase tracking-[0.13em] text-wn-text-3 mb-1.5 flex items-center gap-1">
          <Gauge className="w-3 h-3" /> On the ground
        </dt>
        <dd className="text-[14.5px] font-semibold text-wn-text">{prac.usableDestinationDays}d</dd>
      </div>
    </dl>
  );
}

function Pills({ pills }) {
  if (!pills || !pills.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((p, i) => (
        <span
          key={i}
          className="inline-flex items-center text-[11px] font-semibold uppercase tracking-[0.1em] text-wn-text-2 border border-wn-line rounded-full px-3 py-1.5"
        >
          {p}
        </span>
      ))}
    </div>
  );
}

// ---- C2/C3: featured top match, image column wider than content (1.35fr:1fr) ----

function HeroMatchCard({ dest, result, pills, onSelect }) {
  const prac = result.practicality;
  const finalScore = result.finalScore;

  return (
    <article className="rounded-3xl bg-wn-surface ring-1 ring-wn-line overflow-hidden md:grid" style={{ gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)" }}>
      <div className="relative min-h-[280px] md:min-h-[440px]">
        <Image
          src={dest.image_url}
          alt={nameWithCountry(dest.name, dest.country)}
          fittingType="fill"
          fallbackSrc={TRAVEL_FALLBACK_IMAGE}
          className="w-full h-full"
        />
        <span
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(8,20,40,0) 30%, rgba(8,20,40,.55) 68%, rgba(8,20,40,.94) 100%)" }}
        />
        {/* overlay: badge top-left, ring+name+location stacked bottom-left. Nothing else on the photo. */}
        <div className="absolute inset-0 flex flex-col justify-between p-[22px]">
          <span className="self-start inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white bg-wn-coral/90 rounded-full px-3 py-2">
            Best fit
          </span>
          <div>
            <TravelFitRing score={finalScore} size="lg" />
            <h2
              className="font-display font-extrabold text-white mt-4"
              style={{ fontSize: "clamp(30px, 3.2vw, 42px)", letterSpacing: "-0.025em", lineHeight: 1.05 }}
            >
              {dest.name}
            </h2>
            <p className="flex items-center gap-2 mt-1.5 text-[13.5px]" style={{ color: "rgba(255,255,255,.82)" }}>
              {flagForCountry(dest.country) && <span aria-hidden="true">{flagForCountry(dest.country)}</span>}
              {dest.country} · {dest.region}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 md:p-[34px] flex flex-col gap-[22px]">
        {dest.intro && (
          <p className="text-[17px] leading-[1.55] text-wn-text font-medium" style={{ letterSpacing: "-0.01em" }}>
            {dest.intro}
          </p>
        )}

        <FactsGrid prac={prac} />

        <Pills pills={pills} />

        <ScoreBreakdown result={result} />

        <Button onClick={() => onSelect(dest.id)} className="self-start wn-cta-dark min-h-12 px-8">
          View my trip <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </article>
  );
}

// ---- C6: identical supporting cards, equal height, CTA aligned via margin-top:auto ----

function MatchCard({ dest, result, pills, onSelect }) {
  const prac = result.practicality;
  const finalScore = result.finalScore;

  return (
    <article className="flex flex-col rounded-2xl bg-wn-surface ring-1 ring-wn-line overflow-hidden motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-1">
      <div className="relative aspect-[16/10]">
        <Image
          src={dest.image_url}
          alt={nameWithCountry(dest.name, dest.country)}
          fittingType="fill"
          fallbackSrc={TRAVEL_FALLBACK_IMAGE}
          className="w-full h-full"
        />
        <span
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(8,20,40,0) 30%, rgba(8,20,40,.55) 68%, rgba(8,20,40,.94) 100%)" }}
        />
        <div className="absolute inset-0 flex flex-col justify-between p-[22px]">
          <span className="self-end">
            <TravelFitRing score={finalScore} size="md" />
          </span>
          <div>
            <h2 className="font-display font-extrabold text-white text-[25px]" style={{ letterSpacing: "-0.025em", lineHeight: 1.05 }}>
              {dest.name}
            </h2>
            <p className="flex items-center gap-2 mt-1.5 text-[13.5px]" style={{ color: "rgba(255,255,255,.82)" }}>
              {flagForCountry(dest.country) && <span aria-hidden="true">{flagForCountry(dest.country)}</span>}
              {dest.country} · {dest.region}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 flex flex-col gap-[18px]">
        {dest.intro && (
          <p className="text-[17px] leading-[1.55] text-wn-text font-medium" style={{ letterSpacing: "-0.01em" }}>
            {dest.intro}
          </p>
        )}

        <FactsGrid prac={prac} />

        <Pills pills={pills} />

        <ScoreBreakdown result={result} />

        <Button onClick={() => onSelect(dest.id)} className="wn-cta-dark min-h-12 mt-auto">
          View my trip <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </article>
  );
}
