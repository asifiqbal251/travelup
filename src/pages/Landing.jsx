import { Link } from "react-router-dom";
import { Compass, MapPinned, ClipboardList, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { HERO_IMAGE_URL } from "@/lib/heroImage";

export default function Landing() {
  return (
    <div>
      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-0">
          {HERO_IMAGE_URL ? (
            <Image
              src={HERO_IMAGE_URL}
              alt="A traveller overlooking a breathtaking coastline at golden hour"
              fittingType="fill"
              className="w-full h-full"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#0B1F3A] via-[#0E2A4A] to-[#2EC4B6]" />
          )}
          <div className="absolute inset-0 bg-[#0B1F3A]/55" />
        </div>
        <div className="relative max-w-5xl mx-auto px-4 py-24 sm:py-32 text-white">
          <p className="inline-flex items-center gap-2 text-[#2EC4B6] text-sm font-medium mb-4">
            <Sparkles className="w-4 h-4" /> Not sure where to go?
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight max-w-2xl">
            Find the trip that fits you — in five minutes.
          </h1>
          <p className="mt-5 text-lg text-white/85 max-w-xl">
            Answer a few friendly questions and TravelUp will suggest three destinations that match your
            season, budget, interests and pace — with a day-by-day plan and packing list.
          </p>
          <div className="mt-8">
            <Button asChild size="lg" className="bg-[#FF6B5B] hover:bg-[#FF6B5B]/90 text-white min-h-12 px-8 text-base">
              <Link to="/questionnaire">Find My Trip</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-4 py-14">
        <h2 className="text-2xl font-semibold mb-8 text-center">How TravelUp works</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { icon: Compass, title: "Answer a short questionnaire", text: "Tell us your month, budget, interests, pace and more in a quick guided flow." },
            { icon: MapPinned, title: "Get three matched destinations", text: "We score 54 curated trips out of 100 and show exactly why each one fits you." },
            { icon: ClipboardList, title: "Receive a plan & packing list", text: "Pick a destination to get a day-by-day itinerary and a checkable packing checklist." }
          ].map((s) => (
            <div key={s.title} className="bg-white rounded-2xl p-6 border border-[#E6E2D8] shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-[#0B1F3A] text-[#2EC4B6] flex items-center justify-center mb-4">
                <s.icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold mb-2">{s.title}</h3>
              <p className="text-sm text-[#0B1F3A]/70">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-[#0B1F3A] text-white">
        <div className="max-w-5xl mx-auto px-4 py-14 text-center">
          <h2 className="text-2xl font-semibold mb-3">Your next trip is a few questions away.</h2>
          <p className="text-white/75 mb-6 max-w-xl mx-auto">
            No sign-up, no bookings, no data leaves your browser. Just inspiration and a plan.
          </p>
          <Button asChild size="lg" className="bg-[#FF6B5B] hover:bg-[#FF6B5B]/90 text-white min-h-12 px-8">
            <Link to="/questionnaire">Start the questionnaire</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}