import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Image } from "@/components/ui/image";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import TravelFit from "@/components/TravelFit";
import TravelFitRing from "@/components/TravelFitRing";
import DayCard from "@/components/DayCard";
import PackingView, { packingCategorySummaries } from "@/components/PackingView";
import { TRAVEL_FALLBACK_IMAGE } from "@/lib/fallbackImage";
import { nameWithCountry } from "@/lib/destinationLabel";
import { flagForCountry } from "@/lib/countryFlag";
import { BUDGET_ORDER } from "@/lib/options";
import { cn } from "@/lib/utils";
import { scrollToId } from "@/lib/scrollNav";
import { useScrollSpy } from "@/hooks/useScrollSpy";
import { useMeasuredHeight } from "@/hooks/useMeasuredHeight";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowLeft, ShieldCheck, ExternalLink, PlaneTakeoff, Footprints } from "lucide-react";

// The shared tab bar sticks at top-16 (see the wrapper below) -- 64px,
// matching TravelUpLayout's fixed header. Kept as a literal here rather than
// importing NAV_HEIGHT from that layout component: this is a Tailwind
// utility value (top-16), not a runtime measurement, and the two are
// independent surfaces that happen to agree today.
const TAB_BAR_STICKY_TOP = 64;

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

// entry_last_reviewed is an ISO date string; presented as "Checked <Month
// Year>" per product decision so users can judge staleness at a glance
// rather than parsing a raw date. timeZone: "UTC" avoids the review month
// shifting backward a day in negative-UTC-offset browsers.
function formatReviewedDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Checked ${d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}`;
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

// Which Overview subsections actually have content for this destination --
// mirrors each section's own hide-when-empty check below so the jump-nav
// pill list never points at a section that would render nothing.
function overviewSectionFlags(display) {
  const hasVisa = !!(
    display.entryOverview ||
    display.passportValidity ||
    display.typicalTouristStay ||
    (Array.isArray(display.entryRequirementsNotes) && display.entryRequirementsNotes.length > 0) ||
    formatReviewedDate(display.entryLastReviewed)
  );
  const hasBudget =
    typeof display.dailyCostLow === "number" &&
    typeof display.dailyCostMid === "number" &&
    typeof display.dailyCostHigh === "number";
  const hasClimate = (display.climateTags || []).length > 0;
  const hasPractical = !!(
    display.currencyCode || display.currencyName ||
    (display.languages || []).length ||
    (display.plugTypes || []).length || display.voltage ||
    formatEmergencyNumbers(display.emergencyNumbers) ||
    display.connectivityNote || display.paymentNorm || display.tippingNorm ||
    (Array.isArray(display.etiquetteNotes) && display.etiquetteNotes.length > 0)
  );
  return { summary: !!display.intro, visa: hasVisa, budget: hasBudget, climate: hasClimate, practical: hasPractical };
}

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

// Sticky jump-nav pill row shared by all three tabs. `items` is
// [{id, label, filled}] -- `filled` renders a small teal dot (Packing's
// fully-packed-category indicator; unused by Overview/Itinerary).
//
// `level` picks the tab-hierarchy weight (see docs/wherenova-fixes brief,
// Build A #3): "section" is L2 (Overview pills, Packing category pills),
// "day" is L3 (Itinerary day chips). Both stay inside the same left/right
// edges as the L1 bar and the content column -- no `-mx-4` bleed, which is
// what let the old day-chip row render wider than the tab bar above it.
// Shared jump-nav pill row for all three tabs.
// B2: outer container uses px-3 padding + scroll-padding-inline so the
//   active pill is never flush-clipped at either edge; the inner track uses
//   mx-auto so pills centre when they fit and scroll normally when they don't
//   (replaces the reported "Summary pill sliced off at the left" on mobile).
// B3: active day chip (L3) gets a stronger treatment — fill, cyan border,
//   halo, weight 700 — so it's clearly readable at arm's length.
// B5: active L2 section pill adds .wn-pill-sweep for the conic ring sweep.
function JumpNav({ items, activeId, onSelect, ariaLabel, level = "section" }) {
  const isDay = level === "day";
  const containerRef = useRef(null);

  // Scroll the active pill into view (inline-nearest) whenever the active
  // id changes, so activating a pill that's off-screen brings it fully in.
  useEffect(() => {
    if (!containerRef.current) return;
    const active = containerRef.current.querySelector('[aria-selected="true"]');
    if (active) active.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  if (!items.length) return null;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      ref={containerRef}
      className="w-full overflow-x-auto no-scrollbar pt-2 px-3"
      style={{ scrollPaddingInline: "12px" }}
    >
      <div className="flex gap-2 pb-0.5 w-max mx-auto">
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(item.id)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan focus-visible:ring-offset-2",
                isDay
                  ? cn(
                      "h-7 px-3 rounded-[7px] text-[12.5px] border",
                      active
                        ? "border-wn-cyan bg-[#E9FAFC] text-wn-cyan font-bold shadow-[0_0_0_3px_rgba(22,196,216,.16)]"
                        : "border-wn-line-2-l bg-wn-surface-l text-wn-text-2-l font-medium hover:bg-wn-surface-2-l"
                    )
                  : cn(
                      "h-8 px-3.5 rounded-lg text-[13px] border font-medium",
                      active
                        ? "wn-pill-sweep border-wn-text-l bg-wn-text-l text-white"
                        : "border-wn-line-l bg-transparent text-wn-text-2-l hover:bg-wn-surface-2-l"
                    )
              )}
            >
              {item.label}
              {item.filled && (
                <span
                  aria-hidden="true"
                  className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", active ? "bg-white" : "bg-wn-cyan")}
                />
              )}
            </button>
          );
        })}
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
  const [activeTab, setActiveTab] = useState("itinerary");
  const [openDay, setOpenDay] = useState(1);
  const isMobile = useIsMobile();
  const [stickyRef, stickyHeight] = useMeasuredHeight();
  const scrollOffset = TAB_BAR_STICKY_TOP + stickyHeight;

  const overviewFlags = overviewSectionFlags(display);
  // Pill order must equal DOM section order (the pills are scroll anchors) --
  // Summary, Budget, Travel essentials, Visa & entry. The Weather pill was
  // removed: its content (a month-resolved weather string) doesn't exist in
  // the destination data model today -- only an annual climateTags label
  // does, and that already renders as the "Climate" row inside Summary's
  // Good to know block. Nothing to relocate without fabricating data.
  const overviewItems = [
    overviewFlags.summary && { id: "ov-summary", label: "Summary" },
    overviewFlags.budget && { id: "ov-budget", label: "Budget" },
    overviewFlags.practical && { id: "ov-practical", label: "Travel essentials" },
    overviewFlags.visa && { id: "ov-visa", label: "Visa & entry" }
  ].filter(Boolean);

  const itineraryItems = (itinerary || []).map((d) => ({ id: `day-${d.day}`, label: `Day ${d.day}` }));

  const packingSummaries = packingCategorySummaries(packingGroups, packingState);
  const packingItems = packingSummaries.map((g) => ({ id: g.id, label: g.category, filled: g.allPacked }));

  // B1: suppress scroll-spy during programmatic smooth-scroll so the
  // click's optimistic active-state is never overwritten by an intermediate
  // scroll position. Cleared on scrollend or after a 700ms fallback.
  const programmaticScrollRef = useRef(false);
  const programmaticScrollTimer = useRef(null);

  const [overviewActiveId, setOverviewActiveId] = useScrollSpy(
    overviewItems.map((i) => i.id),
    { active: activeTab === "overview", offsetPx: scrollOffset, pauseRef: programmaticScrollRef }
  );
  const [itineraryActiveId, setItineraryActiveId] = useScrollSpy(
    itineraryItems.map((i) => i.id),
    { active: activeTab === "itinerary", offsetPx: scrollOffset, pauseRef: programmaticScrollRef }
  );
  const [packingActiveId, setPackingActiveId] = useScrollSpy(
    packingItems.map((i) => i.id),
    { active: activeTab === "packing", offsetPx: scrollOffset, pauseRef: programmaticScrollRef }
  );

  const jumpTo = (id, setter) => {
    // Set active state immediately (optimistic) before the scroll begins.
    setter(id);
    // Arm suppression and clear it on scrollend / 700ms fallback.
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current);
    programmaticScrollRef.current = true;
    const clear = () => {
      programmaticScrollRef.current = false;
      programmaticScrollTimer.current = null;
    };
    const onScrollEnd = () => {
      window.removeEventListener("scrollend", onScrollEnd);
      clear();
    };
    window.addEventListener("scrollend", onScrollEnd, { once: true });
    programmaticScrollTimer.current = setTimeout(() => {
      window.removeEventListener("scrollend", onScrollEnd);
      clear();
    }, 700);
    scrollToId(id);
  };

  // On desktop the Packing tab uses a scroll-to-anchor sidebar instead of
  // the top pill row (see PackingView) -- showing both would be redundant
  // navigation for the same five-category list.
  const showPackingPillRow = isMobile;

  let currentJumpNav = null;
  if (activeTab === "overview") {
    currentJumpNav = (
      <JumpNav
        items={overviewItems}
        activeId={overviewActiveId}
        onSelect={(id) => jumpTo(id, setOverviewActiveId)}
        ariaLabel="Jump to Overview section"
      />
    );
  } else if (activeTab === "itinerary") {
    currentJumpNav = (
      <JumpNav
        items={itineraryItems}
        activeId={itineraryActiveId}
        onSelect={(id) => {
          const day = Number(id.replace("day-", ""));
          if (!Number.isNaN(day)) setOpenDay(day);
          jumpTo(id, setItineraryActiveId);
        }}
        ariaLabel="Jump to day"
        level="day"
      />
    );
  } else if (activeTab === "packing" && showPackingPillRow) {
    currentJumpNav = (
      <JumpNav
        items={packingItems}
        activeId={packingActiveId}
        onSelect={(id) => jumpTo(id, setPackingActiveId)}
        ariaLabel="Jump to packing category"
      />
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
        </div>
      )}
      {/* L1/L2/L3 sticky stack: all three bars share the content column's own
          left/right edges (no -mx-4 bleed) so nothing below L1 can render
          wider than it -- see docs/wherenova-fixes brief, Build A #3. */}
      <div ref={stickyRef} className="sticky top-16 z-20 py-2 bg-wn-page-l border-b border-wn-line-l">
        <TabsList
          className="grid grid-cols-3 w-full h-11 p-1 rounded-xl bg-wn-surface-2-l"
        >
          <TabsTrigger
            value="itinerary"
            className="h-full rounded-[9px] text-[14px] font-medium text-wn-text-2-l data-[state=active]:bg-white data-[state=active]:text-wn-text-l data-[state=active]:font-semibold data-[state=active]:shadow-[0_1px_3px_rgba(15,27,45,.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan focus-visible:ring-offset-2"
          >
            Itinerary
          </TabsTrigger>
          <TabsTrigger
            value="packing"
            className="h-full rounded-[9px] text-[14px] font-medium text-wn-text-2-l data-[state=active]:bg-white data-[state=active]:text-wn-text-l data-[state=active]:font-semibold data-[state=active]:shadow-[0_1px_3px_rgba(15,27,45,.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan focus-visible:ring-offset-2"
          >
            Packing
          </TabsTrigger>
          <TabsTrigger
            value="overview"
            className="h-full rounded-[9px] text-[14px] font-medium text-wn-text-2-l data-[state=active]:bg-white data-[state=active]:text-wn-text-l data-[state=active]:font-semibold data-[state=active]:shadow-[0_1px_3px_rgba(15,27,45,.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan focus-visible:ring-offset-2"
          >
            Overview
          </TabsTrigger>
        </TabsList>
        {currentJumpNav}
      </div>
      <TabsContent value="itinerary" className="mt-6">
        <ItineraryView
          itinerary={itinerary}
          openDay={openDay}
          setOpenDay={setOpenDay}
          scrollOffset={scrollOffset}
        />
      </TabsContent>
      <TabsContent value="packing" className="mt-6">
        <PackingView
          groups={packingGroups}
          state={packingState}
          handlers={packingHandlers}
          scrollOffset={scrollOffset}
          nav={{ items: packingItems, activeId: packingActiveId, onSelect: (id) => jumpTo(id, setPackingActiveId) }}
        />
      </TabsContent>
      <TabsContent value="overview" className="mt-6">
        <OverviewView display={display} scrollOffset={scrollOffset} flags={overviewFlags} travelFit={travelFit} />
      </TabsContent>
    </Tabs>
  );
}

function ItineraryView({ itinerary, openDay, setOpenDay, scrollOffset }) {
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
            <div
              key={d.day}
              id={`day-${d.day}`}
              style={{ scrollMarginTop: scrollOffset + 12 }}
              className="relative flex gap-4"
            >
              <span
                className="relative z-10 flex-shrink-0 w-8 h-8 rounded-full bg-wn-surface-l ring-1 ring-wn-line-l flex items-center justify-center font-display text-xs font-bold text-wn-text-l"
                aria-hidden="true"
              >
                {d.isTravel ? (
                  <PlaneTakeoff className="w-4 h-4" />
                ) : d.flexible ? (
                  <Footprints className="w-4 h-4" />
                ) : (
                  d.day
                )}
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

// B4: Shared card wrapper for the four Overview sections. Carries its own
// scroll anchor, a titled header with a 3px left gradient rule (cyan→orange,
// matching the logo palette), and consistent white card framing.
function OverviewCard({ id, title, scrollOffset, children }) {
  return (
    <section
      id={id}
      style={{ scrollMarginTop: scrollOffset + 12 }}
      className="bg-wn-surface-l border border-wn-line-l rounded-xl p-4 sm:p-[18px]"
    >
      <div className="flex items-center gap-2.5 mb-4">
        <span
          aria-hidden="true"
          className="flex-shrink-0 rounded-full"
          style={{
            width: 3,
            alignSelf: "stretch",
            background: "linear-gradient(to bottom, rgb(var(--wn-cyan)), #F97316)"
          }}
        />
        <h3 style={{ fontSize: "15.5px" }} className="font-bold text-wn-text-l leading-snug">{title}</h3>
      </div>
      {children}
    </section>
  );
}

// Budget content: three daily cost tiers + trip-total estimate. All-or-nothing:
// any missing tier causes the Budget card to be skipped by OverviewView's
// flags.budget check, so this component can assume all three values exist.
function TripBudgetContent({ display, travelFit }) {
  const { dailyCostLow, dailyCostMid, dailyCostHigh } = display;
  const days = travelFit && typeof travelFit.usableDestinationDays === "number" ? travelFit.usableDestinationDays : null;
  const tiers = [
    { label: "Budget", daily: dailyCostLow },
    { label: "Mid-range", daily: dailyCostMid },
    { label: "Comfort", daily: dailyCostHigh }
  ];
  return (
    <div>
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
        Per-person daily estimate in USD{days != null ? ` for ${days} day${days === 1 ? "" : "s"} at the destination` : ""} —
        accommodation, food, local transport and activities. <span className="font-semibold text-wn-text-l">Flights are not included.</span>
      </p>
    </div>
  );
}

// Overview: four titled cards (Summary, Budget, Travel essentials, Visa & entry).
// The Budget card guards on flags.budget; the other three are always rendered
// when the tab is active (each content component is empty-safe).
function OverviewView({ display, scrollOffset, flags, travelFit }) {
  return (
    <div className="space-y-3">
      {flags.summary && (
        <OverviewCard id="ov-summary" title="Summary" scrollOffset={scrollOffset}>
          <div className="space-y-5">
            <p className="text-wn-text-l/80 leading-relaxed">{display.intro}</p>
            <div>
              <h4 className="font-display font-bold text-wn-text-l mb-3">Top experiences</h4>
              <ul className="space-y-2 text-sm text-wn-text-l/80">
                {(display.topExperiences || []).map((e, i) => (
                  <li key={i} className="flex gap-2"><span className="text-wn-text-l/40">•</span>{e}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-display font-bold text-wn-text-l mb-3">Good to know</h4>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4 py-2 border-b border-wn-line-l"><dt className="text-wn-text-2-l">Best for</dt><dd className="text-wn-text-l text-right">{display.bestForSummary}</dd></div>
                <div className="flex justify-between gap-4 py-2 border-b border-wn-line-l"><dt className="text-wn-text-2-l">Suggested length</dt><dd className="text-wn-text-l">{display.minDays}–{display.maxDays} days</dd></div>
                <div className="flex justify-between gap-4 py-2 border-b border-wn-line-l"><dt className="text-wn-text-2-l">Budget</dt><dd className="text-wn-text-l text-right">{orderedBudgetLabel(display.budgetCategories)}</dd></div>
                {flags.climate && (
                  <div className="flex justify-between gap-4 py-2 border-b border-wn-line-l">
                    <dt className="text-wn-text-2-l">Climate</dt><dd className="text-wn-text-l text-right">{(display.climateTags || []).join(", ")}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4 py-2 border-b border-wn-line-l"><dt className="text-wn-text-2-l">Suited to</dt><dd className="text-wn-text-l text-right">{(display.travellerTypes || []).join(", ")}</dd></div>
                <div className="flex justify-between gap-4 py-2"><dt className="text-wn-text-2-l">Dietary notes</dt><dd className="text-wn-text-l text-right">{display.dietaryNotes}</dd></div>
              </dl>
            </div>
          </div>
        </OverviewCard>
      )}

      {flags.budget && (
        <OverviewCard id="ov-budget" title="Budget" scrollOffset={scrollOffset}>
          <TripBudgetContent display={display} travelFit={travelFit} />
        </OverviewCard>
      )}

      {flags.practical && (
        <OverviewCard id="ov-practical" title="Travel essentials" scrollOffset={scrollOffset}>
          <TravelEssentialsContent display={display} />
        </OverviewCard>
      )}

      {flags.visa && (
        <OverviewCard id="ov-visa" title="Visa &amp; entry" scrollOffset={scrollOffset}>
          <EntryRequirementsContent display={display} />
        </OverviewCard>
      )}
    </div>
  );
}

// Travel essentials content: currency, language, power, emergency numbers,
// connectivity/payment/tipping prose, etiquette notes. Rendered inside an
// OverviewCard; the null-guard lives in OverviewView's flags.practical check.
function TravelEssentialsContent({ display }) {
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

  return (
    <div>
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

// Visa & entry content: entry overview, official-source callout, fact rows,
// notes list. The "verify before you travel" callout is its own section so
// it's prominent without looking legally defensive.
function EntryRequirementsContent({ display }) {
  const {
    entryOverview, passportValidity, typicalTouristStay, entryRequirementsNotes,
    officialSourceName, officialSourceUrl, entryLastReviewed
  } = display;

  const factRows = [
    passportValidity && ["Passport validity", passportValidity],
    typicalTouristStay && ["Typical stay", typicalTouristStay]
  ].filter(Boolean);

  const hasNotes = Array.isArray(entryRequirementsNotes) && entryRequirementsNotes.length > 0;
  const reviewedLabel = formatReviewedDate(entryLastReviewed);

  return (
    <div>
      {entryOverview && (
        <p className="text-sm text-wn-text-l/80 leading-relaxed mb-4">{entryOverview}</p>
      )}
      {reviewedLabel && (
        <div className="rounded-xl bg-wn-surface-2-l ring-1 ring-wn-line-l p-4 mb-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-wn-text-l flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-wn-text-l">
                Confirm entry requirements with an official source before you travel
              </p>
              <p className="text-xs text-wn-text-2-l mt-1">{reviewedLabel}</p>
              {officialSourceUrl && (
                <a
                  href={officialSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 -ml-1 mt-2 px-1 py-2 min-h-11 text-sm font-semibold text-wn-text-l underline decoration-wn-line-2-l underline-offset-2 hover:decoration-wn-text-l focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan rounded"
                >
                  {officialSourceName || "Official source"}
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
      {factRows.length > 0 && (
        <div className="space-y-2.5 text-sm">
          {factRows.map(([label, text]) => (
            <p key={label} className="text-wn-text-l/80 leading-relaxed">
              <span className="font-medium text-wn-text-l">{label}: </span>{text}
            </p>
          ))}
        </div>
      )}
      {hasNotes && (
        <ul className={`space-y-1.5 text-sm ${factRows.length ? "mt-4" : ""}`}>
          {entryRequirementsNotes.map((note, i) => (
            <li key={i} className="flex gap-2 text-wn-text-l/80"><span className="text-wn-text-l/40">•</span>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
