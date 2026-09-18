import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, Globe, MapPin, Send, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import { norm } from "@/lib/regionalRoutes";
import { inferCountry } from "@/lib/questionnaireFlow";
import { getCityCoords } from "@/lib/coordinates";
import { haversineKm } from "@/lib/practicality";
import { base44 } from "@/api/base44Client";

// ---- Constants ----

const TYPE_LABEL = {
  region: "Region",
  multi_stop: "Multi-stop",
};

const ALERT_KEYWORDS = [
  "wet season", "monsoon", "extreme heat", "very hot", "cold", "snow",
  "hurricane", "typhoon", "rainy season",
];

// ---- Helpers ----

function typeLabel(dest) {
  return TYPE_LABEL[dest.destination_type] || null;
}

function matchesDest(dest, query) {
  const q = norm(query);
  if (!q) return false;
  return (
    norm(dest.name || "").includes(q) ||
    norm(dest.country || "").includes(q) ||
    norm(dest.region || "").includes(q)
  );
}

function isCountryQuery(destinations, query) {
  const q = norm(query);
  if (!q || q.length < 2) return null;
  const countryMatches = destinations.filter((d) => {
    const dc = norm(d.country || "");
    return dc === q || dc.startsWith(q + " ") || dc.startsWith(q);
  });
  if (countryMatches.length === 0) return null;
  // Confirm it's a country match, not a destination-name match
  const nameMatches = destinations.filter((d) => norm(d.name || "").includes(q));
  if (nameMatches.length > 0 && countryMatches.length === 0) return null;
  const country = countryMatches[0].country;
  if (!country) return null;
  return { country, dests: countryMatches };
}

