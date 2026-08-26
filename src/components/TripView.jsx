import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Image } from "@/components/ui/image";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel
} from "@/components/ui/alert-dialog";
import DayCard from "@/components/DayCard";
import { TRAVEL_FALLBACK_IMAGE } from "@/lib/fallbackImage";
import { Check, Plus, Trash2, RotateCcw, Info } from "lucide-react";

const INTENSITY_COLOR = {
  Light: "bg-[#2EC4B6]/15 text-[#0E7A6E]",
  Moderate: "bg-[#0B1F3A]/10 text-[#0B1F3A]",
  High: "bg-[#FF6B5B]/15 text-[#C04A3D]",
  "Highly active": "bg-[#FF6B5B]/15 text-[#C04A3D]"
};

// Shared destination header banner (image + name + region). `display` is the
// normalized destination display object (see normalizeDestinationDisplay).
export function TripHeader({ display }) {
  return (
    <div className="relative h-52 sm:h-64 rounded-2xl overflow-hidden mb-6">
      <Image
        src={display.imageUrl}
        alt={`${display.name}, ${display.country}`}
        fittingType="fill"
        fallbackSrc={TRAVEL_FALLBACK_IMAGE}
        className="w-full h-full"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/85 to-transparent" />
      <div className="absolute bottom-0 p-5 text-white">
        <h1 className="text-2xl font-semibold">{display.name}</h1>
        <p className="text-white/80">{display.country} · {display.region}</p>
      </div>
    </div>
  );
}

// Shared Itinerary / Packing / Overview tabs. Both the live Trip Detail page and
// the Saved Trip detail page render through this component so presentation
// stays identical. `packingHandlers` = { onToggle, onAdd, onRemove, onReset };
// each page wires these to its own backing store.
export default function TripView({
  display, itinerary, packingGroups, packingState, packingHandlers
}) {
  return (
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
        <PackingView
          groups={packingGroups}
          state={packingState}
          handlers={packingHandlers}
        />
      </TabsContent>
      <TabsContent value="overview">
        <OverviewView display={display} />
      </TabsContent>
    </Tabs>
  );
}

function ItineraryView({ itinerary }) {
  const [openDay, setOpenDay] = useState(1);
  if (!itinerary || !itinerary.length) {
    return <p className="text-[#0B1F3A]/60">No itinerary available for this combination.</p>;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#0B1F3A]/60">
        A suggested {itinerary.length}-day plan including outbound and return travel. Indicative
        only — verify opening hours and tickets before you go.
      </p>
      {itinerary.map((d) => (
        <DayCard
          key={d.day}
          day={d}
          isOpen={openDay === d.day}
          badge={INTENSITY_COLOR[d.intensity] || ""}
          onToggle={() => setOpenDay((cur) => (cur === d.day ? null : d.day))}
        />
      ))}
    </div>
  );
}

function PackingView({ groups, state, handlers }) {
  const [resetOpen, setResetOpen] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [newCat, setNewCat] = useState((groups && groups[0] && groups[0].category) || "Optional items");
  const { onToggle, onAdd, onRemove, onReset } = handlers || {};

  const addCustom = () => {
    const label = newItem.trim();
    if (!label) return;
    onAdd(label, newCat);
    setNewItem("");
  };
  const confirmReset = () => { onReset(); setResetOpen(false); };

  const checkedItemIds = (state && state.checkedItemIds) || [];
  const customItems = (state && state.customItems) || [];
  const isChecked = (id) => checkedItemIds.includes(id);
  const totalItems = (groups || []).reduce((n, g) => n + g.items.length, 0) + customItems.length;
  const done = checkedItemIds.length;
  const progress = totalItems ? Math.round((done / totalItems) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="text-sm text-[#0B1F3A]/70">
          <span className="font-semibold text-[#0B1F3A]">{done}</span> / {totalItems} packed · {progress}%
        </div>
        <Button variant="outline" size="sm" onClick={() => setResetOpen(true)} className="min-h-9">
          <RotateCcw className="w-4 h-4 mr-2" /> Reset
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-[#E6E2D8] p-4 mb-5">
        <Label>Add a custom item</Label>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="e.g. Travel pillow"
            className="min-h-11 flex-1"
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
          />
          <Select value={newCat} onValueChange={setNewCat}>
            <SelectTrigger className="min-h-11 sm:w-48" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(groups || []).map((g) => (
                <SelectItem key={g.category} value={g.category}>{g.category}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={addCustom} className="bg-[#0B1F3A] hover:bg-[#0B1F3A]/90 min-h-11">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      <div className="space-y-5">
        {(groups || []).map((group) => {
          const customInCat = customItems.filter((c) => c.category === group.category);
          return (
            <div key={group.category}>
              <h3 className="text-sm font-semibold text-[#0B1F3A] mb-2">{group.category}</h3>
              <ul className="bg-white rounded-xl border border-[#E6E2D8] divide-y divide-[#E6E2D8] overflow-hidden">
                {group.items.map((item) => (
                  <PackingRow
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    checked={isChecked(item.id)}
                    onToggle={onToggle}
                  />
                ))}
                {customInCat.map((c) => (
                  <PackingRow
                    key={c.id}
                    id={c.id}
                    label={c.label}
                    custom
                    checked={isChecked(c.id)}
                    onToggle={onToggle}
                    onRemove={onRemove}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset packing progress?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears all checked items and custom items for this trip.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReset}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PackingRow({ id, label, checked, onToggle, custom, onRemove }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 min-h-11">
      <button
        onClick={() => onToggle(id)}
        role="checkbox"
        aria-checked={checked}
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
        <button
          onClick={() => onRemove(id)}
          aria-label={`Remove ${label}`}
          className="text-[#0B1F3A]/40 hover:text-[#FF6B5B] p-1 min-h-9 min-w-9"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </li>
  );
}

function OverviewView({ display }) {
  return (
    <div className="space-y-5">
      <p className="text-[#0B1F3A]/80">{display.intro}</p>

      <Section title="Top experiences">
        <ul className="list-disc list-inside space-y-1 text-sm text-[#0B1F3A]/80">
          {(display.topExperiences || []).map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      </Section>

      <Section title="Good to know">
        <ul className="space-y-2 text-sm text-[#0B1F3A]/80">
          <li><span className="font-medium">Best months: </span>{display.bestForSummary}</li>
          <li><span className="font-medium">Suggested length: </span>{display.minDays}–{display.maxDays} days</li>
          <li><span className="font-medium">Budget: </span>{(display.budgetCategories || []).join(" – ")}</li>
          <li><span className="font-medium">Climate: </span>{(display.climateTags || []).join(", ")}</li>
          <li><span className="font-medium">Suited to: </span>{(display.travellerTypes || []).join(", ")}</li>
          <li><span className="font-medium">Dietary notes: </span>{display.dietaryNotes}</li>
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