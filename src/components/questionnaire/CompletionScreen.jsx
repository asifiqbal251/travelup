import { ArrowRight } from "lucide-react";
import { completionHeadline } from "@/lib/questionnaireFlow";

const HEADLINE_STYLE = { fontSize: "clamp(30px, 4.6vw, 50px)" };

// Replaces the old cinematic reveal. Content sits in the optical centre — no
// empty band above — with a single CTA into /results.
export default function CompletionScreen({ answers, onContinue }) {
  return (
    <div className="text-center step-enter max-w-[640px] mx-auto">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-wn-cyan mb-4">
        Your Travel Fit is ready
      </p>
      <h1
        className="font-display font-extrabold tracking-[-0.03em] leading-[1.08] text-wn-text"
        style={HEADLINE_STYLE}
      >
        {completionHeadline(answers)}
      </h1>
      <div className="mt-10">
        <button
          type="button"
          onClick={onContinue}
          className="wn-cta-dark inline-flex items-center gap-2 h-12 px-8 rounded-xl text-[15px] font-semibold focus:outline-none focus:ring-2 focus:ring-wn-cyan focus:ring-offset-2 focus:ring-offset-wn-page motion-safe:transition"
        >
          Show me where <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}