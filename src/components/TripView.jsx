import { useState } from "react";
import { Link } from "react-router-dom";
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
import TravelFitRing from "@/components/TravelFitRing";
import DayCard from "@/components/DayCard";
import { TRAVEL_FALLBACK_IMAGE } from "@/lib/fallbackImage";
import { nameWithCountry } from "@/lib/destinationLabel";
import { flagForCountry } from "@/lib/countryFlag";
import { BUDGET_ORDER } from "@/lib/options";
import { Check, Plus, Trash2, RotateCcw, Info, ArrowLeft } from "lucide-react";

// Single-entry arrays labelled "Emergency" are the common case (a unified
// number) -- show just the number since the "Emergency" label is redundant
// next to the "Emergency" row heading. Multi-entry arrays differ by service.
function formatEmergencyNumbers(list) {
  if (!Array.isArray(list) || list.length === 0) return "";
  if (list.length === 1 && String(list[0].service || "").trim().toLowerCase() === "emergency") {
    return list[0].number;
  }
  return list.map((e) => `${e.service} ${e.number}`).join(" · ");
}

// budget_categories arrays aren't stored in canonical order in the backend
// (e.g. ["Moderate","Comfortable","Budget"]), so a raw join produced garbled
// output like "Moderate – Comfortable – Budget". Sort to BUDGET_ORDER first.
function orderedBudgetLabel(categories) {
  return (categories || [])
    .slice()
    .sort((a, b) => BUDGET_ORDER.indexOf(a) - BUDGET_ORDER.indexOf(b))
    .join(" – ");
}

const INTENSITY_COLOR = {
  Light: "bg-wn-surface-2-l text-wn-text-2-l",
  Moderate: "bg-wn-text-l/10 text-wn-text-l",
  High: "bg-wn-text-l text-white",
  "Highly active": "bg-wn-text-l text-white"
};

