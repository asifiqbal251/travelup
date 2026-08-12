import { useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { Plane, Menu, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearState } from "@/lib/storage";

export default function TravelUpLayout() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleClear = () => {
    if (
      window.confirm(
        "This will delete your saved questionnaire, selected destination and packing-list progress from this browser. Continue?"
      )
    ) {
      clearState();
      navigate("/");
    }
  };

  const close = () => setMenuOpen(false);

  return (
    <div className="min-h-screen flex flex-col bg-[#FBFAF7] text-[#0B1F3A]">
      <header className="sticky top-0 z-40 bg-[#0B1F3A]/95 backdrop-blur text-white">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight text-lg">
            <Plane className="w-5 h-5 text-[#2EC4B6]" />
            <span>TravelUp</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            <Button asChild variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
              <Link to="/">Home</Link>
            </Button>
            <Button asChild variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
              <Link to="/about">About</Link>
            </Button>
            <Button
              onClick={handleClear}
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10 hover:text-white min-h-11"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Clear My Data
            </Button>
          </nav>
          <button
            className="sm:hidden p-2 min-h-11 min-w-11"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
        {menuOpen && (
          <div className="sm:hidden bg-[#0B1F3A] px-4 pb-4 flex flex-col gap-2 border-t border-white/10">
            <Button asChild variant="ghost" className="text-white hover:bg-white/10 justify-start min-h-11" onClick={close}>
              <Link to="/">Home</Link>
            </Button>
            <Button asChild variant="ghost" className="text-white hover:bg-white/10 justify-start min-h-11" onClick={close}>
              <Link to="/about">About</Link>
            </Button>
            <Button
              onClick={() => { close(); handleClear(); }}
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10 justify-start min-h-11"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Clear My Data
            </Button>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-[#0B1F3A] text-white/70 mt-12">
        <div className="max-w-5xl mx-auto px-4 py-10 text-sm">
          <p className="mb-1 font-semibold text-white flex items-center gap-2">
            <Plane className="w-4 h-4 text-[#2EC4B6]" /> TravelUp
          </p>
          <p className="mb-3">Helping unsure travellers discover where to go next.</p>
          <p className="text-xs max-w-2xl leading-relaxed">
            All budgets, climates, seasons, itineraries and packing suggestions are indicative estimates,
            not live information. Always verify visa requirements, entry conditions, safety and travel
            advisories using official government sources for your citizenship.
          </p>
          <div className="mt-5 flex gap-4">
            <Link to="/about" className="underline hover:text-white">About &amp; disclaimer</Link>
            <Link to="/" className="underline hover:text-white">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}