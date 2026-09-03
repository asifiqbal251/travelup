import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogCancel
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Laptop2, ShieldCheck, FolderHeart } from "lucide-react";
import { beginGoogleSignUp, beginEmailSignUp } from "@/lib/auth";

const BENEFITS = [
  { icon: FolderHeart, text: "Save more than one trip" },
  { icon: Laptop2, text: "Access your trips from any device" },
  { icon: ShieldCheck, text: "Permanent backup, protected from local storage clearing" }
];

// Hard prompt: shown when a guest (no account) tries to save a trip beyond
// their one free local trip. This blocks the save because the action
// genuinely requires an account — but it never discards the trip the user
// was trying to save; that snapshot is already persisted as the "pending"
// trip in storage.js before this opens, and stays there whether the user
// signs up, dismisses, or closes the browser entirely.
//
// max-h-[90dvh] + overflow-y-auto keep this escapable and scrollable on
// short mobile viewports (see docs/wherenova-guest-flow-brief.md's mobile
// requirements) rather than clipping content off-screen.
export default function GuestUpgradeModal({ open, onOpenChange }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Create a free account to save more trips</AlertDialogTitle>
          <AlertDialogDescription>
            You've already saved one trip on this device. A free account is needed to save
            additional trips.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="flex flex-col gap-2.5 py-1">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm text-foreground">
              <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">
          Don't worry — the trip you just tried to save isn't lost. It'll save automatically the
          moment you finish creating your account.
        </p>

        <AlertDialogFooter className="flex-col sm:flex-col items-stretch space-x-0 sm:space-x-0 gap-2">
          <Button onClick={beginGoogleSignUp} className="wn-cta-coral min-h-11 w-full">
            Continue with Google
          </Button>
          <Button onClick={beginEmailSignUp} variant="outline" className="min-h-11 w-full">
            Use email instead
          </Button>
          <AlertDialogCancel className="w-full mt-0">Not now</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
