import { useState, useRef } from "react";
import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { Menu, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import WherenovaLogo from "@/components/WherenovaLogo";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel
} from "@/components/ui/alert-dialog";
import { clearState } from "@/lib/storage";

export default function TravelUpLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onLanding = pathname === "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const logoRef = useRef(null);

  const openClear = () => setClearOpen(true);

  const confirmClear = () => {
    setClearOpen(false);
    setMenuOpen(false);
    clearState();
    navigate("/");
    setTimeout(() => logoRef.current?.focus(), 0);
  };

  const close = () => setMenuOpen(false);

  return (
    <div className="min-h-screen flex flex-col bg-workflow text-ink">
      <header className={`z-40 ${onLanding ? "absolute top-0 left-0 right-0 bg-transparent" : "glass sticky top-0"}`}>
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            ref={logoRef}
            to="/"
            aria-label="WhereNova home"
            className="flex items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-on-dark"
          >
            <WherenovaLogo onDark widthClass="w-[38px] sm:w-[42px]" wordmarkClass="h-[22px] sm:h-[24px]" />
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            <Button asChild variant="ghost" className="text-on-dark hover:bg-white/10 hover:text-on-dark focus-visible:!ring-on-dark focus-visible:ring-offset-cinema">
              <Link to="/">Home</Link>
            </Button>
            <Button asChild variant="ghost" className="text-on-dark hover:bg-white/10 hover:text-on-dark focus-visible:!ring-on-dark focus-visible:ring-offset-cinema">
              <Link to="/saved-trips">Saved trips</Link>
            </Button>
            <Button asChild variant="ghost" className="text-on-dark hover:bg-white/10 hover:text-on-dark focus-visible:!ring-on-dark focus-visible:ring-offset-cinema">
              <Link to="/about">About</Link>
            </Button>
            <button
              type="button"
              onClick={openClear}
              className="ml-2 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium text-on-dark/70 hover:text-on-dark hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark"
              aria-label="Clear my data"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear my data
            </button>
          </nav>
          <button
            className="sm:hidden p-2 min-h-11 min-w-11 text-on-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark rounded"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
        {menuOpen && (
          <div className="sm:hidden glass border-t border-white/10 px-4 pb-4 pt-2 flex flex-col gap-1">
            <Button asChild variant="ghost" className="text-on-dark hover:bg-white/10 justify-start min-h-11 focus-visible:!ring-on-dark focus-visible:ring-offset-cinema" onClick={close}>
              <Link to="/">Home</Link>
            </Button>
            <Button asChild variant="ghost" className="text-on-dark hover:bg-white/10 justify-start min-h-11 focus-visible:!ring-on-dark focus-visible:ring-offset-cinema" onClick={close}>
              <Link to="/saved-trips">Saved trips</Link>
            </Button>
            <Button asChild variant="ghost" className="text-on-dark hover:bg-white/10 justify-start min-h-11 focus-visible:!ring-on-dark focus-visible:ring-offset-cinema" onClick={close}>
              <Link to="/about">About</Link>
            </Button>
            <Button
              onClick={() => { close(); openClear(); }}
              variant="ghost"
              className="text-on-dark/70 hover:text-on-dark hover:bg-white/10 justify-start min-h-11 focus-visible:!ring-on-dark focus-visible:ring-offset-cinema"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Clear my data
            </Button>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-cinema text-on-dark/70">
        <div className="max-w-5xl mx-auto px-4 py-10 text-sm">
          <p className="mb-3 flex items-center gap-2">
            <WherenovaLogo onDark widthClass="w-[34px]" wordmarkClass="h-[18px]" />
          </p>
          <p className="mb-3">Helping unsure travellers discover where to go next.</p>
          <p className="text-xs max-w-2xl leading-relaxed">
            All budgets, climates, seasons, itineraries and packing suggestions are indicative estimates,
            not live information. Always verify visa requirements, entry conditions, safety and travel
            advisories using official government sources for your citizenship.
          </p>
          <div className="mt-5 flex flex-wrap gap-4">
            <Link to="/about" className="underline hover:text-on-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark rounded">About &amp; disclaimer</Link>
            <Link to="/saved-trips" className="underline hover:text-on-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark rounded">Saved trips</Link>
            <Link to="/" className="underline hover:text-on-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark rounded">Home</Link>
          </div>
        </div>
      </footer>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all local data?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes from this browser: your questionnaire answers, current destination
              selection, current and active-trip packing progress, and every saved trip with its packing
              progress. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClear}>Delete all local data</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}