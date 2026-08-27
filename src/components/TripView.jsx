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
import TravelFit from "@/components/TravelFit";
import DayCard from "@/components/DayCard";
import { TRAVEL_FALLBACK_IMAGE } from "@/lib/fallbackImage";
import { Check, Plus, Trash2, RotateCcw, Info } from "lucide-react";

const INTENSITY_COLOR = {
  Light: "bg-teal/15 text-teal",
  Moderate: "bg-ink/10 text-ink",
  High: "bg-coral/15 text-coral",
  "Highly active": "bg-coral/15 text-coral"
};

// Larger editorial destination hero: natural image brightness, localized
// contrast gradient, strong destination typography.
export function TripHeader({ display }) {
  return (
    <div className="relative h-60 sm:h-72 rounded-3xl overflow-hidden mb-6">
      <Image
        src={display.imageUrl}
        alt={`${display.name}, ${display.country}`}
        fittingType="fill"
        fallbackSrc={TRAVEL_FALLBACK_IMAGE}
        className="w-full h-full"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(7,24,39,0.9) 0%, rgba(7,24,39,0.35) 45%, rgba(7,24,39,0) 100%)"
        }}
      />
      <div className="absolute bottom-0 p-6 text-on-dark">
        <h1 className="font-display text-3xl sm:text-4xl font-bold">{display.name}</h1>
        <p className="text-on-dark/85">{display.country} · {display.region}</p>
      </div>
    </div>
  );
}

// Shared Itinerary / Packing / Overview tabs. Both the live Trip Detail page and
// the Saved Trip detail page render through this component. `travelFit` is
// optional and, when present, renders the Travel Fit summary strip.
export default function TripView({
  display, itinerary, packingGroups, packingState, packingHandlers, travelFit
}) {
  return (
    <Tabs defaultValue="itinerary" className="w-full">
      {travelFit && <div className="mb-6"><TravelFit prac={travelFit} /></div>}
      <div className="sticky top-16 z-20 -mx-4 px-4 py-2 bg-workflow/95 backdrop-blur">
        <TabsList className="grid grid-cols-3 w-full max-w-md mx-auto">
          <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
          <TabsTrigger value="packing">Packing</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="itinerary" className="mt-6">
        <ItineraryView itinerary={itinerary} />
      </TabsContent>
      <TabsContent value="packing" className="mt-6">
        <PackingView
          groups={packingGroups}
          state={packingState}
          handlers={packingHandlers}
        />
      </TabsContent>
      <TabsContent value="overview" className="mt-6">
        <OverviewView display={display} />
      </TabsContent>
    </Tabs>
  );
}

function ItineraryView({ itinerary }) {
  const [openDay, setOpenDay] = useState(1);
  if (!itinerary || !itinerary.length) {
    return <p className="text-muted-foreground">No itinerary available for this combination.</p>;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
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
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-ink">{done}</span> / {totalItems} packed · {progress}%
        </div>
        <Button variant="outline" size="sm" onClick={() => setResetOpen(true)} className="min-h-9">
          <RotateCcw className="w-4 h-4 mr-2" /> Reset
        </Button>
      </div>

      <div className="mb-6">
        <Label>Add a custom item</Label>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="e.g. Travel pillow"
            className="min-h-11 flex-1 bg-card"
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
          />
          <Select value={newCat} onValueChange={setNewCat}>
            <SelectTrigger className="min-h-11 sm:w-48 bg-card" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(groups || []).map((g) => (
                <SelectItem key={g.category} value={g.category}>{g.category}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={addCustom} className="bg-ink hover:bg-ink/90 text-on-dark min-h-11">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {(groups || []).map((group) => {
          const customInCat = customItems.filter((c) => c.category === group.category);
          return (
            <div key={group.category}>
              <h3 className="font-display text-sm font-bold text-ink mb-3">{group.category}</h3>
              <ul className="divide-y divide-border">
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
    <li className="flex items-center gap-3 py-3 min-h-11">
      <button
        onClick={() => onToggle(id)}
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${
          checked ? "bg-teal text-cinema" : "ring-1 ring-border bg-card hover:ring-teal"
        }`}
      >
        {checked && <Check className="w-4 h-4" />}
      </button>
      <span className={`text-sm flex-1 ${checked ? "line-through text-muted-foreground" : "text-ink"}`}>
        {label}
      </span>
      {custom && (
        <button
          onClick={() => onRemove(id)}
          aria-label={`Remove ${label}`}
          className="text-muted-foreground hover:text-destructive p-1 min-h-9 min-w-9"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </li>
  );
}

function OverviewView({ display }) {
  return (
    <div className="space-y-6">
      <p className="text-ink/80 leading-relaxed">{display.intro}</p>

      <div>
        <h3 className="font-display font-bold text-ink mb-3">Top experiences</h3>
        <ul className="space-y-2 text-sm text-ink/80">
          {(display.topExperiences || []).map((e, i) => (
            <li key={i} className="flex gap-2"><span className="text-teal">•</span>{e}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-display font-bold text-ink mb-3">Good to know</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4 py-2 border-b border-border"><dt className="text-muted-foreground">Best months</dt><dd className="text-ink text-right">{display.bestForSummary}</dd></div>
          <div className="flex justify-between gap-4 py-2 border-b border-border"><dt className="text-muted-foreground">Suggested length</dt><dd className="text-ink">{display.minDays}–{display.maxDays} days</dd></div>
          <div className="flex justify-between gap-4 py-2 border-b border-border"><dt className="text-muted-foreground">Budget</dt><dd className="text-ink text-right">{(display.budgetCategories || []).join(" – ")}</dd></div>
          <div className="flex justify-between gap-4 py-2 border-b border-border"><dt className="text-muted-foreground">Climate</dt><dd className="text-ink text-right">{(display.climateTags || []).join(", ")}</dd></div>
          <div className="flex justify-between gap-4 py-2 border-b border-border"><dt className="text-muted-foreground">Suited to</dt><dd className="text-ink text-right">{(display.travellerTypes || []).join(", ")}</dd></div>
          <div className="flex justify-between gap-4 py-2"><dt className="text-muted-foreground">Dietary notes</dt><dd className="text-ink text-right">{display.dietaryNotes}</dd></div>
        </dl>
      </div>

      <div className="rounded-2xl bg-teal/8 ring-1 ring-teal/25 p-4 flex gap-3">
        <Info className="w-5 h-5 text-teal flex-shrink-0 mt-0.5" />
        <p className="text-sm text-ink/75">
          Visa &amp; entry: This is general guidance only. Always confirm visa requirements, entry
          conditions, safety and travel advisories through official government sources for your
          citizenship before booking.
        </p>
      </div>
    </div>
  );
}