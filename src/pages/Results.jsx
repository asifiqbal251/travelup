import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { base44 } from "@/api/base44Client";
import { getPrefs, setSelectedDestinationId } from "@/lib/storage";
import { rankDestinations, buildReasons } from "@/lib/scoring";
import { ArrowLeft, ArrowRight, Info, MapPin, Clock, Wallet } from "lucide-react";

export default function Results() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ranked, setRanked] = useState([]);
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Your top {top.length} matches</h1>
          <p className="text-sm text-[#0B1F3A]/60 mt-1">
            Scored out of 100 from your answers. Estimates only — see why below each card.
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
          availability. Always verify visa and entry requirements through official government sources
          for your citizenship.
        </p>
      </div>

      {top.length === 0 ? (
        <div className="text-center py-16 text-[#0B1F3A]/60">
          <p>No destinations matched your exclusions. Try revising your answers.</p>
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
    ["Pace & activity", b.pace, 10]
  ];
  const budgetLabel = (dest.budget_categories || []).join(" – ") || "Varies";
  const climateLabel = (dest.climate_tags || []).join(", ") || "Varies";

  return (
    <article className="bg-white rounded-2xl border border-[#E6E2D8] shadow-sm overflow-hidden">
      <div className="relative h-48 sm:h-56">
        <Image src={dest.image_url} alt={`${dest.name}, ${dest.country}`} fittingType="fill"
          className="w-full h-full" />
        <div className="absolute top-3 right-3 bg-[#0B1F3A] text-white text-sm font-semibold px-3 py-1 rounded-full">
          {result.score}/100
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#0B1F3A]/85 to-transparent p-4">
          <h2 className="text-white text-lg font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#2EC4B6]" /> {dest.name}
          </h2>
          <p className="text-white/80 text-sm">{dest.country} · {dest.region}</p>
        </div>
      </div>

      <div className="p-5">
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
            {rows.map(([label, got, max]) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1">
                  <span>{label}</span><span className="font-medium">{got}/{max}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#E6E2D8] overflow-hidden">
                  <div className="h-full bg-[#2EC4B6]" style={{ width: `${(got / max) * 100}%` }} />
                </div>
              </div>
            ))}
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