// Score alternatives for the miss state. Returns up to 3 with a reason line.
// Two-factor ranking: continuous distance decay (max 60 pts) + tag/region/climate
// similarity derived from same-country catalogue entries (max ~40 pts).
function rankAlternatives(query, allDests, queryCoords) {
  const resolvedCountry = inferCountry(query);

  // Build reference tag signals from same-country catalogue entries
  const refDests = resolvedCountry
    ? allDests.filter((d) => d.country === resolvedCountry)
    : [];
  const refInterestTags = new Set(refDests.flatMap((d) => [
    ...(d.interest_tags || []),
    ...(d.primary_interests || []),
  ]));
  const refRegion = refDests[0]?.region ?? null;
  const refClimateTags = new Set(refDests.flatMap((d) => d.climate_tags || []));
  const hasSimilaritySignals = refInterestTags.size > 0 || refRegion != null || refClimateTags.size > 0;

  return allDests.map((dest) => {
    let distScore = 0;
    let simScore = 0;
    let distReason = null;
    let simReason = null;

    // Continuous distance score — exponential decay, max 60 pts, no band edges
    if (queryCoords) {
      const dc = dest.gateway_lat != null && dest.gateway_lng != null
        ? { lat: dest.gateway_lat, lng: dest.gateway_lng }
        : null;
      if (dc) {
        const km = haversineKm(queryCoords, dc);
        if (km != null) {
          distScore = Math.round(60 * Math.exp(-km / 2000));
          distReason = km < 1000
            ? `${Math.round(km)} km away`
            : `${Math.round(km / 100) * 100} km away`;
        }
      }
    }

    // Similarity score: interest-tag + climate-tag overlap, region bonus — max ~40 pts
    if (hasSimilaritySignals) {
      const destAllTags = new Set([
        ...(dest.interest_tags || []),
        ...(dest.primary_interests || []),
      ]);
      const tagOverlap = [...refInterestTags].filter((t) => destAllTags.has(t)).length;
      simScore += Math.min(tagOverlap * 6, 24);

      const climateOverlap = (dest.climate_tags || []).filter((t) => refClimateTags.has(t)).length;
      simScore += Math.min(climateOverlap * 4, 12);

      if (refRegion && dest.region === refRegion) {
        simScore += 8;
        simReason = `Same region as ${query.trim()}`;
      }
      if (tagOverlap >= 2 && !simReason) {
        simReason = `Similar character to ${query.trim()}`;
      }
    }

    const score = distScore + simScore;
    // Use similarity reason when it contributed meaningfully; fall back to distance
    const reason = simScore >= 8 && simReason ? simReason : distReason ?? simReason;
    return { dest, score, reason };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .filter((r) => r.reason);
}

// Group all destinations by country, alphabetical
function groupByCountry(destinations) {
  const map = {};
  for (const d of destinations) {
    const c = d.country || "Other";
    if (!map[c]) map[c] = [];
    map[c].push(d);
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
}

// ---- Badge ----

function TypeBadge({ dest }) {
  const badge = typeLabel(dest);
  if (!badge) return null;
  return (
    <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide bg-wn-cyan/15 text-wn-cyan rounded-full px-2.5 py-0.5">
      {badge === "Region" && <MapPin className="inline w-3 h-3 mr-0.5 -mt-px" aria-hidden="true" />}
      {badge}
    </span>
  );
}

// ---- Miss state ----

function MissState({ query, destinations, onSelect }) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState("");
  const [showNoteField, setShowNoteField] = useState(false);
  const [error, setError] = useState(false);

  const resolvedCountry = inferCountry(query);
  const queryCoords = getCityCoords(query, resolvedCountry);

  const alternatives = rankAlternatives(query, destinations, queryCoords);

  const handleRequest = async () => {
    setSubmitting(true);
    setError(false);
    try {
      await base44.entities.DestinationRequest.create({
        query_text: query,
        resolved_country: resolvedCountry || "",
        requested_at: new Date().toISOString(),
      });
      setSubmitted(true);
      setShowNoteField(true);
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNoteSubmit = async () => {
    if (!note.trim()) return;
    setSubmitting(true);
    try {
      await base44.entities.DestinationRequest.create({
        query_text: query,
        resolved_country: resolvedCountry || "",
        user_note: note.trim(),
        requested_at: new Date().toISOString(),
      });
    } catch {
      // Best effort; note is non-critical
    } finally {
      setSubmitting(false);
      setShowNoteField(false);
    }
  };

  return (
    <div className="px-5 py-5">
      {/* What they meant */}
      <div className="text-center mb-5">
        <AlertCircle className="w-5 h-5 text-wn-text-3 mx-auto mb-2" aria-hidden="true" />
        {resolvedCountry && query ? (
          <>
            <p className="text-[14px] text-wn-text-2 font-semibold mb-1">
              {query.trim()} ({resolvedCountry}) isn't in our catalogue yet
            </p>
            <p className="text-[13px] text-wn-text-3 leading-snug">
              WhereNova doesn't cover it yet — but we have destinations nearby
              that are ready to plan.
            </p>
          </>
        ) : resolvedCountry ? (
          <>
            <p className="text-[14px] text-wn-text-2 font-semibold mb-1">
              We don't cover {resolvedCountry} yet
            </p>
            <p className="text-[13px] text-wn-text-3 leading-snug">
              WhereNova doesn't have that country yet — but we have destinations
              nearby that are ready to plan.
            </p>
          </>
        ) : (
          <>
            <p className="text-[14px] text-wn-text-2 font-semibold mb-1">
              We don't have anything matching that yet
            </p>
            <p className="text-[13px] text-wn-text-3 leading-snug">
              We're adding new destinations regularly.
            </p>
          </>
        )}
      </div>

      {/* Alternatives */}
      {alternatives.length > 0 && (
        <div className="mb-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-wn-cyan text-center mb-3">
            Close in spirit, ready now
          </p>
          <ul className="space-y-1.5">
            {alternatives.map(({ dest, reason }) => (
              <li key={dest.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSelect(dest)}
                  className="w-full text-left rounded-xl bg-wn-surface/60 ring-1 ring-wn-line px-4 py-3 flex items-center justify-between gap-3 hover:ring-wn-cyan hover:bg-[rgba(63,216,224,0.07)] focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan motion-safe:transition"
                >
                  <div className="min-w-0">
                    <span className="text-wn-text text-[14px] font-medium">{dest.name}</span>
                    {dest.country && (
                      <span className="ml-2 text-wn-text-3 text-[12px]">{dest.country}</span>
                    )}
                    {reason && (
                      <p className="text-[12px] text-wn-text-3 mt-0.5">{reason}</p>
                    )}
                  </div>
                  <TypeBadge dest={dest} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Request CTA */}
      <div className="border-t border-wn-line pt-4">
        {!submitted ? (
          <div className="text-center">
            <p className="text-[13px] text-wn-text-3 mb-3">
              Want{" "}
              <span className="text-wn-text-2 font-medium">
                {query.trim() || "this destination"}
              </span>{" "}
              built?
            </p>
            <button
              type="button"
              disabled={submitting}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleRequest}
              className="inline-flex items-center gap-2 min-h-10 px-5 py-2 rounded-xl text-[13px] font-semibold bg-wn-surface ring-1 ring-wn-line-2 text-wn-text-2 hover:ring-wn-cyan hover:text-wn-text focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan motion-safe:transition disabled:opacity-50 disabled:cursor-wait"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              {submitting ? "Sending…" : "Let us know you want it"}
            </button>
            {error && (
              <p className="mt-2 text-[12px] text-red-400">
                Couldn't send — try again later.
              </p>
            )}
          </div>
        ) : (
          <div className="text-center">
            <p className="text-[13px] text-wn-text-2 font-semibold mb-1">
              Noted — thanks for flagging it.
            </p>
            <p className="text-[12px] text-wn-text-3 mb-3">
              We don't have a timeline, but every request shapes which
              destinations we curate next.
            </p>
            {showNoteField ? (
              <div className="flex flex-col gap-2 max-w-[340px] mx-auto">
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add context or suggest a different place (optional)"
                  className="w-full min-h-10 px-4 py-2 rounded-xl bg-wn-surface border border-wn-line text-wn-text text-[13px] placeholder:text-wn-text-3 focus:outline-none focus:ring-2 focus:ring-wn-cyan"
                />
                <div className="flex gap-2 justify-center">
                  <button
                    type="button"
                    disabled={!note.trim() || submitting}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleNoteSubmit}
                    className="min-h-9 px-4 rounded-xl text-[13px] font-semibold bg-wn-cyan/15 text-wn-cyan ring-1 ring-wn-cyan focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan disabled:opacity-40 disabled:cursor-not-allowed motion-safe:transition"
                  >
                    Send
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowNoteField(false)}
                    className="min-h-9 px-4 rounded-xl text-[13px] text-wn-text-3 hover:text-wn-text focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan motion-safe:transition"
                  >
                    Skip
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Browse panel ----

function BrowsePanel({ destinations, onSelect, onClose }) {
  const groups = groupByCountry(destinations);
  return (
    <div className="mt-2 rounded-xl bg-wn-surface-2 ring-1 ring-wn-line-2 overflow-hidden shadow-2xl max-h-[400px] overflow-y-auto">
      <div className="sticky top-0 bg-wn-surface-2 px-4 py-3 flex items-center justify-between border-b border-wn-line">
        <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-wn-cyan">
          All destinations ({destinations.length})
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClose}
          className="text-[12px] text-wn-text-3 hover:text-wn-text focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan rounded"
        >
          Close
        </button>
      </div>
      {groups.map(([country, dests]) => (
        <div key={country}>
          <p className="px-4 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-wn-text-3">
            {country}
          </p>
          {dests.map((d) => (
            <button
              key={d.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(d)}
              className="w-full text-left min-h-10 px-4 py-2 flex items-center justify-between gap-3 hover:bg-[rgba(63,216,224,0.12)] focus:bg-[rgba(63,216,224,0.12)] focus:outline-none"
            >
              <span className="text-wn-text text-[14px]">{d.name}</span>
              <TypeBadge dest={d} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---- Country group dropdown ----

function CountryGroup({ country, dests, onSelect, onCombine }) {
  return (
    <li className="px-0">
      <div className="px-4 pt-3 pb-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-wn-cyan">
          {country} — {dests.length} location{dests.length !== 1 ? "s" : ""} covered
        </p>
      </div>
      {dests.map((d) => (
        <button
          key={d.id}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(d)}
          className="w-full text-left min-h-11 px-6 py-2.5 flex items-center justify-between gap-3 hover:bg-[rgba(63,216,224,0.12)] focus:bg-[rgba(63,216,224,0.12)] focus:outline-none"
        >
          <span>
            <span className="text-wn-text text-[14px]">{d.name}</span>
          </span>
          <TypeBadge dest={d} />
        </button>
      ))}
      {onCombine && dests.length >= 2 && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onCombine(dests)}
          className="w-full text-left min-h-11 px-6 py-2.5 flex items-center gap-2.5 hover:bg-[rgba(63,216,224,0.12)] focus:bg-[rgba(63,216,224,0.12)] focus:outline-none border-t border-wn-line/50"
        >
          <Route className="w-3.5 h-3.5 text-wn-cyan shrink-0" aria-hidden="true" />
          <span className="text-wn-text-2 text-[13px]">
            Combine {dests.length} of these into one trip across{" "}
            <span className="font-semibold text-wn-text">{country}</span>
          </span>
        </button>
      )}
      <p className="px-4 pb-3 pt-1 text-[12px] text-wn-text-3 leading-snug border-t border-wn-line/50 mt-1">
        These are the locations WhereNova covers in {country}. A trip you build
        here will be based on one of them, not the whole country.
      </p>
    </li>
  );
}

// ---- Main component ----

export default function DestinationSearch({ destinations, loading, error, onSelect, onCombine }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [selected, setSelected] = useState(null);
  const [browseOpen, setBrowseOpen] = useState(false);

  const filtered = query.length >= 1
    ? destinations.filter((d) => matchesDest(d, query)).slice(0, 12)
    : [];

  const countryGroup = query.length >= 2 ? isCountryQuery(destinations, query) : null;
  const showDropdown = focused && query.length >= 1;
  const noMatch = showDropdown && filtered.length === 0;

  const pick = (dest) => {
    setSelected(dest);
    setQuery(dest.name + (dest.country ? `, ${dest.country}` : ""));
    setFocused(false);
    setBrowseOpen(false);
    onSelect(dest);
  };

  if (selected) {
    const badge = typeLabel(selected);
    return (
      <div className="mx-auto max-w-[520px] rounded-xl bg-wn-surface ring-1 ring-wn-cyan px-5 py-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-wn-text font-semibold text-[17px] leading-snug">{selected.name}</p>
          {selected.country && (
            <p className="text-wn-text-3 text-[13px] mt-0.5">{selected.country}</p>
          )}
          {badge && (
            <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide bg-wn-cyan/15 text-wn-cyan rounded-full px-2.5 py-1">
              {badge === "Region" && <MapPin className="w-3 h-3" aria-hidden="true" />}
              {badge}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => { setSelected(null); setQuery(""); }}
          className="shrink-0 mt-0.5 text-[13px] text-wn-text-3 hover:text-wn-text underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan rounded"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-[520px]">
      <input
        type="text"
        value={query}
        placeholder={loading ? "Loading…" : "Type a destination or country"}
        disabled={loading || error}
        autoComplete="off"
        autoFocus
        onChange={(e) => { setQuery(e.target.value); setBrowseOpen(false); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        className={cn(
          "w-full min-h-14 px-5 py-4 rounded-xl bg-wn-surface border border-wn-line text-wn-text text-[17px] text-center placeholder:text-wn-text-3 focus:outline-none focus:ring-2 focus:ring-wn-cyan",
          (loading || error) && "opacity-50 cursor-not-allowed"
        )}
      />

      {/* Browse affordance */}
      {!loading && !error && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setBrowseOpen((v) => !v); setFocused(false); }}
            className="inline-flex items-center gap-1.5 text-[13px] text-wn-text-3 hover:text-wn-text-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan rounded underline underline-offset-4 motion-safe:transition"
          >
            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            Browse what we cover
            {browseOpen
              ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            }
          </button>
        </div>
      )}

      {/* Browse panel (inline, not a modal) */}
      {browseOpen && !loading && (
        <BrowsePanel
          destinations={destinations}
          onSelect={pick}
          onClose={() => setBrowseOpen(false)}
        />
      )}

      {/* Search dropdown */}
      {showDropdown && !browseOpen && (
        <ul className="absolute z-20 mt-1.5 w-full rounded-xl bg-wn-surface-2 ring-1 ring-wn-line-2 overflow-hidden shadow-2xl">
          {filtered.length > 0 ? (
            countryGroup ? (
              <CountryGroup
                country={countryGroup.country}
                dests={countryGroup.dests}
                onSelect={pick}
                onCombine={onCombine}
              />
            ) : (
              filtered.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(d)}
                    className="w-full text-left min-h-12 px-4 py-3 flex items-center justify-between gap-3 hover:bg-[rgba(63,216,224,0.12)] focus:bg-[rgba(63,216,224,0.12)] focus:outline-none"
                  >
                    <span>
                      <span className="text-wn-text text-[15px]">{d.name}</span>
                      {d.country && (
                        <span className="ml-2 text-wn-text-3 text-[13px]">{d.country}</span>
                      )}
                    </span>
                    <TypeBadge dest={d} />
                  </button>
                </li>
              ))
            )
          ) : (
            <li>
              <MissState
                query={query}
                destinations={destinations}
                onSelect={pick}
              />
            </li>
          )}
        </ul>
      )}

      {error && (
        <p className="mt-3 text-[13px] text-wn-text-3 text-center">
          Couldn't load destinations — refresh the page and try again.
        </p>
      )}
    </div>
  );
}
