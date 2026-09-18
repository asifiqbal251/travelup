# WhereNova — Tier 1 Build Brief: Country Entry, Miss States, Cross-Door Nudges

Date: 2026-09-17
Status: Ready to hand to Claude Code
Builds on: `wherenova-door2-build-brief.md` (Door 2 shipped, commit pushed)

---

## 0. The one thing that de-risks this whole build

**No protected file is modified.** `questionnaireFlow.js`, `scoring.js`,
`practicality.js`, and `itinerary.js` are all READ FROM but never edited.
New logic goes in new files that import from them.

If you find yourself needing to edit any of those four, STOP and report back
rather than proceeding — that changes this from a UI build into an engine
change with a full regression gate.

---

## 1. Context: the two decisions this implements

**Decision 1 — country-as-entry (approved).** Users must be able to type
EITHER a city/destination OR a country in Door 2. Both paths work. When they
type a country, WhereNova is honest: it names exactly which locations inside
that country are covered and states that any itinerary will be built from
those, not from the country as a whole.

Explicitly NOT in scope: building a single multi-city itinerary that chains
several destinations across a country. That is a separate, larger capability
(see §8) and must not be attempted here.

**Decision 2 — build the mockup's honesty and nudge features.** The concept
mockup had several features the shipped Door 2 lacks. The ones in this brief
are the ones buildable without new destination data or engine work.

---

## 2. Existing assets to reuse (verified present — do not rebuild)

| Asset | Location | Use in this build |
|---|---|---|
| `CITY_COUNTRY` map (~120 cities → country) | `src/lib/questionnaireFlow.js` | Resolve what a missed query meant (e.g. "Prague" → "Czech Republic") |
| `inferCountry(city)` | `src/lib/questionnaireFlow.js` | Same — already exported, import it |
| `suggestOrigins(query)`, `ORIGIN_SUGGESTIONS`, `ORIGIN_CHIPS` | `src/lib/questionnaireFlow.js` | Origin autocomplete + fallback chip list |
| `getCityCoords(city, country)` | `src/lib/coordinates.js` | Coordinates for a missed query, where known |
| `haversineKm(a, b)` | `src/lib/practicality.js` | Real distance for "close by" ranking — already exported |
| `gateway_lat` / `gateway_lng` on every destination | `Destination` entity | The other side of the distance calculation |
| `interest_tags`, `primary_interests`, `region`, `climate_tags` | `Destination` entity | "Close in spirit" similarity scoring |
| `climateByMonth[n].conditions` | `Destination` entity | The climate alert (§6) — currently stored but displayed NOWHERE in the app |
| `DestinationSearch` component | `src/components/doorb/DestinationSearch.jsx` | Extend it; don't replace it |

---

## 3. Door 2 — country or city entry

`DestinationSearch.matchesDest()` already matches on `dest.country`, so typing
"India" already returns the four India records. What's missing is the framing.

**Build:**

1. Detect when the query is a **country match** rather than a destination-name
   match: the normalized query equals (or is a clean prefix of) a
   `dest.country` value held by one or more destinations.

2. When it is, render the dropdown as a **country group** rather than a flat
   list:
   - A header naming the country and how many locations are covered
   - The covered destinations listed beneath it, each with its existing
     type badge (Region / Multi-stop)
   - An **honesty note** directly under the group, in the same spirit as the
     app's other honesty messaging. Required substance (wording is yours, keep
     it plain and non-apologetic):
     > These are the locations WhereNova covers in {Country}. A trip you build
     > here will be based on one of them, not the whole country.

3. Picking any destination from the country group continues into the normal
   essentials step — no behaviour change downstream.

**Important:** do not hide the country group when there is only one match
(e.g. "Japan" → Tokyo & Kyoto only). The single-destination case is exactly
when the honesty note matters most.

---

## 4. Door 2 — "Browse what we cover"

For users who don't know what to type.

**Build:** when the search field is empty and unfocused (or via an always-
visible secondary link beneath it), offer a browse affordance. Opening it
shows all destinations grouped by country, alphabetical, each row showing name
+ type badge. Selecting one behaves identically to selecting from search.

Keep it lightweight — a panel or expanded list within the existing step, not a
new route or a modal stack. 64 records is small enough to render at once.

---

## 5. Door 2 — the miss state (the "Prague" case)

This replaces the current generic "Not in our catalogue yet" block, which is
the weakest screen in Door 2 today.

When a query returns no destination match, build a real response with three
parts:

### 5a. Name what they meant

Run the query through `inferCountry()` and `getCityCoords()`. Then:
- **Both resolve** (e.g. "Prague"): acknowledge the specific place and country.
- **Only country resolves**: acknowledge the country.
- **Neither resolves**: fall back to a plain "we don't have anything matching
  that yet" — do not guess.

Never claim a place doesn't exist. The honest statement is that *WhereNova
doesn't cover it yet*.

### 5b. "Close in spirit, ready now"

Show up to 3 covered destinations, ranked by a blend of:

- **Proximity** — where `getCityCoords(query)` resolved, `haversineKm` from
  that point to each destination's `gateway_lat`/`gateway_lng`. Nearer ranks
  higher.
- **Similarity** — overlap between the destinations' `interest_tags` /
  `primary_interests`, and shared `region` or `climate_tags`.

Where coordinates don't resolve, fall back to same-region / same-continent
plus interest overlap alone.

Each suggestion states *why* it's being offered in a short line — distance, or
the shared quality. Do not present a suggestion with no stated reason; an
unexplained alternative reads as a random substitute.

