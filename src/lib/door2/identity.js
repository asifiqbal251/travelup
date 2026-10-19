/** @typedef {import('./types.js').Trip} Trip */
/** @typedef {import('./types.js').Block} Block */
/** @typedef {import('./types.js').ContentItem} ContentItem */

import { FAILURE_STATES } from './failureStates.js';
import { activityFor, classifySlot, eligibleItemsForBlock } from './fill.js';
import { findRoutePackage } from './planner.js';

// Q8 durable edit identity — the engine (packet 1b).
//
// Layer 1 is the five generated block shapes (`tr:`, `ex:`, `op:`, `rest:`, `day:`),
// regenerated freely on every rebuild. Layer 2 is a durable `luid`, issued once per
// logical block and carried across rebuilds, so a traveller's edit belongs to a named
// thing rather than to an id the scheduler is free to recompute (D-A §4).
//
//   trip.identity = {
//     version: 1,
//     used:   [ "<luid>", … ],                       // every luid ever ISSUED in this trip
//     blocks: { "<luid>": { stopKey, kind, address, state, excursionId? } },
//     edits:  { "<luid>": { intent, contentId, locked, userEdited, provenance } }
//   }
//
// ---------------------------------------------------------------------------
// DORMANCY. Nothing in this module runs on a production call path. Every caller
// reaches it only through an explicit opt-in (`options.identity === true` at the seven
// public previews, a trailing `identity` argument on the bounded edits and the
// fingerprint), and no call site in `src/pages/**` passes one. This module creates no
// identity by itself: `initialiseIdentityForBuild` and `initialiseIdentityForLegacyTrip`
// are implemented here and called from nowhere, which is packet 2's work.
//
// ---------------------------------------------------------------------------
// WHAT MINTS, per erratum 02 v2 to the revision-6 packet.
//
//   `op:<stopId>:d<offset>[:<k>]`   one luid, kind 'open',      address { dayOffset, ordinal, slot }
//   `ex:<stopId>:<placeId>:site`    one luid, kind 'excursion',  address { excursionPlaceId }
//   `ex:…:out`, `ex:…:back`         nothing — transport
//   `tr:`, `day:`, `rest:`          nothing
//
// The excursion site block mints for FIXED and SELECTED excursions alike. `fill.js`
// converts any `type: 'open'` block to an activity by type, not by id prefix
// (`fill.js:238-242`), and `pinActivity` accepts any activity block (`edit.js:215`), so a
// fixed excursion's site block is a real editable, pinnable surface. Excluding it would
// leave an existing class of traveller edit with no identity.
//
// The address keys on PLACE, not on excursion id: `excursionId` is absent from every
// block and exists only for *selected* excursions, while the editable surface exists for
// both. `excursionId` is therefore recorded as placement metadata, resolved through the
// compiled package with the CALLER's `data` — never `PILOT_DATA`, never a global — and
// recorded as `null` when it cannot be resolved (a withdrawn menu entry, an unknown
// variant, a fixed excursion with no menu). Unresolved metadata never drops a placement.
//
// Place is a sufficient key only within one stop, and its uniqueness is NOT guaranteed by
// the authoring compiler: `checkExcursionMenus` skips a stop with no menu
// (`families.js:181`), builds its place set *from* the fixed list and so collapses
// duplicates within it (`:184`), and checks only menu entries against that set
// (`:190-192`) — the fixed list is never checked against itself, though the header
// comment at `:174-175` claims it is. A duplicate `(stopKey, excursionPlaceId)` site
// target is therefore refused BY NAME, BEFORE issuance, whatever its provenance. The
// refusal is local to this boundary: `families.js`, the scheduler and the address model
// are unchanged.
//
// ---------------------------------------------------------------------------
// WHAT THIS MODULE DOES NOT DO. It adds no eligibility rule — §5.3 condition 4 calls the
// engine's own `eligibleItemsForBlock` and reimplements no check it performs — and it
// introduces no seasonal or availability behaviour. It writes no operation outcome into a
// trip, and refuses to hand one back (`assertNoOutcomeMetadata`, below). It never reads
// `tripSequence.js`'s unrelated `stopKey`.
//
// Deterministic apart from `newLuid`: no `Date.now()`, no `new Date()` and no other ambient
// time source on any path, so a preview built twice from one trip is byte-identical.
//
// D-A §6.2's LIFECYCLE STAMPS. The transition writes the design specifies —
// `displacedAt`, `orphanedAt`, `dismissedAt`, `retiredAt` — are implemented, and the time
// they record is SUPPLIED BY THE CALLER through the same opt-in channel as the rest of the
// identity mode (`at`). That keeps this module deterministic for fixed inputs, which was
// the whole of the original objection, without deviating from the design: a supplied value
// is not a clock. There is deliberately no fallback and no ambient lifecycle time source
// on any path; an invalid supplied value refuses by name rather than being coerced. No
// production root passes `at`, any more than it passes the opt-in itself.
//
// THE WRITE IS MANDATORY AT A COMMITTING TRANSITION. A map that moves a placement to
// `displaced`, `orphaned`, `dismissed` or `retired` and commits that move WITHOUT the
// matching stamp is refused by name, and installs nothing. "Stamps when a time happens to
// be supplied" is not the design's contract: a lifecycle field that is present or absent
// depending on the caller's generosity cannot be read by anything downstream, and the
// moment a transition happened is unrecoverable once the operation has committed without
// it. So the requirement is enforced where the commit is made — `runPhases` and
// `acceptRelocation`, through one guard (`requireTransitionStamps`) — and not inside
// `transition` or `correspond`, which also serve the ADVISORY allocation that
// `applyProposal` recomputes and discards. Stamping or refusing advice would write a time
// onto something thrown away, and would make a preview depend on a value only the commit
// needs.
//
// What that leaves untouched: a fresh build and a legacy initialisation transition nothing
// and so need no time; an operation that commits no transition needs none either; and a
// placement already in a terminal or displaced state, carried through unchanged, is not a
// transition and is never re-examined — including one that arrived unstamped.
//
// A stamp is written at the TRANSITION only. A placement that was already `displaced` and
// stays `displaced` keeps its original `displacedAt`, so the field means "when this
// happened" and never decays into "when it was last noticed".
//
// AND THE GUARD TESTS THIS OPERATION'S SUPPLIED TIME, NOT THE RESULTING FIELD (R5, round
// 4). Round 3's guard asked only whether the stamp field was `undefined` after the move,
// which a value INHERITED FROM AN EARLIER OPERATION satisfies. The review walked it with
// three ordinary opted-in operations: add Sintra at T1, which displaces a window and
// stamps it T1; remove Sintra at T2, which returns that exact window to `live` carrying
// its historical `displacedAt`; add Sintra again supplying NO time at all. The window
// displaced for a second time, the guard saw a defined `displacedAt`, and the operation
// committed a transition whose recorded moment belonged to a different operation.
//
// So the question is not "does the field have a value" but "did THIS operation supply the
// time, and is the committed field that value". Both are asked of every new stamp-bearing
// transition, independently of any historical field already on the placement. The
// requirement is on the OPERATION, which is why the guard takes the resolved time rather
// than inspecting the placement alone.
//
// It does NOT demand a different value. A caller may deliberately supply the same fixed
// time twice — two transitions really can share a moment, and every test in this packet
// supplies one constant — so the test is whether a time was supplied for this operation,
// never whether it changed.

export const IDENTITY_VERSION = 1;

/** Lifecycle states that still contest an address on a rebuild (D-A §5.1 matching domain). */
const RETAINED_STATES = Object.freeze(['live', 'displaced']);

/** Bounded remint attempts before an issuance refuses the operation whole (D-A §6.1). */
const MINT_ATTEMPTS = 8;

// ---------------------------------------------------------------------------
// Refusals. Every failure in this module is named, local, and installs nothing.

/**
 * @param {string} reason
 * @param {Object} [detail]
 * @returns {{ok: false, reason: string, message: string, detail: Object}}
 */
export function identityRefusal(reason, detail = {}) {
  return { ok: false, reason, message: `identity: ${reason}`, detail };
}

