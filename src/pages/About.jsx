import { ShieldCheck, Globe, Lock, Heart } from "lucide-react";

export default function About() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-semibold mb-4">About TravelUp</h1>
      <p className="text-[#0B1F3A]/80 mb-6 leading-relaxed">
        TravelUp helps people who want to travel but aren't sure where to go. Answer a short
        questionnaire and we'll suggest three destinations that match your season, budget, interests
        and pace — then outline a day-by-day itinerary and a packing checklist. It's an early MVP to
        validate the core experience, not a booking platform.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        {[
          { icon: Globe, title: "Curated, not random", text: "54 diverse destinations scored transparently out of 100 against your answers." },
          { icon: Lock, title: "Private by design", text: "Your questionnaire answers stay in your browser — nothing is sent to a server or an account." },
          { icon: Heart, title: "No sign-up", text: "No login, no bookings, no payments. Just a plan you can revise anytime." },
          { icon: ShieldCheck, title: "Indicative only", text: "All figures are estimates — please verify official requirements before you travel." }
        ].map((f) => (
          <div key={f.title} className="bg-white rounded-xl border border-[#E6E2D8] p-5">
            <f.icon className="w-6 h-6 text-[#2EC4B6] mb-3" />
            <h3 className="font-semibold mb-1">{f.title}</h3>
            <p className="text-sm text-[#0B1F3A]/70">{f.text}</p>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-semibold mb-3">Disclaimer</h2>
      <div className="bg-white rounded-xl border border-[#E6E2D8] p-5 space-y-4 text-sm text-[#0B1F3A]/80 leading-relaxed">
        <p>
          All budgets, climates, seasons, itineraries and packing suggestions shown in TravelUp are
          <span className="font-medium"> indicative estimates</span> based on curated data, not live
          information. Prices, weather and conditions change — treat everything here as a starting
          point, not a guarantee.
        </p>
        <p>
          TravelUp does <span className="font-medium">not</span> provide definitive visa, entry,
          safety or travel advice. Always verify visa requirements, entry conditions, health rules,
          safety and travel advisories using <span className="font-medium">official government
          sources</span> for your citizenship and destination before booking or travelling.
        </p>
        <p>
          TravelUp is an early MVP. It does not book flights or accommodation, show live prices,
          process payments, provide maps or route optimization, offer reviews, or create user
          accounts.
        </p>
      </div>
    </div>
  );
}