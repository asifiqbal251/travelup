import { useNavigate, Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { setSelectedDestinationId } from "@/lib/storage";
import { TRAVEL_FALLBACK_IMAGE } from "@/lib/fallbackImage";
import { bestMonthsSummary } from "@/lib/discoveryCollections";
import { MapPin, ArrowRight } from "lucide-react";

// One shared preview dialog. It receives the already-loaded destination
// record, so opening a card never re-fetches. Radix handles Escape, focus
// containment and restoring focus to the originating card on close.
export default function DestinationPreviewDialog({ dest, open, onOpenChange, returning }) {
  const navigate = useNavigate();
  if (!dest) return null;
  const d = dest;
  const tags = Array.from(
    new Set([...(d.primary_interests || []), ...(d.interest_tags || []), ...(d.climate_tags || [])])
  ).slice(0, 6);

  const viewTrip = () => {
    setSelectedDestinationId(d.id);
    onOpenChange(false);
    navigate("/trip");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[#0E2A4A] text-[#F5F2EA] border-white/15 max-h-[85vh] overflow-y-auto">
        <div className="relative w-full aspect-video overflow-hidden rounded-lg bg-[#0B1F3A]/40">
          <Image
            src={d.image_url}
            alt=""
            fittingType="fill"
            fallbackSrc={TRAVEL_FALLBACK_IMAGE}
            loading="lazy"
            className="w-full h-full"
          />
        </div>

        <DialogHeader>
          <DialogTitle className="text-[#F5F2EA] text-xl">{d.name}</DialogTitle>
          <DialogDescription className="text-[#F5F2EA]/70">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              {d.country}
              {d.region ? ` · ${d.region}` : ""}
            </span>
          </DialogDescription>
        </DialogHeader>

        {d.intro && <p className="text-sm text-[#F5F2EA]/85">{d.intro}</p>}

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#2EC4B6] mb-1.5">
            Top experiences
          </h3>
          <ul className="text-sm text-[#F5F2EA]/85 space-y-1">
            {(d.top_experiences || []).slice(0, 3).map((x, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[#2EC4B6]">•</span>
                <span>{x}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <div className="text-[10px] uppercase tracking-wide text-[#F5F2EA]/50 mb-1">
              Suggested length
            </div>
            <div className="font-medium text-[#F5F2EA]">{d.min_days}–{d.max_days} days</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <div className="text-[10px] uppercase tracking-wide text-[#F5F2EA]/50 mb-1">
              Best months
            </div>
            <div className="font-medium text-[#F5F2EA] text-xs leading-snug">
              {bestMonthsSummary(d)}
            </div>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="text-xs bg-white/10 text-[#F5F2EA]/85 px-2 py-1 rounded-full"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <DialogFooter className="sm:justify-start">
          {returning ? (
            <Button
              onClick={viewTrip}
              className="bg-[#FF6B5B] hover:bg-[#FF6B5B]/90 text-white min-h-11"
            >
              View my trip <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              asChild
              className="bg-[#FF6B5B] hover:bg-[#FF6B5B]/90 text-white min-h-11"
            >
              <Link to="/questionnaire">Find my Travel Fit</Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}