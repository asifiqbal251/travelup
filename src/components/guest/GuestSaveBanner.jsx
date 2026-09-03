import { useState } from "react";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isGuestSavePromptDismissed, dismissGuestSavePrompt } from "@/lib/storage";
import { useAccountIdentity, beginGoogleSignUp } from "@/lib/auth";

// Soft, dismissible offer shown after a guest's first successful trip save.
// Never blocks anything, never re-appears once dismissed (dismissal persists
// to localStorage), and is not shown at all once signed in.
export default function GuestSaveBanner({ className = "" }) {
  const { isSignedIn } = useAccountIdentity();
  const [dismissed, setDismissed] = useState(() => isGuestSavePromptDismissed());

  if (isSignedIn || dismissed) return null;

  const onDismiss = () => {
    dismissGuestSavePrompt();
    setDismissed(true);
  };

  return (
    <div
      role="status"
      className={`relative flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-2xl border border-wn-line-l bg-wn-surface-l px-4 py-4 pr-12 sm:pr-4 ${className}`}
    >
      <Sparkles className="w-5 h-5 text-wn-text-2-l flex-shrink-0" aria-hidden="true" />
      <p className="text-sm text-wn-text-2-l flex-1">
        Trip saved to this device. Create a free account to access it anywhere and save more.
      </p>
      <Button
        onClick={beginGoogleSignUp}
        className="wn-cta-coral min-h-10 sm:min-h-9 w-full sm:w-auto flex-shrink-0"
      >
        Create free account
      </Button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute top-2 right-2 sm:static grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-wn-text-2-l hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
