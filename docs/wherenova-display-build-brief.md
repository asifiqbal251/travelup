Read AGENTS.md, especially the multi-agent coordination protocol at the top. Confirm you've read it.

You are the declared writer for this session. Baseline is [PASTE HASH FROM git rev-parse HEAD]. No other system is editing this repo. Note: git fetch will fail from your sandbox — trust this stated baseline, and stop and tell me if your local checkout doesn't match it rather than proceeding.

CONTEXT: Base44 has just populated 16 new fields across all 54 destination records. None of them are displayed anywhere in the app yet. Your job is to build that display. This is the first time this data becomes visible, so it needs to look intentional, not bolted on.

================================================================
THE DATA
================================================================

Track A fields (practical facts, all 54 populated):
- currency_code — string, ISO 4217, e.g. "EUR"
- currency_name — string, e.g. "Euro"
- languages — array of strings, e.g. ["Portuguese"]
- plug_types — array of strings, e.g. ["C", "F"]
- voltage — string, e.g. "230V" (note: Brazil records read "127V/220V — varies by location, check on arrival")
- emergency_number — ARRAY OF OBJECTS: [{ "service": "Police", "number": "190" }, ...]. Most destinations have one entry labelled "Emergency". Nine have multiple entries with specific service labels.
- connectivity_note — string, one sentence

Track B fields (all 54 populated except where noted):
- etiquette_notes — array of strings, 1-3 entries, each ≤12 words
- tipping_norm — string, one sentence
- payment_norm — string, one sentence
- daily_cost_low / daily_cost_mid / daily_cost_high — numbers, USD, all rounded to nearest $5
- airport_transfer_note — string, 1-2 sentences
- local_transport_note — string, 1-2 sentences
- intercity_note — string, 1-2 sentences, EMPTY for 7 destinations (islands/single-city trips) — this is intentional, not a gap

There are also draft_ prefixed duplicates of the Track B fields. IGNORE THESE ENTIRELY — they are a rollback backup. Never read from or render a draft_ field.

================================================================
CRITICAL RULE — EMPTY MEANS HIDDEN
================================================================

Every field independently hides when empty. Never render "N/A", "Unknown", "—", or an empty row. If a field has no value, its row/section does not exist in the DOM.

If an entire section's fields are all empty, the section header must not render either.

This matters because it lets destination data be filled in incrementally without any destination ever looking broken.

================================================================
WHAT TO BUILD
================================================================

## 1. Destination Essentials panel — in the destination modal (DestinationPreviewDialog.jsx)

Shows: currency, languages, plug types + voltage, emergency numbers, connectivity, tipping, payment, etiquette notes.

- emergency_number renders as a list, e.g. "Police 190 · Ambulance/Fire 150". For single-entry arrays labelled "Emergency", just show the number without the redundant label.
- etiquette_notes render as a short bulleted list.
- Group related items sensibly rather than one flat list of 8 rows.

CRITICAL CONSTRAINT: this modal has a hard-won desktop guarantee — fixed 1100x680, 60/40 image/content split, NO INTERNAL SCROLLING at desktop. That was verified by measurement across 8 destinations. Adding content risks breaking it.

Before you add anything, measure the current worst-case content height at desktop and determine how much room actually exists. If the Essentials content will not fit within the existing fixed shell, DO NOT loosen the desktop constraints. Instead, propose an approach and stop to ask me — options might include a collapsed/expandable section, a tab, or putting Essentials on the trip page instead of the modal. Report what you measure.

Mobile (below lg) already scrolls freely, so mobile is less constrained — but the layout must still look deliberate, not like a data dump.

## 2. Trip Budget panel — on the trip page (TripView.jsx)

Shows the three daily tiers and an estimated trip total.

- Trip total = tier daily rate × usableDestinationDays (already computed in practicality.js — read it, don't recalculate).
- Label clearly as an estimate.
- MUST state plainly that flights are excluded. This is a product decision, not optional copy — a user seeing a trip cost that silently omits airfare would be misled.
- All-or-nothing: if any of the three tiers is missing, hide the whole panel. Never show partial tiers.
- Place near the existing Travel Fit panel — these are related "practical reality" information.

## 3. Transportation guidance — integrated into the trip page

Shows airport_transfer_note, local_transport_note, and intercity_note (when present).

- Integrate near the existing "Getting there" facts rather than as an isolated section — this is more useful in context.
- intercity_note is empty for 7 destinations; that row simply doesn't render for them.

================================================================
DESIGN CONSTRAINTS
================================================================

- Follow the existing design system. Teal is restricted to score/match indicators only — do not introduce it here. Coral is for CTAs only.
- Dark surfaces for the modal (choosing), light surfaces for the trip page (doing) — the existing wn-* vs wn-*-l token split.
- Mobile-first: this app is used on phones and has had repeated mobile layout bugs. Test 320px, 375px, 390px, and 430px widths.
- Do not regress any prior mobile fix: the modal must remain escapable and scrollable on mobile, the hero image aspect-ratio fix must hold, and the questionnaire header must not overlap.

================================================================
REQUIREMENTS
================================================================

- Do not touch scoring.js, practicality.js, itinerary.js, or questionnaireFlow.js. This is display only.
- Do not modify any destination data.
- Do not read or render draft_ fields.
- Verify by actually rendering, not just tracing code. For anything involving layering or overlap, use elementFromPoint() rather than only getBoundingClientRect() — geometry checks have missed real paint-order bugs in this codebase before.
- State clearly which parts you verified by rendering versus traced through code only.
- Run lint AND a production build. Both must pass clean.
- Commit when done. DO NOT PUSH — I push from Terminal.
- Report the commit hash and hand off per the AGENTS.md protocol.

If the modal cannot accommodate the Essentials panel within its fixed desktop shell, STOP and ask before proceeding — do not silently redesign the modal.
