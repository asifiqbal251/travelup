import { useState } from "react";
import { AlertCircle, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { norm } from "@/lib/regionalRoutes";

const TYPE_LABEL = {
  region: "Region",
  multi_stop: "Multi-stop",
};

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

export default function DestinationSearch({ destinations, loading, error, onSelect }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [selected, setSelected] = useState(null);

  const filtered = query.length >= 1
    ? destinations.filter((d) => matchesDest(d, query)).slice(0, 8)
    : [];

  const showDropdown = focused && query.length >= 1;

  const pick = (dest) => {
    setSelected(dest);
    setQuery(dest.name + (dest.country ? `, ${dest.country}` : ""));
    setFocused(false);
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
        placeholder={loading ? "Loading…" : "Type a destination"}
        disabled={loading || error}
        autoComplete="off"
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        className={cn(
          "w-full min-h-14 px-5 py-4 rounded-xl bg-wn-surface border border-wn-line text-wn-text text-[17px] text-center placeholder:text-wn-text-3 focus:outline-none focus:ring-2 focus:ring-wn-cyan",
          (loading || error) && "opacity-50 cursor-not-allowed"
        )}
      />

      {showDropdown && (
        <ul className="absolute z-20 mt-1.5 w-full rounded-xl bg-wn-surface-2 ring-1 ring-wn-line-2 overflow-hidden shadow-2xl">
          {filtered.length > 0 ? (
            filtered.map((d) => {
              const badge = typeLabel(d);
              return (
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
                    {badge && (
                      <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide bg-wn-cyan/15 text-wn-cyan rounded-full px-2.5 py-0.5">
                        {badge}
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          ) : (
            <li>
              <div className="px-5 py-5 text-center">
                <AlertCircle className="w-5 h-5 text-wn-text-3 mx-auto mb-2" aria-hidden="true" />
                <p className="text-[14px] text-wn-text-2 font-semibold mb-1">
                  Not in our catalogue yet
                </p>
                <p className="text-[13px] text-wn-text-3 leading-snug">
                  We're adding new destinations regularly. Try a nearby destination,
                  or use the questionnaire to discover something you'll love.
                </p>
              </div>
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