Selecting one continues into the normal essentials step.

### 5c. "Want {Prague} built?"

A clear CTA that records the request (see §7 for the entity). On submit:
- Confirm plainly that it's been noted
- Offer an optional free-text field for the user to add context or suggest a
  different place entirely
- Do not promise a timeline

---

## 6. Door 2 essentials — climate alert

The `climateByMonth[n].conditions` string exists on every destination and is
currently rendered nowhere in the entire app. This is a known logged gap in
AGENTS.md; this build closes part of it.

**Build:** once a month is selected in the essentials step, show a short
inline note for that destination + month, drawn from
`climateByMonth[month - 1]`. Include the conditions string, and the
temperature where it adds something.

Use a neutral/informational treatment by default, and a warmer (amber)
treatment only when the conditions string indicates something the traveller
should weigh — wet season, extreme heat, cold. Keep the logic simple and
string-driven; do NOT add a new scoring rule or touch `scoring.js`.

This is informational only. It must not gate, block, or re-rank anything.

---

## 7. New entity: `DestinationRequest`

Needed for §5c. This is a Base44 entity creation — flag it clearly in your
report so it can be created on that side if you can't create it directly.

Fields:

| Field | Type | Notes |
|---|---|---|
| `query_text` | string, required | Exactly what the user typed |
| `resolved_country` | string | From `inferCountry()`; empty when unresolved |
| `user_note` | string | Optional free text from the user |
| `trip_month` | string | Optional — only if already answered |
| `trip_days` | integer | Optional — only if already answered |
| `requested_at` | string | ISO timestamp |

RLS: **create** open (any visitor can request); **read/update/delete** admin
only. This is user-submitted demand data, not user-owned content.

This table is the demand signal for which destinations to curate next — treat
it as a product asset, not a dead-letter box.

---

## 8. Door 1 — smarter origin chips

Door 1's origin question offers "or pick a common one" chips, currently the
hardcoded `ORIGIN_CHIPS = ["Vancouver", "Los Angeles", "San Francisco",
"Paris"]`.

**Build a resolved chip list, in a NEW file** (suggested:
`src/lib/originSuggest.js`) that imports `ORIGIN_CHIPS` and
`ORIGIN_SUGGESTIONS` from `questionnaireFlow.js` without modifying it.

Resolution order:

1. **Returning user's saved `departureCity`** — from existing prefs storage.
   If present, it leads.
2. **Timezone inference** — `Intl.DateTimeFormat().resolvedOptions().timeZone`
   returns e.g. `America/Vancouver`, `Asia/Dhaka`, `Europe/London`. Map the
   city portion against `ORIGIN_SUGGESTIONS`; on a hit, surface that city plus
   two or three others from the same broad area.
3. **Existing `ORIGIN_CHIPS`** — unchanged final fallback.

**Do not** use the browser Geolocation API (permission prompt is far too
heavy for this) and **do not** add an IP-geolocation service or any new
network dependency. Timezone is free, synchronous, requires no permission,
and is accurate enough for suggesting four chips.

Degrade silently: any failure at any layer falls through to the next.

---

## 9. Door 1 — cross-door nudge

On Door 1's first question (origin), add a quiet line offering the other door:

> Already know where you're going? Skip straight to the dates →

Links to `/find`. Keep it visually subordinate to the question itself — this
is an escape hatch, not a competing call to action. Do not show it beyond the
first question; someone three questions deep has already chosen their door.

---

## 10. Build sequence

1. §3 country grouping + honesty note (extends existing component)
2. §4 browse-what-we-cover
3. §7 `DestinationRequest` entity — report if you cannot create it
4. §5 miss state (depends on §7 for the CTA)
5. §6 climate alert
6. §8 origin chips (new file — confirm `questionnaireFlow.js` untouched)
7. §9 cross-door nudge

Report after step 3 if the entity can't be created from your side, rather than
building §5 against a table that doesn't exist.

---

## 11. Verification before reporting done

- Confirm via `git diff --stat` that `scoring.js`, `practicality.js`,
  `itinerary.js`, and `questionnaireFlow.js` show **zero changes**
- Country entry: type "India" → country group with 4 destinations + honesty
  note; type "Japan" → same treatment with 1 destination
- Miss state: type "Prague" → resolves to Czech Republic, shows 3 reasoned
  alternatives, offers the request CTA
- Miss state, unresolvable: type nonsense → plain fallback, no invented guesses
- Climate alert: pick Kerala + October → conditions string appears
- Origin chips: confirm they change with timezone, and fall back cleanly
- Cross-door nudge: appears on Q1 only, links to `/find`

Full regression suite is NOT gated on this build (no protected files touched),
but run it before shipping to production regardless.

---

## 12. Still open — do not build, flagged for discussion

- **Multi-destination country itineraries** — chaining Delhi & Agra + Jaipur +
  Goa into one trip. Needs `itinerary.js` to concatenate multiple
  destinations' `day_templates` and insert honest transit days between them.
  Distance/flight-time maths for the transits already exists
  (`haversineKm` + `flightHours` + each destination's gateway coords), so the
  hard part is itinerary assembly, not travel estimation.
- **Interactive region area-picking** — needs a structured per-area field on
  region destinations; `intercity_note` is one free-text string today.
- **Per-day swap / itinerary editing** — same feature 2 of 3 beta users have
  asked for. Deserves its own project covering both doors.
- **Refine impact preview** ("2 of your 5 days would change") — needs an
  itinerary diff.