// ---------------------------------------------------------------------------
// THE SERIALIZATION BOUNDARY — an operation outcome is never trip state (R2.1, round 4).
//
// §4 forbids adding metadata to a saved trip. Round 3 put this packet's recovery report on
// the committed record, reasoning that it sat outside both digests and that `saveDraftTrip`
// refuses any trip carrying `identity` anyway. The review disproved the second half with
// two ORDINARY PUBLIC OPERATIONS and no trickery: run the opted-in recovery, whose trip
// the writer does refuse; then run a DEFAULT `previewAdjustNights(+1)` and
// `applyProposal` on it. The rebuilt trip has no top-level `identity`, so the writer's
// presence guard — which reads ONLY the top level (`draftStorage.js:137`) — passes, while
// `history` still holds the previous trip and the writer preserves history. The report was
// stored at `trip.history[3].identityUnrestorable`.
//
// Exclusion from a digest was never exclusion from storage, and the layer this prohibition
// bites at is neither the trip nor the writer. The writer is out of scope and its guard is
// top-level only; the trip is where round 3 put the report and is exactly what reaches
// storage. The boundary that can hold is THE MOMENT A TRIP GRAPH LEAVES THIS ENGINE — and
// it has to hold over the WHOLE GRAPH, every nested history snapshot included, because
// that is the path the review actually walked.
//
// Two halves, together:
//
//   1. The outcome travels on the operation RESULT, alongside the trip — `applyProposal`
//      returns `{ ok, trip, identityOutcome }` on the opted-in route and only when there
//      is something to report. A future caller that keeps only `result.trip` loses it,
//      which is a wiring requirement for that caller and not a reason to serialise a
//      transient outcome.
//   2. No opted-in operation hands back a trip whose graph carries an outcome key —
//      whatever its provenance: this engine's own assignment, a planted `proposal.trip`,
//      or a snapshot in `history`.
//
// It REFUSES rather than stripping. Silently deleting the key would hide the miswiring
// that put it there, and stripping is the move §4 forbids in the neighbouring case.
// Provenance-independent, exactly like §3.2's duplicate-site refusal. And opted-in only:
// no default path acquires a check, so a default operation handed an opaque field it does
// not understand still carries it through, which is base parity and is what the review
// confirmed of the default routes.

/** The keys this packet's operation outcome has been or is spelled with, in one place. */
const OUTCOME_KEYS = Object.freeze(['identityOutcome', 'identityUnrestorable', 'identityRestored']);

/**
 * Refuses by name if this trip — or any history snapshot nested in it, at any depth —
 * carries an operation-outcome key. Called in phase 1 on the trip about to be committed,
 * where a refusal costs zero token-source calls, and again where an opted-in operation
 * returns, because the outcome is produced AFTER phase 3 and so the phases cannot be the
 * last word on it.
 *
 * @param {Trip} trip
 * @param {string} [path]  Where the offending key was found, for the refusal detail.
 */
