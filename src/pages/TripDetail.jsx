import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Image } from "@/components/ui/image";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { base44 } from "@/api/base44Client";
import {
  getSelectedDestinationId, getPrefs, getPackingState, setPackingState
} from "@/lib/storage";
import { generateItinerary } from "@/lib/itinerary";
import { generatePackingList } from "@/lib/packing";
import { ArrowLeft, Check, Plus, Trash2, RotateCcw, Info } from "lucide-react";

export default function TripDetail() {
  const navigate = useNavigate();
  const [dest, setDest] = useState(null);
  const [prefs, setPrefsState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = getSelectedDestinationId();
    const p = getPrefs();
    if (!id || !p) {
      navigate("/results");
      return;
    }
    setPrefsState(p);
    base44.entities.Destination.get(id)
      .then((d) => { setDest(d); setLoading(false); })
      .catch(() => { navigate("/results"); });
  }, [navigate]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center text-[#0B1F3A]/60">
        <div className="w-8 h-8 mx-auto border-4 border-[#E6E2D8] border-t-[#2EC4B6] rounded-full animate-spin mb-4" />
        Building your trip…
      </div>
    );
  }

  const itinerary = generateItinerary(dest, prefs);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Button variant="ghost" onClick={() => navigate("/results")} className="mb-4 min-h-11">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to matches
      </Button>

      <div className="relative h-52 sm:h-64 rounded-2xl overflow-hidden mb-6">
        <Image src={dest.image_url} alt={`${dest.name}, ${dest.country}`} fittingType="fill"
          className="w-full h-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/85 to-transparent" />
        <div className="absolute bottom-0 p-5 text-white">
          <h1 className="text-2xl font-semibold">{dest.name}</h1>
          <p className="text-white/80">{dest.country} · {dest.region}</p>
        </div>
      </div>

      <Tabs defaultValue="itinerary" className="w-full">
        <TabsList className="grid grid-cols-3 w-full mb-6">
          <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
          <TabsTrigger value="packing">Packing</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="itinerary">
          <ItineraryView itinerary={itinerary} />
        </TabsContent>
        <TabsContent value="packing">
          <PackingView dest={dest} prefs={prefs} />
        </TabsContent>
        <TabsContent value="overview">
          <OverviewView dest={dest} prefs={prefs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ItineraryView({ itinerary }) {
  if (!itinerary.length) {
    return <p className="text-[#0B1F3A]/60">No itinerary available for this combination.</p>;
  }
  const intensityColor = {
    Light: "bg-[#2EC4B6]/15 text-[#0E7A6E]",
    Moderate: "bg-[#0B1F3A]/10 text-[#0B1F3A]",
    High: "bg-[#FF6B5B]/15 text-[#C04A3D]"
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#0B1F3A]/60">
        A suggested {itinerary.length}-day plan based on your interests, pace and activity level. Adjust as you like.
      </p>
      {itinerary.map((d) => (
        <div key={d.day} className="bg-white rounded-2xl border border-[#E6E2D8] shadow-sm p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-xs font-semibold text-[#2EC4B6] uppercase tracking-wide">Day {d.day}</div>
              <h3 className="font-semibold">{d.title}</h3>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${intensityColor[d.intensity] || ""}`}>
              {d.intensity} intensity
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <Plan time="Morning" text={d.morning} />
            <Plan time="Afternoon" text={d.afternoon} />
            <Plan time="Evening" text={d.evening} />
          </div>
          {d.food_note && (
            <p className="mt-3 text-sm text-[#0B1F3A]/70 bg-[#FBFAF7] rounded-lg p-3 border border-[#E6E2D8]">
              <span className="font-medium">Local bite: </span>{d.food_note}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function Plan({ time, text }) {
  return (
    <div className="flex gap-3">
      <span className="text-xs font-medium text-[#0B1F3A]/45 w-16 flex-shrink-0 pt-0.5">{time}</span>
      <span className="text-[#0B1F3A]/80">{text}</span>
    </div>
  );
}

function PackingView({ dest, prefs }) {
  const list = generatePackingList(dest, prefs);
  const [state, setState] = useState(() => getPackingState(dest.id));
  const [newItem, setNewItem] = useState("");
  const [newCat, setNewCat] = useState(list[0]?.category || "Optional items");

  const persist = (next) => {
    setState(next);
    setPackingState(dest.id, next);
  };

  const toggle = (id) => {
    const checked = state.checked.includes(id)
      ? state.checked.filter((x) => x !== id)
      : [...state.checked, id];
    persist({ ...state, checked });
  };

  const addCustom = () => {
    const label = newItem.trim();
    if (!label) return;
    const id = `custom-${Date.now()}`;
    persist({
      checked: [...state.checked, id],
      custom: [...state.custom, { id, label, category: newCat }]
    });
    setNewItem("");
  };

  const removeCustom = (id) => {
    persist({
      checked: state.checked.filter((x) => x !== id),
      custom: state.custom.filter((c) => c.id !== id)
    });
  };

  const reset = () => {
    if (window.confirm("Reset packing progress for this destination?")) {
      persist({ checked: [], custom: [] });
    }
  };

  const isChecked = (id) => state.checked.includes(id);
  const totalItems = list.reduce((n, g) => n + g.items.length, 0) + state.custom.length;
  const done = state.checked.length;
  const progress = totalItems ? Math.round((done / totalItems) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="text-sm text-[#0B1F3A]/70">
          <span className="font-semibold text-[#0B1F3A]">{done}</span> / {totalItems} packed · {progress}%
        </div>
        <Button variant="outline" size="sm" onClick={reset} className="min-h-9">
          <RotateCcw className="w-4 h-4 mr-2" /> Reset
        </Button>
      </div>

      {/* Add custom item */}
      <div className="bg-white rounded-xl border border-[#E6E2D8] p-4 mb-5">
        <Label>Add a custom item</Label>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <Input value={newItem} onChange={(e) => setNewItem(e.target.value)}
            placeholder="e.g. Travel pillow" className="min-h-11 flex-1"
            onKeyDown={(e) => e.key === "Enter" && addCustom()} />
          <Select value={newCat} onValueChange={setNewCat}>
            <SelectTrigger className="min-h-11 sm:w-48" aria-label="Category"><SelectValue /></SelectTrigger>
            <SelectContent>
              {list.map((g) => <SelectItem key={g.category} value={g.category}>{g.category}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={addCustom} className="bg-[#0B1F3A] hover:bg-[#0B1F3A]/90 min-h-11">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      <div className="space-y-5">
        {list.map((group) => {
          const customInCat = state.custom.filter((c) => c.category === group.category);
          return (
            <div key={group.category}>
              <h3 className="text-sm font-semibold text-[#0B1F3A] mb-2">{group.category}</h3>
              <ul className="bg-white rounded-xl border border-[#E6E2D8] divide-y divide-[#E6E2D8] overflow-hidden">
                {group.items.map((item) => (
                  <PackingRow key={item.id} id={item.id} label={item.label}
                    checked={isChecked(item.id)} onToggle={toggle} />
                ))}
                {customInCat.map((c) => (
                  <PackingRow key={c.id} id={c.id} label={c.label} custom
                    checked={isChecked(c.id)} onToggle={toggle} onRemove={removeCustom} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PackingRow({ id, label, checked, onToggle, custom, onRemove }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 min-h-11">
      <button
        onClick={() => onToggle(id)}
        role="checkbox" aria-checked={checked}
        aria-label={label}
        className={`w-6 h-6 rounded-md border flex items-center justify-center flex-shrink-0 transition ${
          checked ? "bg-[#2EC4B6] border-[#2EC4B6]" : "border-[#C9C3B6] hover:border-[#2EC4B6]"
        }`}
      >
        {checked && <Check className="w-4 h-4 text-white" />}
      </button>
      <span className={`text-sm flex-1 ${checked ? "line-through text-[#0B1F3A]/40" : "text-[#0B1F3A]"}`}>
        {label}
      </span>
      {custom && (
        <button onClick={() => onRemove(id)} aria-label={`Remove ${label}`}
          className="text-[#0B1F3A]/40 hover:text-[#FF6B5B] p-1 min-h-9 min-w-9">
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </li>
  );
}

function OverviewView({ dest, prefs }) {
  return (
    <div className="space-y-5">
      <p className="text-[#0B1F3A]/80">{dest.intro}</p>

      <Section title="Top experiences">
        <ul className="list-disc list-inside space-y-1 text-sm text-[#0B1F3A]/80">
          {(dest.top_experiences || []).map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      </Section>

      <Section title="Good to know">
        <ul className="space-y-2 text-sm text-[#0B1F3A]/80">
          <li><span className="font-medium">Best months: </span>{dest.best_for_summary}</li>
          <li><span className="font-medium">Suggested length: </span>{dest.min_days}–{dest.max_days} days</li>
          <li><span className="font-medium">Budget: </span>{(dest.budget_categories || []).join(" – ")}</li>
          <li><span className="font-medium">Climate: </span>{(dest.climate_tags || []).join(", ")}</li>
          <li><span className="font-medium">Suited to: </span>{(dest.traveller_types || []).join(", ")}</li>
          <li><span className="font-medium">Dietary notes: </span>{dest.dietary_notes}</li>
        </ul>
      </Section>

      <div className="bg-[#0B1F3A]/5 border border-[#2EC4B6]/30 rounded-xl p-4 flex gap-3">
        <Info className="w-5 h-5 text-[#0B1F3A] flex-shrink-0 mt-0.5" />
        <p className="text-sm text-[#0B1F3A]/75">
          Visa &amp; entry: This is general guidance only. Always confirm visa requirements, entry
          conditions, safety and travel advisories through official government sources for your
          citizenship before booking.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-[#E6E2D8] p-5">
      <h3 className="font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}