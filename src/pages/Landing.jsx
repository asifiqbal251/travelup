import { Link } from "react-router-dom";
import { Compass, MapPinned, Bookmark, LifeBuoy, Gauge, UserX, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import LandingHeroSlideshow from "@/components/LandingHeroSlideshow";

const STEPS = [
  {
    icon: Compass,
    title: "Discover",
    text: "Answer a short questionnaire and get the best practical matches from 54 curated destinations."
  },
  {
    icon: MapPinned,
    title: "Plan",
    text: "Compare Travel Fit, then open a practical day-by-day itinerary and packing list."
  },
  {
    icon: Bookmark,
    title: "Save",
    text: "Store multiple itinerary snapshots locally and reopen them from Saved Trips."
  },
  {
    icon: LifeBuoy,
    title: "Travel Companion",
    text: "Practical on-the-ground support after you arrive.",
    coming: true
  }
];

const TRUST = [
  { icon: MapPinned, label: "54 curated destinations" },
  { icon: Gauge, label: "Practicality-aware matching" },
  { icon: UserX, label: "No account required" }
];

export default function Landing() {
  return (
    <div>
      <LandingHeroSlideshow />

      {/* The TravelUp journey */}
      <section className="max-w-5xl mx-auto px-4 py-14">
        <h2 className="text-2xl font-semibold mb-2 text-center">The TravelUp journey</h2>
        <p className="text-sm text-[#0B1F3A]/65 text-center mb-8 max-w-xl mx-auto">
          From a few quick answers to a practical, saveable plan — all on this browser.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((s) => (
            <div
              key={s.title}
              className="bg-white rounded-2xl p-6 border border-[#E6E2D8] shadow-sm"
            >
              <div className="w-11 h-11 rounded-xl bg-[#0B1F3A] text-[#2EC4B6] flex items-center justify-center mb-4">
                <s.icon className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold">{s.title}</h3>
                {s.coming && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-[#E8A33D]/15 text-[#9a6e1a] px-2 py-0.5 rounded-full">
                    Coming later
                  </span>
                )}
              </div>
              <p className="text-sm text-[#0B1F3A]/70">{s.text}</p>
            </div>
          ))}
        </div>

        {/* Value / trust row */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {TRUST.map((t) => (
            <div
              key={t.label}
              className="inline-flex items-center gap-2 text-sm text-[#0B1F3A]/75"
            >
              <t.icon className="w-4 h-4 text-[#2EC4B6]" aria-hidden="true" /> {t.label}
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-[#0B1F3A] text-white">
        <div className="max-w-5xl mx-auto px-4 py-14 text-center">
          <h2 className="text-2xl font-semibold mb-3">Ready to find your Travel Fit?</h2>
          <p className="text-white/75 mb-6 max-w-xl mx-auto">
            No account required — your answers and saved trips stay on this browser and device.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-[#FF6B5B] hover:bg-[#FF6B5B]/90 text-white min-h-12 px-8"
          >
            <Link to="/questionnaire">
              Find my Travel Fit <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}