export function assertNoOutcomeMetadata(trip, path = 'trip') {
  if (trip == null || typeof trip !== 'object') return { ok: true };
  for (const key of OUTCOME_KEYS) {
    if (key in trip) return identityRefusal('operation_outcome_in_trip', { key, at: path });
  }
  const history = Array.isArray(trip.history) ? trip.history : [];
  for (let i = 0; i < history.length; i += 1) {
    const nested = assertNoOutcomeMetadata(history[i], `${path}.history[${i}]`);
    if (!nested.ok) return nested;
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The opt-in parameter.

/**
 * Normalises the trailing `identity` parameter the touched exports accept. `null`,
 * `undefined` and `false` mean today's behaviour exactly; anything else opts in. An
 * object supplies `data` (for excursion metadata), `tokens` (a token environment, which
 * only a test ever supplies) and `at` (D-A §6.2's supplied transition time).
 *
 * @param {null|true|{data?: Object, tokens?: Object, at?: string|number}} identity
 * @returns {{data: Object|null, tokens: Object|undefined, at: string|number|undefined}|null}
 */
export function identityOptions(identity) {
  if (identity == null || identity === false) return null;
  const o = typeof identity === 'object' ? identity : {};
  return { data: o.data ?? null, tokens: o.tokens, at: o.at };
}

// ---------------------------------------------------------------------------
// §6.2 The supplied transition time.

/** The D-A §6.2 field each lifecycle state records when it is entered. */
const TRANSITION_STAMP = Object.freeze({
  displaced: 'displacedAt',
  orphaned: 'orphanedAt',
  dismissed: 'dismissedAt',
  retired: 'retiredAt'
});

/**
 * Resolves the caller's supplied transition time ONCE per operation, so every stamp one
 * operation writes carries the same value. A VALUE, never a function and never a clock:
 * a caller that wants the current time reads it and passes the result, which is what keeps
 * this module's output a function of its inputs alone.
 *
 * @param {string|number|null|undefined} at
 * @returns {{ok: true, at: string|number|null} | {ok: false, reason: string, message: string, detail: Object}}
 */
function identityTime(at) {
  if (at === undefined || at === null) return { ok: true, at: null };
  if (typeof at === 'string' && at !== '') return { ok: true, at };
  if (typeof at === 'number' && Number.isFinite(at) && at >= 0) return { ok: true, at };
  return identityRefusal('transition_time_invalid', { type: typeof at });
}

/**
 * A placement entering `state`, with §6.2's stamp when a time was supplied. Returns the
 * placement untouched when it is already in that state: that is not a transition, and
 * rewriting the stamp there would lose the moment it is meant to record.
 */
function transition(placement, state, at) {
  if (placement?.state === state) return placement;
  const field = TRANSITION_STAMP[state];
  return { ...placement, state, ...(at != null && field !== undefined ? { [field]: at } : {}) };
}

/**
 * D-A §6.2's write, required of every transition this operation is about to COMMIT.
 *
 * Compares the map as it will be installed against the map it came from, and refuses by
 * name if any placement has MOVED into a stamp-bearing state without THIS OPERATION's
 * time. Comparing the two maps, rather than trusting whichever function made the move, is
 * what makes this one guard cover every transition any committing path can produce —
 * correspondence's three, acceptance's one, and any later one — instead of one check per
 * instance.
 *
 * The test is the OPERATION's supplied time, never the resulting field's presence (R5).
 * A placement that has been displaced before carries its old `displacedAt` through a
 * recovery, so "the field is not `undefined`" is satisfied by a value this operation
 * never supplied — which is how a repeated transition committed unstamped. Hence both
 * halves, asked of every new stamp-bearing transition:
 *
 *   `at == null`              -> this operation supplied no time: REFUSE before minting.
 *   `placement[field] !== at` -> the committed moment is not this operation's: REFUSE.
 *
 * The second half is what makes the first unspoofable by an inherited value. It does not
 * demand a DIFFERENT value: `at` is whatever the caller supplied, and supplying the same
 * fixed time twice is valid.
 *
 * Still deliberately not a check on the placements themselves: a placement whose state is
 * unchanged is not a transition, so an entry that arrived unstamped from an earlier map is
 * carried through exactly as it is rather than being retro-stamped with a time that would
 * be a fabrication.
 *
 * @param {Object|undefined} priorBlocks  The map's placements before this operation.
 * @param {Object} nextBlocks             The placements about to be committed.
 * @param {string|number|null} at         THIS operation's resolved supplied time.
 */
function requireTransitionStamps(priorBlocks, nextBlocks, at) {
  for (const [luid, placement] of Object.entries(nextBlocks)) {
    const field = TRANSITION_STAMP[placement?.state];
    if (field === undefined) continue; // `live` records no moment; neither does issuance
    if (priorBlocks?.[luid]?.state === placement.state) continue; // not a transition
    if (at == null) {
      return identityRefusal('transition_time_required', { luid, state: placement.state, field });
    }
    if (placement[field] !== at) {
      // The move happened but the recorded moment is not this operation's — an inherited
      // stamp from an earlier transition of the same placement, or a write that bypassed
      // `transition`. Either way the field would misname when this happened.
      return identityRefusal('transition_time_not_this_operation', {
        luid, state: placement.state, field, found: placement[field] ?? null
      });
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// §3.1 The address, and the one tested id parser.

/**
 * `ordinal` is the scheduler's `k`, present in the id only when `k > 1`
 * (`schedule.js:312`), and it is NOT recomputable from a persisted trip: the busy-interval
 * set and the arrival clamp the scheduler used are not persisted. So the id is parsed.
 * That is a specified choice, not a necessity, and the parser pays for it by validating
 * its own grammar and cross-checking the stop it parsed against `block.anchor.stopId`.
 * A malformed id or a mismatch fails BY NAME; an unparseable suffix never defaults to 1.
 */
const OP_ID = /^op:(.+):d(\d+)(?::(\d+))?$/;
const EX_SITE_ID = /^ex:(.+):([^:]+):site$/;
const EX_ANY_ID = /^ex:(.+):([^:]+):(out|site|back)$/;

/** A plain non-negative integer with no leading zeros — what `schedule.js` emits. */
function plainInt(text) {
  return /^(0|[1-9]\d*)$/.test(text) ? Number(text) : null;
}

/**
 * The identity target of one block, or `null` when the block does not mint.
 *
 * @param {Block} block
 * @returns {{ok: true, kind: string, stopKey: string, address: Object, blockId: string, key: string}
 *          | {ok: false, reason: string, message: string, detail: Object}
 *          | null}
 */
export function identityTargetFor(block) {
  const id = typeof block?.id === 'string' ? block.id : null;
  if (id == null) return null;
  const anchorStopId = block?.anchor?.stopId ?? null;

  if (id.startsWith('op:')) {
    const m = OP_ID.exec(id);
    if (!m) return identityRefusal('op_id_malformed', { blockId: id });
    const [, stopKey, offsetText, ordinalText] = m;
    const dayOffset = plainInt(offsetText);
    if (dayOffset === null) return identityRefusal('op_id_malformed', { blockId: id, part: 'dayOffset' });
    let ordinal = 1;
    if (ordinalText !== undefined) {
      const k = plainInt(ordinalText);
      // The generator appends `:k` only for `k > 1`, so `:0` and `:1` are not grammar.
      if (k === null || k < 2) return identityRefusal('op_id_ordinal_invalid', { blockId: id, ordinal: ordinalText });
      ordinal = k;
    }
    if (stopKey === '' || stopKey !== anchorStopId) {
      return identityRefusal('op_id_stop_mismatch', { blockId: id, parsed: stopKey, anchorStopId });
    }
    const address = { dayOffset, ordinal, slot: classifySlot(block) };
    return { ok: true, kind: 'open', stopKey, address, blockId: id, key: targetKey(stopKey, 'open', address) };
  }

  if (id.startsWith('ex:')) {
    const site = EX_SITE_ID.exec(id);
    if (!site) {
      // `out` and `back` are transport and mint nothing; anything else is a malformed id.
      return EX_ANY_ID.test(id) ? null : identityRefusal('excursion_id_malformed', { blockId: id });
    }
    const [, stopKey, excursionPlaceId] = site;
    if (stopKey === '' || stopKey !== anchorStopId) {
      return identityRefusal('excursion_id_stop_mismatch', { blockId: id, parsed: stopKey, anchorStopId });
    }
    const address = { excursionPlaceId };
    return { ok: true, kind: 'excursion', stopKey, address, blockId: id, key: targetKey(stopKey, 'excursion', address) };
  }

  return null; // tr:, day:, rest: and anything else — unchanged, mints nothing.
}

/** The canonical comparison key of an address, by kind. */
function addressKey(kind, address) {
  if (kind === 'excursion') return `x|${address?.excursionPlaceId ?? ''}`;
  return `o|${address?.dayOffset ?? ''}|${address?.ordinal ?? ''}|${address?.slot ?? ''}`;
}

/** Matching is always scoped to one stop, so the key carries `stopKey`. */
function targetKey(stopKey, kind, address) {
  return `${stopKey ?? ''}\u0000${addressKey(kind, address)}`;
}

/** The same key, derived from a stored placement rather than from a block. */
export function placementKey(placement) {
  return targetKey(placement?.stopKey, placement?.kind, placement?.address);
}

// ---------------------------------------------------------------------------
// §3.2 Excursion metadata — resolved with the CALLER's data, never PILOT_DATA.

/**
 * The selected excursion whose place this site block visits, or `null` when it cannot be
 * resolved. A fixed excursion has no id at all (`RoutePackageExcursion` carries only
 * `placeId`, `connectionId`, `hoursOnSite`), so `null` is the correct, honest record for
 * it as much as for a withdrawn menu entry or an unknown variant.
 */
function resolveExcursionId(data, routePlan, stopKey, excursionPlaceId) {
  if (!data || !routePlan?.variantId) return null;
  const menu = findRoutePackage(data, routePlan.variantId)?.stops.find((s) => s.id === stopKey)?.excursionMenu ?? [];
  return menu.find((m) => m.placeId === excursionPlaceId)?.id ?? null;
}

/**
 * Every qualifying target the build currently has, in day then block order, with the
 * duplicate `(stopKey, excursionPlaceId)` site refusal applied BEFORE any issuance.
 *
 * @param {Trip} trip
 * @param {{data?: Object}} [opts]
 * @returns {{ok: true, targets: Object[]} | {ok: false, reason: string, message: string, detail: Object}}
 */
export function qualifyingTargets(trip, { data } = {}) {
  const targets = [];
  const seen = new Map();
  for (const day of trip?.days ?? []) {
    for (const block of day?.blocks ?? []) {
      const t = identityTargetFor(block);
      if (t === null) continue;
      if (t.ok !== true) return t;
      const first = seen.get(t.key);
      if (first !== undefined) {
        return identityRefusal(
          t.kind === 'excursion' ? 'duplicate_site_target' : 'duplicate_target_address',
          { stopKey: t.stopKey, kind: t.kind, address: t.address, blockIds: [first, t.blockId] }
        );
      }
      seen.set(t.key, t.blockId);
      targets.push(
        t.kind === 'excursion'
          ? { ...t, block, excursionId: resolveExcursionId(data, trip?.routePlan, t.stopKey, t.address.excursionPlaceId) }
          : { ...t, block }
      );
    }
  }
  return { ok: true, targets };
}

/** What a placement looks like for a target, at issuance or on a match. */
function placementFor(target) {
  return {
    stopKey: target.stopKey,
    kind: target.kind,
    address: { ...target.address },
    state: 'live',
    ...(target.kind === 'excursion' ? { excursionId: target.excursionId ?? null } : {})
  };
}

// ---------------------------------------------------------------------------
// §3.3 Correspondence — D-A §5.1, one pass, exact address, within one stop.

/**
 * The state a RETAINED placement takes when its exact address is no longer a target of
 * this build and its stop is still present. The placement's own kind decides, and the two
 * outcomes are not interchangeable (R1).
 *
 * An OPEN window is `displaced`. The scheduler regenerates `op:` windows on every rebuild,
 * so their absence is genuinely transient — a night added, a day reshaped from full to
 * half — and D-A's recovery promise is that the exact window's return restores the edit
 * that was waiting for it. Its address is therefore left untouched on displacement.
 *
 * An EXCURSION site window is `retired`, terminally, with its edit and its registry entry
 * retained. An `ex:…:site` block exists if and only if that excursion is part of the trip
 * at that stop, so the window does not vanish because the scheduler reshaped a day: it
 * vanishes because the excursion itself left the trip. What returns afterwards is a NEW
 * selection of that excursion, not the same window coming back, and reusing the old `luid`
 * would attach an old edit to a decision the traveller made afresh. Re-selection therefore
 * issues a DISTINCT `luid`, which is what D-A §5.5 case 3 and §6.2 require of a removed
 * selection's placement.
 *
 * Retiring is also the conservative direction: it never carries an identity across a
 * boundary where the logical thing may have changed, and it loses nothing, because the
 * edit and the `used` entry both survive.
 */
function vanishedState(placement) {
  return placement?.kind === 'excursion' ? 'retired' : 'displaced';
}

/**
 * Carries a prior map onto the targets a new build has.
 *
 * Domain: RETAINED placements only — `live` or `displaced`. `dismissed`, `retired` and
 * `orphaned` are terminal for matching and are carried through untouched.
 *
 * Eligibility is never a matching criterion: a matched placement whose content is no
 * longer eligible keeps its identity and its edit. This differs deliberately from
 * `tryKeep` (`restructure.js:183`, `:186-187`), which folds eligibility into the match and
 * which packet 1b does not change.
 *
 * Case A — an established holder (state `live` at that address) versus a dormant
 * claimant: the holder keeps the window, the claimant is `retired` TERMINALLY with its
 * edit retained. This is what stops the loop: an identity superseded once never contests
 * the same address again, so a second rebuild does not displace the holder.
 *
 * Case B — a genuine tie, two or more claimants and no established holder: the operation
 * is REFUSED WHOLE, naming the conflicting edits. Choosing either silently is the failure
 * the governing rule exists to prevent; choosing neither leaves a trip that re-fails
 * identically on the next rebuild.
 *
 * `address` is written only at issuance and on a match, never on displacement — that is
 * what lets a displaced placement recover when its exact window returns.
 *
 * @param {Object|null|undefined} priorIdentity
 * @param {Object[]} targets
 * @param {Set<string>} stopKeys  The stops the new build has.
 * @param {string|number|null} [at]  D-A §6.2's supplied transition time, already resolved.
 */
export function correspond(priorIdentity, targets, stopKeys, at = null) {
  const prior = priorIdentity?.blocks ?? {};
  const targetByKey = new Map(targets.map((t) => [t.key, t]));

  /** @type {Object<string, Object>} */
  const blocks = {};
  /** @type {Map<string, Array<[string, Object]>>} */
  const claims = new Map();

  for (const [luid, placement] of Object.entries(prior)) {
    if (!RETAINED_STATES.includes(placement?.state)) {
      blocks[luid] = placement; // terminal or already orphaned: carried through unchanged
      continue;
    }
    const key = placementKey(placement);
    if (!claims.has(key)) claims.set(key, []);
    claims.get(key).push([luid, placement]);
  }

  const matched = new Set();
  /** Placements that were `displaced` and have just been matched back to a live window (R2). */
  const recovered = [];
  for (const [key, claimants] of claims) {
    const target = targetByKey.get(key);

    if (target === undefined) {
      // No window at this address in this build. A missing stop decides `orphaned`;
      // otherwise the placement's own kind decides, per `vanishedState`. An open
      // window's address is left exactly as it was, which is what lets its return
      // recover it.
      for (const [luid, placement] of claimants) {
        const stopGone = placement.stopKey != null && !stopKeys.has(placement.stopKey);
        blocks[luid] = transition(placement, stopGone ? 'orphaned' : vanishedState(placement), at);
      }
      continue;
    }

    if (claimants.length === 1) {
      const [luid, placement] = claimants[0];
      blocks[luid] = { ...placement, ...placementFor(target) };
      matched.add(key);
      if (placement.state === 'displaced') recovered.push({ luid, target });
      continue;
    }

    const holders = claimants.filter(([, placement]) => placement.state === 'live');

    if (holders.length === 1) {
      // Case A.
      const [holderLuid, holder] = holders[0];
      blocks[holderLuid] = { ...holder, ...placementFor(target) };
      matched.add(key);
      // A case-A holder is `live` by definition, so it is never a recovery.
      for (const [luid, placement] of claimants) {
        if (luid !== holderLuid) blocks[luid] = transition(placement, 'retired', at);
      }
      continue;
    }

    if (holders.length > 1) {
      // Two live placements at one address is a defect in the map handed to us, which
      // §3.5 check 2 exists to catch. It is not D-A's "genuine tie", so it is named apart.
      return identityRefusal('duplicate_live_address', {
        stopKey: target.stopKey,
        address: target.address,
        conflicting: holders.map(([luid]) => luid)
      });
    }

    // Case B.
    return identityRefusal('address_tie', {
      stopKey: target.stopKey,
      address: target.address,
      conflicting: claimants.map(([luid]) => luid)
    });
  }

  return { ok: true, blocks, recovered, newTargets: targets.filter((t) => !matched.has(t.key)) };
}

// ---------------------------------------------------------------------------
// §3.5 Full validation — D-B §4.2, run in phase 3 on the RESOLVED result.
//
// Retained history does not participate. `displaced`, `orphaned`, `dismissed` and
// `retired` placements legitimately outnumber the live surface, must not make a correct
// map fail, and counting all entries must never masquerade as coverage. Coverage is a
// per-target BIJECTION, never a count comparison.

/**
 * @param {Trip} trip      The resolved build the map must cover.
 * @param {Object} identity
 * @param {{data?: Object, registry?: Set<string>}} [opts]
 */
export function validateIdentity(trip, identity, { data, registry } = {}) {
  if (identity == null || typeof identity !== 'object') return identityRefusal('absent');

  const found = qualifyingTargets(trip, { data }); // check 5 lives here, before anything else
  if (!found.ok) return found;

  const blocks = identity.blocks ?? {};
  const edits = identity.edits ?? {};

  // 2. Every `live` placement has a unique address, within its own stop.
  const liveByKey = new Map();
  for (const [luid, placement] of Object.entries(blocks)) {
    if (placement?.state !== 'live') continue;
    const key = placementKey(placement);
    const taken = liveByKey.get(key);
    if (taken !== undefined) {
      return identityRefusal('duplicate_live_address', {
        stopKey: placement.stopKey, address: placement.address, conflicting: [taken, luid]
      });
    }
    liveByKey.set(key, luid);
  }

  // 1. Coverage, bijective in both directions. Counts are never compared.
  for (const target of found.targets) {
    if (!liveByKey.has(target.key)) {
      return identityRefusal('coverage_target_uncovered', {
        blockId: target.blockId, stopKey: target.stopKey, kind: target.kind, address: target.address
      });
    }
  }
  const targetKeys = new Set(found.targets.map((t) => t.key));
  for (const [key, luid] of liveByKey) {
    if (!targetKeys.has(key)) {
      const placement = blocks[luid];
      return identityRefusal('coverage_placement_unmatched', {
        luid, stopKey: placement.stopKey, kind: placement.kind, address: placement.address
      });
    }
  }

  // 3. Every `edits` key exists in `blocks`.
  for (const luid of Object.keys(edits)) {
    if (!(luid in blocks)) return identityRefusal('edit_without_placement', { luid });
  }

  // 4. Every key in `blocks` is in the working registry.
  const reg = registry ?? new Set(identity.used ?? []);
  for (const luid of Object.keys(blocks)) {
    if (!reg.has(luid)) return identityRefusal('key_not_in_registry', { luid });
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// §3.4 Issuance. The `sessionId.js:34-70` tiering, COPIED and not imported: that module
// states plainly that it is a transient label and not Q8 identity, so this reuses its
// availability pattern rather than its meaning. The fallback tiers are safe only because
// every candidate is checked against the working registry at the moment of issuance.

const LUID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

// Module-local and monotonically increasing. It separates fallback tokens within one page
// load even when the clock and the random sources repeat, throw or return garbage.
let counter = 0;

function guarded(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

// An explicitly supplied property (even one that later fails) overrides the default; only
// an absent/undefined property uses the default.
function source(env, key, defaultValue) {
  const supplied = guarded(() => (env && typeof env === 'object' ? env[key] : undefined), undefined);
  return supplied === undefined ? guarded(defaultValue, undefined) : supplied;
}

function fromRandomUuid(crypto) {
  return guarded(() => {
    const fn = crypto.randomUUID;
    if (typeof fn !== 'function') return null;
    const value = fn.call(crypto);
    return typeof value === 'string' && LUID_PATTERN.test(value) ? value : null;
  }, null);
}

function fromGetRandomValues(crypto) {
  return guarded(() => {
    const fn = crypto.getRandomValues;
    if (typeof fn !== 'function') return null;
    const bytes = new Uint8Array(16);
    fn.call(crypto, bytes);
    if (!bytes.some((b) => b !== 0)) return null; // unfilled
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return LUID_PATTERN.test(hex) ? hex : null;
  }, null);
}

function fromClockAndCounter(env) {
  const now = source(env, 'now', () => Date.now);
  const random = source(env, 'random', () => Math.random);
  const time = guarded(() => {
    const v = now();
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER ? Math.floor(v) : 0;
  }, 0);
  const fragment = guarded(() => {
    const v = random();
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1 ? Math.floor(v * 36 ** 8) : 0;
  }, 0);
  counter = counter >= Number.MAX_SAFE_INTEGER ? 1 : counter + 1;
  const id = `u${time.toString(36)}-${fragment.toString(36)}-${counter.toString(36)}`;
  // Always valid and bounded; the counter alone guarantees distinctness.
  return LUID_PATTERN.test(id) ? id : `u${counter.toString(36)}`;
}

/**
 * One candidate token. Never throws, for any input including a hostile `env`. A candidate
 * is not an issuance: only the registry check in `mint` makes it one.
 * @param {Object} [env]
 * @returns {string}
 */
export function newLuid(env = {}) {
  const crypto = source(env, 'crypto', () => globalThis.crypto);
  return fromRandomUuid(crypto) ?? fromGetRandomValues(crypto) ?? fromClockAndCounter(env);
}

/** A provisional, proposal-local key (`#new1`): never a `luid`, never in `used`, never stored. */
export function isProvisionalKey(key) {
  return typeof key === 'string' && key.startsWith('#');
}

/**
 * Mints against the working registry, which is the authority at the moment of issuance.
 * Reminting is bounded; exhaustion refuses the operation whole rather than installing
 * anything. A constant token source therefore yields distinct `luid`s or a refusal —
 * never a duplicate, never a partial install.
 */
function mint(registry, env) {
  for (let attempt = 1; attempt <= MINT_ATTEMPTS; attempt += 1) {
    const candidate = newLuid(env);
    if (typeof candidate !== 'string' || candidate === '' || isProvisionalKey(candidate)) continue;
    if (!registry.has(candidate)) return { ok: true, luid: candidate };
  }
  return identityRefusal('token_exhausted', { attempts: MINT_ATTEMPTS });
}

// ---------------------------------------------------------------------------
// §6.1 Allocation is not issuance.

/**
 * The proposal-local allocation: what a rebuild WOULD do, with a provisional key for each
 * target no retained placement can match. A provisional key is not a `luid`, never enters
 * `used`, never reaches storage and has no meaning outside its proposal. Nothing is
 * minted here.
 *
 * This is advisory. `commitIdentity` recomputes correspondence itself and never trusts an
 * allocation as the committed map, so a planted or stale allocation cannot reach a trip.
 *
 * @returns {{ok: true, identity: Object} | {ok: false, reason: string, message: string, detail: Object}}
 */
export function allocateIdentity(currentTrip, nextTrip, { data, at } = {}) {
  const time = identityTime(at);
  if (!time.ok) return time;
  const found = qualifyingTargets(nextTrip, { data });
  if (!found.ok) return found;
  const stopKeys = new Set((nextTrip?.routePlan?.stops ?? []).map((s) => s.key));
  const corr = correspond(currentTrip?.identity, found.targets, stopKeys, time.at);
  if (!corr.ok) return corr;

  const blocks = { ...corr.blocks };
  corr.newTargets.forEach((target, i) => {
    blocks[`#new${i + 1}`] = placementFor(target);
  });

  return {
    ok: true,
    identity: {
      version: IDENTITY_VERSION,
      used: [...(currentTrip?.identity?.used ?? [])],
      blocks,
      edits: { ...(currentTrip?.identity?.edits ?? {}) }
    }
  };
}

// ---------------------------------------------------------------------------
// §3.4 The four-phase commit.

/**
 * Provisional validation (phase 1), against an allocation as it stands. Provisional keys
 * are EXPECTED here and are deliberately NOT checked against any registry — checking them
 * would reject every addition, because a provisional key cannot be in a registry by
 * definition. That was revision 4's error and is the reason the phase order matters.
 */
function validateProvisional(allocation) {
  if (allocation == null) return { ok: true };
  if (typeof allocation !== 'object') return identityRefusal('allocation_invalid', {});
  const blocks = allocation.blocks ?? {};
  const edits = allocation.edits ?? {};

  const liveByKey = new Map();
  for (const [key, placement] of Object.entries(blocks)) {
    if (placement?.state !== 'live') continue;
    const addr = placementKey(placement);
    const taken = liveByKey.get(addr);
    if (taken !== undefined) {
      return identityRefusal('provisional_duplicate_live_address', { conflicting: [taken, key] });
    }
    liveByKey.set(addr, key);
  }
  for (const key of Object.keys(edits)) {
    if (!(key in blocks)) return identityRefusal('provisional_edit_without_placement', { key });
  }
  return { ok: true };
}

/**
 * The four phases, in this order, on a private working copy. Any failure in phases 1 to 3
 * discards that copy entirely: nothing is installed, no token becomes a committed
 * issuance, and the caller's trip is exactly as it was.
 *
 * The token contract, split. ZERO token-source calls for a phase-1 abort. From phase 2
 * onwards calls MAY have occurred, and that is not a failure; what must hold is that
 * nothing is committed. The distinction is a generated candidate versus a committed
 * issuance.
 *
 * @param {{priorIdentity?: Object, nextTrip: Trip, data?: Object, tokens?: Object,
 *          at?: string|number, allocation?: Object, attachEdits?: Object[]}} args
 * @returns {{ok: true, identity: Object, recovered: Object[]}
 *          | {ok: false, reason: string, message: string, detail: Object}}
 */
function runPhases({ priorIdentity, nextTrip, data, tokens, at, allocation, attachEdits }) {
  // --- Phase 1 — prepare. Nothing here touches the live trip, and nothing mints. -----
  const registry = new Set(priorIdentity?.used ?? []);

  // The supplied transition time, resolved once here so every stamp this operation writes
  // carries one value, and refused by name before any other work if it is not a time.
  const time = identityTime(at);
  if (!time.ok) return time;

  const found = qualifyingTargets(nextTrip, { data });
  if (!found.ok) return found; // includes the duplicate-site refusal, before any issuance

  // The serialization boundary's input half (R2.1). A trip graph that already carries an
  // operation outcome — planted on `proposal.trip`, or riding in a history snapshot — must
  // not be committed, and refusing here costs zero token-source calls, like a tie.
  const unpolluted = assertNoOutcomeMetadata(nextTrip);
  if (!unpolluted.ok) return unpolluted;

  const provisional = validateProvisional(allocation);
  if (!provisional.ok) return provisional;

  const stopKeys = new Set((nextTrip?.routePlan?.stops ?? []).map((s) => s.key));
  const corr = correspond(priorIdentity, found.targets, stopKeys, time.at);
  if (!corr.ok) return corr; // a case-B tie aborts here, with zero token-source calls

  // D-A §6.2 is mandatory at a commit, and this is a commit (R5). Phase 1, so a missing
  // time costs zero token-source calls and nothing is installed, exactly like a tie. The
  // guard is given THIS operation's resolved time, so a placement displaced once before
  // and displaced again cannot satisfy it with the stamp it was already carrying.
  const stamped = requireTransitionStamps(priorIdentity?.blocks, corr.blocks, time.at);
  if (!stamped.ok) return stamped;

  // --- Phase 2 — issue and resolve. --------------------------------------------------
  const blocks = { ...corr.blocks };
  const resolvedFromProvisional = new Map();
  const provisionalByAddress = new Map();
  for (const [key, placement] of Object.entries(allocation?.blocks ?? {})) {
    if (isProvisionalKey(key)) provisionalByAddress.set(placementKey(placement), key);
  }

  for (const target of corr.newTargets) {
    const minted = mint(registry, tokens);
    if (!minted.ok) return minted; // exhaustion refuses whole; nothing is installed
    registry.add(minted.luid);
    blocks[minted.luid] = placementFor(target);
    const provisionalKey = provisionalByAddress.get(target.key);
    if (provisionalKey !== undefined) resolvedFromProvisional.set(provisionalKey, minted.luid);
  }

  const edits = { ...(priorIdentity?.edits ?? {}) };
  // Any intent the allocation carried on a provisional key follows it to the issued luid.
  for (const [key, entry] of Object.entries(allocation?.edits ?? {})) {
    if (!isProvisionalKey(key)) continue;
    const luid = resolvedFromProvisional.get(key);
    if (luid !== undefined) edits[luid] = { ...entry };
  }
  for (const update of attachEdits ?? []) {
    const luid = isProvisionalKey(update.luid) ? resolvedFromProvisional.get(update.luid) : update.luid;
    if (luid === undefined) return identityRefusal('provisional_key_unresolved', { key: update.luid });
    edits[luid] = intentEntry(update);
  }

  // After phase 2 no provisional key may remain anywhere in the working copy.
  for (const key of Object.keys(blocks)) {
    if (isProvisionalKey(key)) return identityRefusal('provisional_key_unresolved', { key });
  }
  for (const key of Object.keys(edits)) {
    if (isProvisionalKey(key)) return identityRefusal('provisional_key_unresolved', { key });
  }

  // --- Phase 3 — validate the completed, resolved result. ----------------------------
  const identity = { version: IDENTITY_VERSION, used: [...registry], blocks, edits };
  const valid = validateIdentity(nextTrip, identity, { data, registry });
  if (!valid.ok) return valid;

  // --- Phase 4 — the caller installs this EXPLICITLY, never by spread. ---------------
  // `recovered` travels with the map so the caller can honour a returning window's
  // retained intent in the ITINERARY as well (R2). It names placements only; it is not
  // itself an itinerary change, and a caller that ignores it gets exactly the map.
  return { ok: true, identity, recovered: corr.recovered };
}

/**
 * The rebuild/apply path: carry the current trip's map onto the build a proposal produced.
 *
 * @param {{currentTrip: Trip, nextTrip: Trip, data?: Object, tokens?: Object,
 *          at?: string|number, allocation?: Object}} args
 */
export function commitIdentity({ currentTrip, nextTrip, data, tokens, at, allocation }) {
  return runPhases({ priorIdentity: currentTrip?.identity, nextTrip, data, tokens, at, allocation });
}

/**
 * Fresh build (D-B §4.1). The working registry starts empty and every qualifying block is
 * issued in phase 2. IMPLEMENTED AND CALLED FROM NOWHERE: wiring it into `buildF6Trip` is
 * packet 2's work and is not authorized here.
 */
export function initialiseIdentityForBuild(trip, { data, tokens, at } = {}) {
  return runPhases({ priorIdentity: null, nextTrip: trip, data, tokens, at });
}

/**
 * An imported legacy snapshot, on open (D-B §4.1). The registry is seeded from the
 * snapshot's own `used` where one exists and is empty where none does, and the `locked` /
 * `userEdited` flags the loaded build genuinely carries are attached in phase 2 to the
 * `luid`s of the blocks carrying them. That is not fabrication: those flags name blocks
 * this build actually contains. What is NOT recovered is history — where a pin sat before
 * some earlier rebuild — and nothing here invents it.
 *
 * IMPLEMENTED AND CALLED FROM NOWHERE: wiring it into the open path is packet 2's work.
 */
export function initialiseIdentityForLegacyTrip(trip, { data, tokens, at } = {}) {
  const found = qualifyingTargets(trip, { data });
  if (!found.ok) return found;

  // Phase-2 attachments, addressed by the provisional keys phase 2 will issue against.
  const allocation = { version: IDENTITY_VERSION, used: [], blocks: {}, edits: {} };
  const attachEdits = [];
  found.targets.forEach((target, i) => {
    const key = `#new${i + 1}`;
    allocation.blocks[key] = placementFor(target);
    const block = target.block;
    if (block.locked !== true && block.userEdited !== true) return;
    attachEdits.push({
      luid: key,
      intent: 'imported',
      contentId: block.anchor?.contentId ?? null,
      locked: block.locked === true,
      userEdited: block.userEdited === true,
      provenance: 'legacy_initialization'
    });
  });

  return runPhases({
    priorIdentity: trip?.identity?.used ? { used: trip.identity.used, blocks: {}, edits: {} } : null,
    nextTrip: trip,
    data,
    tokens,
    at,
    allocation,
    attachEdits
  });
}

// ---------------------------------------------------------------------------
// R2 — restoring a returning window's retained intent to the ITINERARY.
//
// Correspondence recovers a `displaced` placement when its exact address returns, and
// that recovery is recorded in the map. On its own that is not enough: the itinerary is
// produced by `reconcile`'s legacy content pass, whose `tryKeep` can preserve a pin only
// while the pinned block is still in the previous itinerary. Once the window has been
// displaced, nothing carries the retained intent back into the block that returns — so the
// map would say a pin survived while every later command read an unlocked block. A map
// recording a recovery the itinerary does not honour is not a recovery.
//
// So, on the opted-in path only, a recovered placement's retained intent is written back
// onto its exact returning block. `tryKeep` is NOT touched and the default path is
// unchanged: this runs after the legacy pass, from the committed map, and only for
// placements correspondence itself reports as recovered.
//
// WHAT IS RESTORED, and the conservative limit. Only intent the itinerary can honour
// COMPLETELY is written:
//
//   retained contentId is null             -> flags only; there is no content to place
//   retained contentId INELIGIBLE there    -> NOTHING is written to the block
//   retained contentId not in the shelf    -> NOTHING is written to the block
//   retained contentId already in place    -> the flags, once the gate has allowed it
//   retained contentId eligible there      -> the content is placed, then the flags
//
// The two "nothing" rows are the honest case, not a silent one. Pinning content the
// traveller never chose would be worse than leaving the filler's choice, so the block is
// left alone, the retained edit stays recorded exactly as §3.3 promises, and the placement
// is REPORTED in `unrestorable` so the divergence is visible rather than invented away.
// Eligibility is the engine's own gate, through this module's single call site, with the
// caller's own `choices.rejected` exclusions — no rule of this module's own is added.
//
// THE GATE IS CONSULTED FOR EVERY CONTENT-BEARING INTENT, including one whose content is
// ALREADY in the block (R2.2). Restoring the flags is as much a restoration as placing the
// content: a pin asserts "this content, here", and asserting it over content the trip now
// excludes is the same divergence whichever way the content arrived. Checking only the
// differing case made the gate reachable by one branch of two and left the other restoring
// content the engine's own gate refuses — a rejected item among them. The gate is
// applicable in the already-present case because it does not count a block's own content
// as used (`fill.js:160`), so a block's current content is eligible there unless some
// other rule — an exclusion, the accepted slots, `minDayAtStop`, `visitsPlaceId` — says
// otherwise, which is exactly the question being asked.
//
// Restoration never changes a block's `id`, `startTime`, `durationHours` or
// `anchor.stopId`, and `classifySlot` reads only `startTime` and `durationHours`
// (`fill.js:42-48`), so NO ADDRESS CAN CHANGE and phase 3's validation of the resolved map
// still holds over the restored trip.
//
// DERIVED METADATA (R2.3). Placing content closes a gap, so the trip's own derived
// summary of its gaps must follow: writing `days` alone left `contentGaps` naming a block
// that is now an activity, which is the same class of defect as a map that disagrees with
// its itinerary. `contentGaps`, `status` and `warnings` are therefore recomputed from the
// restored `days` exactly as `edit.js`'s own `applyMeta` recomputes them after a bounded
// edit (`edit.js:46-67`) — duplicated here with its citation rather than hoisted, because
// `edit.js`'s diff is confined to the seven exports the brief names. The recomputation
// runs only when restoration actually replaced a block, and is a no-op when the gap
// picture did not change.

/**
 * @param {Trip} trip        The build about to be committed, with the resolved map's addresses.
 * @param {Object} identity  The resolved map, whose `edits` carry the retained intent.
 * @param {Array<{luid: string, target: Object}>} recovered
 * @param {{content: ContentItem[]}} opts
 * @returns {{ok: true, trip: Trip, restored: Object[], unrestorable: Object[]}
 *          | {ok: false, reason: string, message: string, detail: Object}}
 */
export function restoreRecoveredIntents(trip, identity, recovered, { content } = {}) {
  const restored = [];
  const unrestorable = [];
  if (!Array.isArray(recovered) || recovered.length === 0) return { ok: true, trip, restored, unrestorable };

  const replacements = new Map();
  let working = trip;

  for (const { luid, target } of recovered) {
    const intent = identity?.edits?.[luid];
    if (intent === undefined) continue; // a window with no retained intent has nothing to restore

    // Read the block from the working trip, so two recoveries on one day compose.
    const block = blockById(working, target.blockId);
    if (block === null) {
      return identityRefusal('recovered_block_missing', { luid, blockId: target.blockId });
    }

    const wanted = intent.contentId ?? null;
    let next = block;

    if (wanted !== null) {
      // The gate first, for the already-present case as much as the differing one (R2.2).
      const gate = relocationTargetEligible(working, block, wanted, content ?? []);
      if (!gate.ok) return gate;
      if (!gate.eligible) {
        // The retained content may not be honoured here any more. Leave the block exactly
        // as the filler left it, keep the edit, and say so.
        unrestorable.push({ luid, blockId: target.blockId, contentId: wanted, why: 'content_not_eligible' });
        continue;
      }
      if (block.anchor?.contentId !== wanted) {
        const item = (content ?? []).find((c) => c.id === wanted);
        if (item === undefined) {
          // A guard, not a branch the gate can reach: the gate answers from a filtered
          // subset of this very shelf, so "eligible" already implies "in the shelf". It
          // reports rather than throwing if that ever stops being true.
          unrestorable.push({ luid, blockId: target.blockId, contentId: wanted, why: 'content_not_in_shelf' });
          continue;
        }
        next = activityBlockFor(block, item);
      }
    }

    next = {
      ...next,
      locked: intent.locked === true,
      userEdited: intent.userEdited === true
    };
    replacements.set(target.blockId, next);
    working = withBlock(working, next);
    restored.push({ luid, blockId: target.blockId, contentId: next.anchor?.contentId ?? null, locked: next.locked });
  }

  return {
    ok: true,
    trip: replacements.size === 0 ? trip : withContentMeta(working, trip),
    restored,
    unrestorable
  };
}

/**
 * The gap list, status and warnings recomputed from the restored `days`, exactly as
 * `edit.js`'s `applyMeta` recomputes them after a bounded edit (`edit.js:46-67`). Placing
 * content closes a gap, so leaving these three fields alone would return a trip whose own
 * summary contradicted its days (R2.3).
 *
 * `before` supplies the pre-restoration status and warnings, which is what `applyMeta`
 * means by its `preTrip` arguments: `CONTENT_INSUFFICIENT` is dropped and re-added from
 * the recomputed gaps, so it is never stale in either direction.
 *
 * @param {Trip} working  The trip with the restored blocks.
 * @param {Trip} before   The trip as it stood before restoration.
 */
function withContentMeta(working, before) {
  const contentGaps = [];
  for (const day of working.days) {
    for (const block of day.blocks) {
      if (block.type === 'open' && block.gap) {
        contentGaps.push({ blockId: block.id, dayNumber: day.dayNumber, placeId: block.placeId, slot: block.gap.slot });
      }
    }
  }
  const hasGaps = contentGaps.length > 0;
  const baseWarnings = (before.warnings ?? []).filter((w) => w !== FAILURE_STATES.CONTENT_INSUFFICIENT);
  return {
    ...working,
    contentGaps,
    status: hasGaps ? 'incomplete' : before.status,
    warnings: hasGaps ? [...baseWarnings, FAILURE_STATES.CONTENT_INSUFFICIENT] : baseWarnings
  };
}

/** One block of this trip by id, or null. */
function blockById(trip, blockId) {
  for (const day of trip?.days ?? []) {
    for (const block of day?.blocks ?? []) if (block?.id === blockId) return block;
  }
  return null;
}

/** The trip with one block replaced in place, leaving the calendar untouched. */
function withBlock(trip, block) {
  return {
    ...trip,
    days: trip.days.map((day) => ({
      ...day,
      blocks: day.blocks.map((b) => (b.id === block.id ? block : b))
    }))
  };
}

/**
 * An activity block carrying `item`, built the same way `edit.js`'s own `buildActivityBlock`
 * builds one (`edit.js:79-95`) so a restored block is indistinguishable in shape from a
 * swapped one. The slot is the block's own, so the address cannot move.
 */
function activityBlockFor(block, item) {
  return {
    ...block,
    type: 'activity',
    anchor: { ...block.anchor, contentId: item.id },
    activity: activityFor(item, classifySlot(block)),
    generationStatus: 'ok',
    gap: undefined,
    provenance: {
      source: 'curated',
      reviewed: false,
      confidence: item.source.kind === 'extracted' ? 'high' : 'medium',
      content: { ...item.source }
    }
  };
}

// ---------------------------------------------------------------------------
// §2.1 Bounded-edit intent.

/** A complete intent entry, constructed whether or not the placement had one before. */
function intentEntry({ intent, contentId = null, locked = false, userEdited = false, provenance }) {
  return { intent, contentId: contentId ?? null, locked: locked === true, userEdited: userEdited === true, provenance };
}

/**
 * The live placement covering one block of this trip.
 *
 * Packet 1b creates identity nowhere, so a trip with no map has no `luid` for an intent to
 * attach to: that refuses BY NAME rather than fabricating a partial map, which would fail
 * §3.5's coverage check and would be identity creation on a path §4 forbids.
 *
 * @param {Trip} trip
 * @param {Block} block
 */
export function placementForBlock(trip, block) {
  const identity = trip?.identity;
  if (identity == null || typeof identity !== 'object') {
    return identityRefusal('absent', { blockId: block?.id ?? null });
  }
  const target = identityTargetFor(block);
  if (target === null) return identityRefusal('block_not_qualifying', { blockId: block?.id ?? null });
  if (target.ok !== true) return target;

  for (const [luid, placement] of Object.entries(identity.blocks ?? {})) {
    if (placement?.state === 'live' && placementKey(placement) === target.key) {
      return { ok: true, luid, placement, target };
    }
  }
  return identityRefusal('coverage_target_uncovered', {
    blockId: target.blockId, stopKey: target.stopKey, kind: target.kind, address: target.address
  });
}

/**
 * Writes one or more complete intent entries onto a copy of the trip's map, resolving each
 * block to its own live placement first so a refusal leaves the caller's trip untouched.
 *
 * `blocks` is never written here: identity belongs to the logical block, independently of
 * intent, so a swap changes `edits[luid].contentId` and leaves `blocks[luid]` alone. A
 * `rejectActivity` with no eligible alternative records `contentId: null` on a placement
 * that stays `live` at an unchanged address — the window still exists, it is empty — and
 * that carries no trip-wide meaning: `choices.rejected` keeps exactly the content-id
 * exclusion meaning it has today, and no refill or rebuild policy is widened by it.
 *
 * @param {Trip} trip
 * @param {Array<{block: Block, intent: string, contentId?: string|null, locked?: boolean,
 *                userEdited?: boolean, provenance: string}>} updates
 */
export function recordBlockIntents(trip, updates) {
  const identity = trip?.identity;
  if (identity == null || typeof identity !== 'object') return identityRefusal('absent');

  const resolved = [];
  for (const update of updates) {
    const found = placementForBlock(trip, update.block);
    if (!found.ok) return found;
    resolved.push([found.luid, update]);
  }

  const edits = { ...(identity.edits ?? {}) };
  for (const [luid, update] of resolved) edits[luid] = intentEntry(update);
  return { ok: true, identity: { ...identity, edits } };
}

// ---------------------------------------------------------------------------
// §3.8 Undo — the `used` union and the mixed-history refusal, both opt-in only.

/**
 * The restored snapshot's order first, then whatever the current trip added. No entry is
 * ever deleted to free a key.
 */
export function unionUsed(restored, current) {
  const out = [...(restored ?? [])];
  const seen = new Set(out);
  for (const luid of current ?? []) {
    if (!seen.has(luid)) {
      seen.add(luid);
      out.push(luid);
    }
  }
  return out;
}

/**
 * `blocks` and `edits` rewind with the snapshot; `used` is the only field that does not.
 *
 * Mixed history — one side carrying a map and the other not — refuses BY NAME. Packet 1b
 * does not fabricate a `used`-only map for the missing side: that would be a partial map,
 * would fail §3.5's coverage check, and would be identity creation on a path §4 forbids.
 * Activation (packet 2) must guarantee D-B §4.1's "no pre-first-save window" precondition
 * so that mixed history cannot arise in production.
 *
 * @param {Trip} priorTrip   The snapshot being restored.
 * @param {Trip} currentTrip The trip undo was called on.
 */
export function undoIdentity(priorTrip, currentTrip) {
  const prior = priorTrip?.identity ?? null;
  const current = currentTrip?.identity ?? null;
  const priorHas = prior != null && typeof prior === 'object';
  const currentHas = current != null && typeof current === 'object';

  if (priorHas !== currentHas) {
    return identityRefusal('mixed_history', { snapshot: priorHas, current: currentHas });
  }
  if (!priorHas) return { ok: true, identity: undefined };
  return { ok: true, identity: { ...prior, used: unionUsed(prior.used, current.used) } };
}

// ---------------------------------------------------------------------------
// §3.6 The relocation API — D-A §5.3's four conditions, erratum 01 B's wording.

/** Is this block actually in this trip? `blockContext` throws when it is not. */
function blockPresent(trip, blockId) {
  for (const day of trip?.days ?? []) {
    for (const block of day?.blocks ?? []) if (block?.id === blockId) return true;
  }
  return false;
}

/**
 * Condition 4, and the ONLY place this module calls the engine's gate.
 *
 * `eligibleItemsForBlock` THROWS when the block is not in the trip (`fill.js:120`, via
 * `:153`), so presence is established first and a foreign block produces a NAMED REFUSAL
 * rather than a throw. The caller's own `choices.rejected` exclusions are passed, which the
 * gate itself applies; no check the gate performs is reimplemented here, and no rule of
 * this module's own is added. If the gate later gains a rule, the offer inherits it.
 *
 * @param {Trip} trip
 * @param {Block} block
 * @param {string} contentId
 * @param {ContentItem[]} content
 */
export function relocationTargetEligible(trip, block, contentId, content) {
  const blockId = block?.id ?? null;
  if (blockId == null || !blockPresent(trip, blockId)) {
    return identityRefusal('target_not_in_trip', { blockId });
  }
  const excludeContentIds = [...(trip?.spec?.choices?.rejected ?? [])];
  const eligible = eligibleItemsForBlock(trip, block, content, { excludeContentIds });
  return { ok: true, eligible: eligible.some((item) => item.id === contentId) };
}

/**
 * Only a DISPLACED placement may be relocated (R4). D-A §5.3 defines relocation as an
 * offer for a displaced edit, and the other states are not near-misses of that:
 *
 *   `live`      holds its own window; there is nothing displaced to move.
 *   `orphaned`  its stop left the trip and receives no offer at all.
 *   `dismissed` retained history — its intent has already gone somewhere else.
 *   `retired`   retained history — superseded, or a removed selection (R1).
 *
 * The check runs when offers are ENUMERATED and again at ACCEPTANCE, because an offer is
 * advisory until accepted and the source's own state can move between the two. Without the
 * second check a `retired` source could still transfer its old intent to a clean target and
 * become `dismissed` — which is what the review reproduced on all four states.
 */
function sourceEligibleForRelocation(placement) {
  return placement?.state === 'displaced'
    ? { ok: true }
    : identityRefusal('source_not_displaced', { state: placement?.state ?? null });
}

/** Does this placement carry a traveller edit of its own — a pin, a swap or a lock? */
function carriesOwnEdit(identity, luid, block) {
  if (identity.edits?.[luid] !== undefined) return true;
  return block?.locked === true || block?.userEdited === true;
}

/**
 * Every window this displaced placement may be offered, and nothing else.
 *
 * A window is offered only if all four hold: same `stopKey`; its own placement is `live`
 * in this build; it carries no traveller edit of its own; and the content is eligible
 * there under the engine's own gate. Slot fit alone is explicitly not sufficient.
 *
 * The offer is advisory until accepted. Where the edit names no content there is nothing
 * to test eligibility for, so no window is offered and the reason is named.
 *
 * @param {Trip} trip
 * @param {string} luid
 * @param {{data?: Object, content: ContentItem[]}} opts
 */
export function relocationOffers(trip, luid, { data, content } = {}) {
  const identity = trip?.identity;
  if (identity == null || typeof identity !== 'object') return identityRefusal('absent');
  const sourcePlacement = identity.blocks?.[luid];
  if (sourcePlacement === undefined) return identityRefusal('unknown_placement', { luid });

  // The source's own lifecycle state, BEFORE any window is considered (R4).
  const sourceEligible = sourceEligibleForRelocation(sourcePlacement);
  if (!sourceEligible.ok) return { ...sourceEligible, detail: { ...sourceEligible.detail, luid } };

  const contentId = identity.edits?.[luid]?.contentId ?? null;
  if (contentId == null) return { ok: true, offers: [], why: 'no_content_to_relocate' };

  const found = qualifyingTargets(trip, { data });
  if (!found.ok) return found;

  const liveByKey = new Map();
  for (const [candidate, placement] of Object.entries(identity.blocks ?? {})) {
    if (placement?.state === 'live') liveByKey.set(placementKey(placement), candidate);
  }

  const offers = [];
  for (const target of found.targets) {
    if (target.stopKey !== sourcePlacement.stopKey) continue; // 1
    const targetLuid = liveByKey.get(target.key);
    if (targetLuid === undefined || targetLuid === luid) continue; // 2
    if (carriesOwnEdit(identity, targetLuid, target.block)) continue; // 3
    const gate = relocationTargetEligible(trip, target.block, contentId, content); // 4
    if (!gate.ok) return gate;
    if (!gate.eligible) continue;
    offers.push({
      luid: targetLuid,
      blockId: target.blockId,
      stopKey: target.stopKey,
      kind: target.kind,
      address: { ...target.address }
    });
  }
  return { ok: true, offers };
}

/**
 * Accepting an offer attaches the traveller's intent to the TARGET's OWN existing `luid`.
 * Nothing is minted into an occupied address, no identity is moved, reissued or replaced,
 * and NO TOKEN IS ISSUED — `used` is unchanged.
 *
 * The target is re-validated against all four conditions against the trip AS IT STANDS at
 * this moment, so a stale offer can never overwrite another edit: if the window was edited
 * meanwhile, or the content is no longer eligible, the acceptance refuses and writes
 * nothing. The source placement becomes `dismissed`, with provenance recording where its
 * intent went.
 */
export function acceptRelocation(trip, luid, targetLuid, { data, content, at } = {}) {
  const time = identityTime(at);
  if (!time.ok) return time;
  const offered = relocationOffers(trip, luid, { data, content });
  if (!offered.ok) return offered;
  if (!offered.offers.some((offer) => offer.luid === targetLuid)) {
    return identityRefusal('target_not_offered', { luid, targetLuid });
  }

  const identity = trip.identity;
  // The source's lifecycle state AGAIN, against the trip as it now stands, and stated here
  // rather than inherited from the enumeration above so that removing either check leaves
  // the other to fail by name (R4). Refusing here writes nothing: no target intent is
  // attached and `used` is untouched.
  const stillEligible = sourceEligibleForRelocation(identity.blocks?.[luid]);
  if (!stillEligible.ok) return { ...stillEligible, detail: { ...stillEligible.detail, luid } };

  const intent = identity.edits[luid];
  const blocks = { ...identity.blocks, [luid]: transition(identity.blocks[luid], 'dismissed', time.at) };
  // The same §6.2 guard as the four-phase commit, because this is the other path that
  // commits a transition (R5), and with this operation's own resolved time: a source that
  // had been dismissed before and was put back cannot pay for this dismissal with that
  // old stamp. A `displaced` source always moves here, so acceptance always needs its
  // time; refusing writes nothing — no intent is attached and `used` is untouched.
  const stamped = requireTransitionStamps(identity.blocks, blocks, time.at);
  if (!stamped.ok) return stamped;

  return {
    ok: true,
    identity: {
      ...identity,
      used: [...(identity.used ?? [])],
      blocks,
      edits: {
        ...identity.edits,
        [targetLuid]: { ...intent, provenance: `relocated_from:${luid}` },
        [luid]: { ...intent, provenance: `relocated_to:${targetLuid}` }
      }
    }
  };
}
