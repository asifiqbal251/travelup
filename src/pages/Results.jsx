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
import TravelFit from "@/components/TravelFit";
import { ArrowLeft, ArrowRight, Info, ChevronDown, MapPin } from "lucide-react";

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
      <div className="max-w-2xl mx-auto px-4 py-20 text-center text-muted-foreground">
        <div className="w-8 h-8 mx-auto border-4 border-muted border-t-ink rounded-full animate-spin mb-4" />
        Finding your best matches…
      </div>
    );
  }

  if (error) return <div className="max-w-2xl mx-auto px-4 py-20 text-center text-destructive">{error}</div>;

  const top = ranked.slice(0, 3);
  const suggestions = buildSuggestions(ranked, prefs);
  const practicalityExcluded = practicalityExcludedCount(allDestinations, prefs);
  const hasTripLengthHint = suggestions.some((s) => /increase your trip|longer|7 days/i.test(s.label));
  const showPracticalityNote = practicalityExcluded > 0 && !hasTripLengthHint;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Your top {top.length} matches</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Final scores combine your preference fit with travel practicality for your trip length. Estimates only.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/questionnaire")} className="min-h-11 flex-shrink-0">
          <ArrowLeft className="w-4 h-4 mr-2" /> Revise
        </Button>
      </div>

      {/* Methodology disclosure (collapsible) */}
      <details className="mb-6 rounded-2xl bg-card p-4 group">
        <summary className="cursor-pointer text-sm font-medium text-ink list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
          <Info className="w-4 h-4 text-muted-foreground" />
          How matches are calculated
          <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground motion-safe:transition-transform motion-safe:duration-200 group-open:rotate-180" />
        </summary>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
          Scores are estimates based on your preferences and curated destination data, not live
          availability or flight schedules. Always verify visa and entry requirements through official
          government sources for your citizenship.
        </p>
      </details>

      {showPracticalityNote && (
        <div className="rounded-2xl bg-muted ring-1 ring-border p-4 mb-6">
          <p className="text-sm text-ink/80">
            Some longer-distance destinations weren't included because this trip length doesn't leave
            enough time to make the travel worthwhile — a longer trip would open up more options.
          </p>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="rounded-2xl bg-muted ring-1 ring-border p-4 mb-6">
          <p className="text-sm font-medium text-ink">
            These are weaker practical matches for your current preferences.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <Link
                key={i}
                to={`/questionnaire?step=${s.step}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium bg-card ring-1 ring-border hover:ring-ink rounded-lg px-3 py-2 min-h-9"
              >
                {s.label} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {ranked.length > 0 && ranked.length < 3 && suggestions.length === 0 && (
        <div className="rounded-2xl bg-muted ring-1 ring-border p-4 mb-6">
          <p className="text-sm font-medium text-ink">
            We found {ranked.length} practical match{ranked.length === 1 ? "" : "es"} that fit your preferences well — there simply aren't more destinations in the catalogue that meet these specific constraints.
          </p>
        </div>
      )}

      {top.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>No practical destinations were found for a {prefs.travelDays}-day trip from your location in the current catalogue.</p>
          <p className="mt-1">Try a longer trip, broader preferences, or nearby and domestic destinations.</p>
          <Button onClick={() => navigate("/questionnaire")} className="mt-4 bg-ink min-h-11">Revise answers</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {top[0] && (
            <DestinationCard rank={1} dest={top[0].dest} result={top[0].result} prefs={prefs} onSelect={selectDest} />
          )}
          {top.length > 1 && (
            <div className="grid sm:grid-cols-2 gap-6">
              {top.slice(1).map(({ dest, result }) => (
                <DestinationCard key={dest.id} rank={2} dest={dest} result={result} prefs={prefs} onSelect={selectDest} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DestinationCard({ rank, dest, result, prefs, onSelect }) {
  const [open, setOpen] = useState(false);
  const reasons = buildReasons(dest, prefs, result);
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
  const labelClass =
    finalScore >= 70 ? "bg-teal text-cinema"
      : finalScore >= 50 ? "bg-ink text-on-dark"
      : finalScore >= 30 ? "bg-ink/80 text-on-dark"
      : "bg-destructive text-destructive-foreground";
  const prac = result.practicality;
  const budgetLabel = (dest.budget_categories || []).join(" – ") || "Varies";
  const climateLabel = (dest.climate_tags || []).join(", ") || "Varies";

  const dominant = rank === 1;
  // Formalized variants: featured (rank 1) and supporting share the same content
  // order and badge placement; only image height, type scale and spacing differ.
  const variant = dominant ? "featured" : "supporting";
  const imgH = dominant ? "h-60 sm:h-80" : "h-44 sm:h-52";

  return (
    <article className={`group rounded-3xl bg-card overflow-hidden shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:hover:-translate-y-1 ${dominant ? "ring-1 ring-border" : ""}`}>
      <div className={`relative ${imgH}`}>
        <Image src={dest.image_url} alt={nameWithCountry(dest.name, dest.country)} fittingType="fill" fallbackSrc={TRAVEL_FALLBACK_IMAGE} className="w-full h-full motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.03] motion-safe:group-focus-within:scale-[1.03]" />
        <span
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: "linear-gradient(to top, rgba(7,24,39,0.9) 0%, rgba(7,24,39,0.5) 42%, rgba(7,24,39,0) 100%)" }}
        />
        <div className="glass-badge absolute top-3 right-3 px-3 py-2 rounded-2xl text-right">
          <div className="flex items-baseline gap-0.5 justify-end leading-none">
            <span className={`font-display font-bold text-on-dark ${dominant ? "text-2xl" : "text-lg"}`}>{finalScore}</span>
            <span className="text-xs font-medium text-on-dark/70">/100</span>
          </div>
          <span className="block text-[10px] uppercase tracking-wide text-on-dark/70 mt-1">Travel Fit</span>
        </div>
        <div className={`absolute top-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full ${labelClass}`}>
          {result.matchLabel}
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-5">
          {dominant && (
            <span className="inline-block text-[11px] font-semibold uppercase tracking-wide text-teal mb-1.5">
              Best fit
            </span>
          )}
          <h2 className={`font-display font-bold text-on-dark flex items-center gap-2 ${dominant ? "text-2xl sm:text-3xl" : "text-xl"}`}>
            <MapPin className="w-4 h-4 text-on-dark/70" /> {dest.name}
          </h2>
          <p className="text-on-dark/80 text-sm flex items-center gap-1.5">
            {flagForCountry(dest.country) && <span aria-hidden="true">{flagForCountry(dest.country)}</span>}
            {dest.country} · {dest.region}
          </p>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <TravelFit prac={prac} prefs={prefs} />

        <ul className="space-y-1.5 mb-4">
          {reasons.map((r, i) => (
            <li key={i} className="text-sm text-ink/80 flex gap-2">
              <span className="text-teal">•</span> {r}
            </li>
          ))}
          {result.visited && (
            <li className="text-xs text-muted-foreground">You've been before — ranked a little lower as a result.</li>
          )}
        </ul>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground mb-4">
          <span><span className="font-medium text-ink">Trip length:</span> {dest.min_days}–{dest.max_days}d</span>
          <span><span className="font-medium text-ink">Budget:</span> {budgetLabel}</span>
          <span><span className="font-medium text-ink">Climate:</span> {climateLabel}</span>
        </div>

        <div className="text-sm text-muted-foreground mb-1">
          <span className="font-medium text-ink">Main experiences: </span>
          {(dest.top_experiences || []).slice(0, 4).join(" · ")}
        </div>
        <div className="text-sm text-muted-foreground mb-4">
          <span className="font-medium text-ink">Suited to: </span>
          {(dest.traveller_types || []).join(", ")}
        </div>

        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink rounded"
          aria-expanded={open}
        >
          {open ? "Hide score breakdown" : "See score breakdown"}
          <ChevronDown className={`w-4 h-4 motion-safe:transition-transform motion-safe:duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="mt-4 pt-4 border-t border-border space-y-2.5">
            {rows.map(([label, got, max]) => {
              const penalty = got < 0;
              return (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`font-medium ${penalty ? "text-destructive" : "text-ink"}`}>
                      {penalty ? `${got}` : `${Math.round(got)}/${max}`}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={penalty ? "h-full bg-destructive" : "h-full bg-teal"}
                      style={{ width: `${Math.max(0, (got / max) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="border-t border-border pt-3 mt-2 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Base preference score</span>
                <span className="font-medium text-ink">{result.baseScore}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Travel-practicality penalty</span>
                <span className="font-medium text-destructive">{result.travelPenalty > 0 ? `-${result.travelPenalty}` : "0"}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold pt-1 text-ink">
                <span>Final match score</span>
                <span>{finalScore}/100</span>
              </div>
            </div>
          </div>
        )}

        <Button onClick={() => onSelect(dest.id)} className="w-full mt-5 wn-cta-dark min-h-12">
          View my trip <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </article>
  );
}