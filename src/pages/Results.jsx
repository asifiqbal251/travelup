import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { base44 } from "@/api/base44Client";
import { getPrefs, setSelectedDestinationId } from "@/lib/storage";
import { TRAVEL_FALLBACK_IMAGE } from "@/lib/fallbackImage";
import { rankDestinations, buildReasons, buildSuggestions, practicalityExcludedCount } from "@/lib/scoring";
import TravelFit from "@/components/TravelFit";
import { ArrowLeft, ArrowRight, Info, MapPin, Clock, Wallet } from "lucide-react";

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
      .catch((e) => {
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
      <div className="max-w-2xl mx-auto px-4 py-20 text-center text-[#0B1F3A]/60">
        <div className="w-8 h-8 mx-auto border-4 border-[#E6E2D8] border-t-[#2EC4B6] rounded-full animate-spin mb-4" />
        Finding your best matches…
      </div>
    );
  }

  if (error) return <div className="max-w-2xl mx-auto px-4 py-20 text-center text-[#FF6B5B]">{error}</div>;

  const top = ranked.slice(0, 3);
  const suggestions = buildSuggestions(ranked, prefs);
  const practicalityExcluded = practicalityExcludedCount(allDestinations, prefs);
  const hasTripLengthHint = suggestions.some((s) => /increase your trip|longer|7 days/i.test(s.label));
  const showPracticalityNote = practicalityExcluded > 0 && !hasTripLengthHint;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Your top {top.length} matches</h1>
          <p className="text-sm text-[#0B1F3A]/60 mt-1">
            Final scores combine your preference fit with travel practicality for your trip length. Estimates only.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/questionnaire")} className="min-h-11 flex-shrink-0">
          <ArrowLeft className="w-4 h-4 mr-2" /> Revise
        </Button>
      </div>

      <div className="bg-[#0B1F3A]/5 border border-[#2EC4B6]/30 rounded-xl p-4 mb-6 flex gap-3">
        <Info className="w-5 h-5 text-[#0B1F3A] flex-shrink-0 mt-0.5" />
        <p className="text-sm text-[#0B1F3A]/75">
          Scores are estimates based on your preferences and curated destination data, not live
          availability or flight schedules. Always verify visa and entry requirements through official
          government sources for your citizenship.
        </p>
      </div>

      {showPracticalityNote && (
        <div className="bg-[#2EC4B6]/10 border border-[#2EC4B6]/30 rounded-xl p-4 mb-6">
          <p className="text-sm text-[#0B1F3A]/80">
            Some longer-distance destinations weren't included because this trip length doesn't leave
            enough time to make the travel worthwhile — a longer trip would open up more options.
          </p>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="bg-[#FF6B5B]/10 border border-[#FF6B5B]/30 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-[#0B1F3A]">
            These are weaker practical matches for your current preferences.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <Link
                key={i}
                to={`/questionnaire?step=${s.step}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium bg-white border border-[#E6E2D8] hover:border-[#2EC4B6] rounded-lg px-3 py-2 min-h-9"
              >
                {s.label} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {ranked.length > 0 && ranked.length < 3 && suggestions.length === 0 && (
        <div className="bg-[#2EC4B6]/10 border border-[#2EC4B6]/40 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-[#0B1F3A]">
            We found {ranked.length} practical match{ranked.length === 1 ? "" : "es"} that fit your preferences well — there simply aren't more destinations in the catalogue that meet these specific constraints.
          </p>
        </div>
      )}

      {top.length === 0 ? (
        <div className="text-center py-16 text-[#0B1F3A]/60">
          <p>No practical destinations were found for a {prefs.travelDays}-day trip from your location in the current catalogue.</p>
          <p className="mt-1">Try a longer trip, broader preferences, or nearby and domestic destinations.</p>
          <Button onClick={() => navigate("/questionnaire")} className="mt-4 bg-[#0B1F3A] min-h-11">Revise answers</Button>
        </div>
      ) : (
        <div className="space-y-5">
          {top.map(({ dest, result }) => (
            <DestinationCard key={dest.id} dest={dest} result={result} prefs={prefs} onSelect={selectDest} />
          ))}
        </div>
      )}
    </div>
  );
}

function DestinationCard({ dest, result, prefs, onSelect }) {
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
    finalScore >= 70
      ? "bg-[#2EC4B6] text-white"
      : finalScore >= 50
      ? "bg-[#0B1F3A] text-white"
      : finalScore >= 30
      ? "bg-[#E8A33D] text-white"
      : "bg-[#FF6B5B] text-white";
  const prac = result.practicality;
  const budgetLabel = (dest.budget_categories || []).join(" – ") || "Varies";
  const climateLabel = (dest.climate_tags || []).join(", ") || "Varies";

  return (
    <article className="bg-white rounded-2xl border border-[#E6E2D8] shadow-sm overflow-hidden">
      <div className="relative h-48 sm:h-56">
        <Image src={dest.image_url} alt={`${dest.name}, ${dest.country}`} fittingType="fill" fallbackSrc={TRAVEL_FALLBACK_IMAGE} className="w-full h-full" />
        <div className="absolute top-3 right-3 bg-[#0B1F3A] text-white text-sm font-semibold px-3 py-1 rounded-full">
          {finalScore}/100
        </div>
        <div className={`absolute top-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full ${labelClass}`}>
          {result.matchLabel}
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#0B1F3A]/85 to-transparent p-4">
          <h2 className="text-white text-lg font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#2EC4B6]" /> {dest.name}
          </h2>
          <p className="text-white/80 text-sm">{dest.country} · {dest.region}</p>
        </div>
      </div>

      <div className="p-5">
        <TravelFit prac={prac} prefs={prefs} />

        <ul className="space-y-1.5 mb-4">
          {reasons.map((r, i) => (
            <li key={i} className="text-sm text-[#0B1F3A]/80 flex gap-2">
              <span className="text-[#2EC4B6]">•</span> {r}
            </li>
          ))}
          {result.visited && (
            <li className="text-xs text-[#0B1F3A]/50">You've been before — ranked a little lower as a result.</li>
          )}
        </ul>

        <div className="grid grid-cols-3 gap-3 text-center mb-4">
          <Meta icon={Clock} label="Trip length" value={`${dest.min_days}–${dest.max_days}d`} />
          <Meta icon={Wallet} label="Budget" value={budgetLabel} />
          <Meta icon={MapPin} label="Climate" value={climateLabel} />
        </div>

        <div className="text-sm text-[#0B1F3A]/70 mb-4">
          <span className="font-medium text-[#0B1F3A]">Main experiences: </span>
          {(dest.top_experiences || []).slice(0, 4).join(" · ")}
        </div>
        <div className="text-sm text-[#0B1F3A]/70 mb-4">
          <span className="font-medium text-[#0B1F3A]">Suited to: </span>
          {(dest.traveller_types || []).join(", ")}
        </div>

        <button
          onClick={() => setOpen((o) => !o)}
          className="text-sm font-medium text-[#0B1F3A] underline hover:no-underline"
          aria-expanded={open}
        >
          {open ? "Hide score breakdown" : "See score breakdown"}
        </button>
        {open && (
          <div className="mt-3 space-y-2">
            {rows.map(([label, got, max]) => {
              const penalty = got < 0;
              return (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{label}</span>
                    <span className={`font-medium ${penalty ? "text-[#FF6B5B]" : ""}`}>
                      {penalty ? `${got}` : `${Math.round(got)}/${max}`}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#E6E2D8] overflow-hidden">
                    <div className={penalty ? "h-full bg-[#FF6B5B]" : "h-full bg-[#2EC4B6]"}
                      style={{ width: `${Math.max(0, (got / max) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="border-t border-[#E6E2D8] pt-3 mt-2 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span>Base preference score</span>
                <span className="font-medium">{result.baseScore}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Travel-practicality penalty</span>
                <span className="font-medium text-[#FF6B5B]">{result.travelPenalty > 0 ? `-${result.travelPenalty}` : "0"}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold pt-1">
                <span>Final match score</span>
                <span>{finalScore}/100</span>
              </div>
            </div>
          </div>
        )}

        <Button onClick={() => onSelect(dest.id)} className="w-full mt-5 bg-[#FF6B5B] hover:bg-[#FF6B5B]/90 text-white min-h-12">
          View My Trip <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </article>
  );
}

function Meta({ icon: Icon, label, value }) {
  return (
    <div className="bg-[#FBFAF7] rounded-lg py-2 px-1 border border-[#E6E2D8]">
      <Icon className="w-4 h-4 mx-auto text-[#0B1F3A]/50 mb-1" />
      <div className="text-[10px] text-[#0B1F3A]/50 uppercase tracking-wide">{label}</div>
      <div className="text-xs font-semibold">{value}</div>
    </div>
  );
}