// Full-bleed dark hero -- the trip page's entry point, so the destination
// name lives here as a real H1 on a real route (not only inside a modal).
// Same treatment as the Results page hero card: photo, scrim, Travel Fit
// ring, name. The light tab content (rendered by the caller, below this)
// overlaps its top edge with a negative margin so it visually slides up
// over the hero instead of cutting to light abruptly.
export function TripHeader({ display, score, backHref, backLabel }) {
  return (
    <div data-trip-hero className="relative w-full h-[52vh] sm:h-[58vh] min-h-[380px] max-h-[620px] bg-wn-page overflow-hidden">
      <Image
        src={display.imageUrl}
        alt={nameWithCountry(display.name, display.country)}
        fittingType="fill"
        fallbackSrc={TRAVEL_FALLBACK_IMAGE}
        className="w-full h-full"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(6,16,31,0.92) 0%, rgba(6,16,31,0.45) 55%, rgba(6,16,31,0.1) 100%)"
        }}
      />
      {backHref && (
        <Link
          to={backHref}
          aria-label={backLabel || "Back"}
          className="glass-badge absolute top-4 left-4 sm:left-6 h-11 w-11 rounded-full flex items-center justify-center text-wn-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
      )}
      {typeof score === "number" && (
        <span className="absolute top-4 right-4 sm:right-6">
          <TravelFitRing score={score} size="lg" />
        </span>
      )}
      <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-6 pb-8 sm:pb-10">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-display font-extrabold tracking-[-0.02em] text-wn-text text-4xl sm:text-5xl">
            {display.name}
          </h1>
          <p className="text-wn-text-2 text-[15px] sm:text-base mt-2 flex items-center gap-2">
            {flagForCountry(display.country) && <span aria-hidden="true">{flagForCountry(display.country)}</span>}
            {display.country} · {display.region}
          </p>
        </div>
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
      {travelFit && (
        <div className="mb-6">
          <TravelFit
            prac={travelFit}
            notes={{
              airportTransferNote: display.airportTransferNote,
              localTransportNote: display.localTransportNote,
              intercityNote: display.intercityNote
            }}
          />
          <TripBudget display={display} travelFit={travelFit} />
        </div>
      )}
      <div className="sticky top-16 z-20 -mx-4 px-4 py-2 bg-wn-page-l border-b border-wn-line-l">
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
    return <p className="text-wn-text-2-l">No itinerary available for this combination.</p>;
  }
  return (
    <div>
      <p className="text-[15px] text-wn-text-2-l mb-5">
        A suggested {itinerary.length}-day plan including outbound and return travel. Indicative
        only — verify opening hours and tickets before you go.
      </p>
      <div className="relative">
        <span className="absolute left-4 top-4 bottom-4 w-px bg-wn-line-l" aria-hidden="true" />
        <div className="space-y-5">
          {itinerary.map((d) => (
            <div key={d.day} className="relative flex gap-4">
              <span
                className="relative z-10 flex-shrink-0 w-8 h-8 rounded-full bg-wn-surface-l ring-1 ring-wn-line-l flex items-center justify-center font-display text-xs font-bold text-wn-text-l"
                aria-hidden="true"
              >
                {d.day}
              </span>
              <div className="flex-1 min-w-0">
                <DayCard
                  day={d}
                  isOpen={openDay === d.day}
                  badge={INTENSITY_COLOR[d.intensity] || ""}
                  onToggle={() => setOpenDay((cur) => (cur === d.day ? null : d.day))}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
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
        <div className="text-sm text-wn-text-2-l">
          <span className="font-semibold text-wn-text-l">{done}</span> / {totalItems} packed · {progress}%
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
            className="min-h-11 flex-1 bg-wn-surface-l"
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
          />
          <Select value={newCat} onValueChange={setNewCat}>
            <SelectTrigger className="min-h-11 sm:w-48 bg-wn-surface-l" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(groups || []).map((g) => (
                <SelectItem key={g.category} value={g.category}>{g.category}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={addCustom} className="bg-wn-text-l hover:bg-wn-text-l/90 text-white min-h-11">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {(groups || []).map((group) => {
          const customInCat = customItems.filter((c) => c.category === group.category);
          return (
            <div key={group.category}>
              <h3 className="font-display text-sm font-bold text-wn-text-l mb-3">{group.category}</h3>
              <ul className="divide-y divide-wn-line-l">
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
        className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan ${
          checked ? "bg-wn-text-l text-white" : "ring-1 ring-wn-line-l bg-wn-surface-l hover:ring-wn-cyan"
        }`}
      >
        {checked && <Check className="w-4 h-4" />}
      </button>
      <span className={`text-sm flex-1 ${checked ? "line-through text-wn-text-2-l" : "text-wn-text-l"}`}>
        {label}
      </span>
      {custom && (
        <button
          onClick={() => onRemove(id)}
          aria-label={`Remove ${label}`}
          className="text-wn-text-2-l hover:text-destructive p-1 min-h-9 min-w-9"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </li>
  );
}

// Three daily cost tiers plus an estimated total for the trip. All-or-nothing:
// any missing tier hides the whole panel rather than showing partial data.
// Trip total reuses usableDestinationDays from practicality.js (assessed
// once in TripDetail/SavedTripDetail) rather than recalculating travel time.
function TripBudget({ display, travelFit }) {
  const { dailyCostLow, dailyCostMid, dailyCostHigh } = display;
  if (typeof dailyCostLow !== "number" || typeof dailyCostMid !== "number" || typeof dailyCostHigh !== "number") {
    return null;
  }
  const days = typeof travelFit.usableDestinationDays === "number" ? travelFit.usableDestinationDays : null;
  const tiers = [
    { label: "Budget", daily: dailyCostLow },
    { label: "Mid-range", daily: dailyCostMid },
    { label: "Comfort", daily: dailyCostHigh }
  ];

  return (
    <section aria-label="Estimated trip budget" className="rounded-2xl bg-wn-surface-l p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm font-bold text-wn-text-l">Estimated trip budget</h3>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-wn-text-2-l">Estimate</span>
      </div>
      <dl className="grid grid-cols-3 gap-2 sm:gap-4">
        {tiers.map((t) => (
          <div key={t.label} className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wide text-wn-text-2-l truncate">{t.label}</dt>
            <dd className="text-[15px] font-semibold text-wn-text-l mt-1 tabular-nums">
              ${t.daily}<span className="text-wn-text-2-l font-normal">/day</span>
            </dd>
            {days != null && (
              <dd className="text-xs text-wn-text-2-l mt-0.5 tabular-nums">
                ~${Math.round(t.daily * days)} total
              </dd>
            )}
          </div>
        ))}
      </dl>
      <p className="text-xs text-wn-text-2-l mt-3 pt-3 border-t border-wn-line-l">
        Per-person daily estimate{days != null ? ` for ${days} day${days === 1 ? "" : "s"} at the destination` : ""} —
        accommodation, food, local transport and activities. <span className="font-semibold text-wn-text-l">Flights are not included.</span>
      </p>
    </section>
  );
}

function OverviewView({ display }) {
  return (
    <div className="space-y-6">
      <p className="text-wn-text-l/80 leading-relaxed">{display.intro}</p>

      <div>
        <h3 className="font-display font-bold text-wn-text-l mb-3">Top experiences</h3>
        <ul className="space-y-2 text-sm text-wn-text-l/80">
          {(display.topExperiences || []).map((e, i) => (
            <li key={i} className="flex gap-2"><span className="text-wn-text-l/40">•</span>{e}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-display font-bold text-wn-text-l mb-3">Good to know</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4 py-2 border-b border-wn-line-l"><dt className="text-wn-text-2-l">Best for</dt><dd className="text-wn-text-l text-right">{display.bestForSummary}</dd></div>
          <div className="flex justify-between gap-4 py-2 border-b border-wn-line-l"><dt className="text-wn-text-2-l">Suggested length</dt><dd className="text-wn-text-l">{display.minDays}–{display.maxDays} days</dd></div>
          <div className="flex justify-between gap-4 py-2 border-b border-wn-line-l"><dt className="text-wn-text-2-l">Budget</dt><dd className="text-wn-text-l text-right">{orderedBudgetLabel(display.budgetCategories)}</dd></div>
          <div className="flex justify-between gap-4 py-2 border-b border-wn-line-l"><dt className="text-wn-text-2-l">Climate</dt><dd className="text-wn-text-l text-right">{(display.climateTags || []).join(", ")}</dd></div>
          <div className="flex justify-between gap-4 py-2 border-b border-wn-line-l"><dt className="text-wn-text-2-l">Suited to</dt><dd className="text-wn-text-l text-right">{(display.travellerTypes || []).join(", ")}</dd></div>
          <div className="flex justify-between gap-4 py-2"><dt className="text-wn-text-2-l">Dietary notes</dt><dd className="text-wn-text-l text-right">{display.dietaryNotes}</dd></div>
        </dl>
      </div>

      <TravelEssentials display={display} />

      <div className="rounded-2xl bg-wn-surface-2-l ring-1 ring-wn-line-l p-4 flex gap-3">
        <Info className="w-5 h-5 text-wn-text-2-l flex-shrink-0 mt-0.5" />
        <p className="text-sm text-wn-text-l/75">
          Visa &amp; entry: This is general guidance only. Always confirm visa requirements, entry
          conditions, safety and travel advisories through official government sources for your
          citizenship before booking.
        </p>
      </div>
    </div>
  );
}

// Grouped rather than one flat list of 8 rows: short facts (currency,
// languages, power) as at-a-glance rows, emergency numbers called out on
// their own, longer sentence fields (connectivity/payment/tipping/etiquette)
// as stacked prose since right-aligning a full sentence next to a label
// reads badly. Every field, and the whole section, hides independently when
// empty -- destinations can be filled in incrementally without ever looking
// broken.
function TravelEssentials({ display }) {
  const {
    currencyCode, currencyName, languages, plugTypes, voltage,
    emergencyNumbers, connectivityNote, etiquetteNotes, tippingNorm, paymentNorm
  } = display;

  const currency = [currencyCode, currencyName].filter(Boolean).join(" – ");
  const languageLine = (languages || []).join(", ");
  const power = [
    (plugTypes || []).length ? `Type ${plugTypes.join("/")}` : "",
    voltage || ""
  ].filter(Boolean).join(" · ");
  const emergencyLine = formatEmergencyNumbers(emergencyNumbers);

  const glanceRows = [
    currency && ["Currency", currency],
    languageLine && ["Languages", languageLine],
    power && ["Power", power]
  ].filter(Boolean);

  const proseRows = [
    connectivityNote && ["Connectivity", connectivityNote],
    paymentNorm && ["Payment", paymentNorm],
    tippingNorm && ["Tipping", tippingNorm]
  ].filter(Boolean);

  const hasEtiquette = Array.isArray(etiquetteNotes) && etiquetteNotes.length > 0;

  if (!glanceRows.length && !emergencyLine && !proseRows.length && !hasEtiquette) return null;

  return (
    <div>
      <h3 className="font-display font-bold text-wn-text-l mb-3">Travel essentials</h3>

      {glanceRows.length > 0 && (
        <dl className="space-y-2 text-sm">
          {glanceRows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2 border-b border-wn-line-l">
              <dt className="text-wn-text-2-l">{label}</dt>
              <dd className="text-wn-text-l text-right">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {emergencyLine && (
        <div className="flex items-center justify-between gap-4 rounded-xl bg-wn-surface-2-l ring-1 ring-wn-line-l px-4 py-3 mt-3">
          <span className="text-sm text-wn-text-2-l">Emergency</span>
          <span className="text-sm font-semibold text-wn-text-l text-right">{emergencyLine}</span>
        </div>
      )}

      {(proseRows.length > 0 || hasEtiquette) && (
        <div className={`space-y-2.5 text-sm ${glanceRows.length || emergencyLine ? "mt-4" : ""}`}>
          {proseRows.map(([label, text]) => (
            <p key={label} className="text-wn-text-l/80 leading-relaxed">
              <span className="font-medium text-wn-text-l">{label}: </span>{text}
            </p>
          ))}
          {hasEtiquette && (
            <ul className="space-y-1.5 pt-1">
              {etiquetteNotes.map((note, i) => (
                <li key={i} className="flex gap-2 text-wn-text-l/80"><span className="text-wn-text-l/40">•</span>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}