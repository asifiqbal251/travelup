import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { Menu, Trash2, LogIn, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { clearState } from "@/lib/storage";
import { useAccountIdentity, beginGoogleSignIn, useSignOut } from "@/lib/auth";

const NAV_HEIGHT = 68;

// "hero" = starts fully transparent over a full-bleed dark hero (TripHeader
// carries a [data-trip-hero] marker so we can measure it), then crosses over
// to the light frosted treatment once the hero scrolls past. "light" pages
// include PageNotFound's own bg-slate-50 -- 404 isn't listed in the spec but
// its page is light, so it gets the light nav rather than the dark default.
function navThemeFor(pathname) {
  if (pathname === "/trip" || /^\/saved-trips\/[^/]+$/.test(pathname)) return "hero";
  if (pathname === "/about") return "light";
  if (pathname === "/" || pathname === "/results" || pathname === "/saved-trips" || pathname === "/profile") return "dark";
  return "light";
}

function useScrolledPastHero(active) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    if (!active) {
      setPast(false);
      return;
    }
    const onScroll = () => {
      const hero = document.querySelector("[data-trip-hero]");
      const threshold = hero ? hero.offsetHeight - NAV_HEIGHT : 0;
      setPast(window.scrollY >= Math.max(0, threshold));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [active]);
  return past;
}

export default function TravelUpLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isSignedIn, email } = useAccountIdentity();
  const signOut = useSignOut();
  const [menuOpen, setMenuOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const logoRef = useRef(null);

  const theme = navThemeFor(pathname);
  const scrolledPastHero = useScrolledPastHero(theme === "hero");
  // Effective surface: "hero" resolves to transparent-over-dark-hero until
  // scrolled past, then behaves exactly like "light".
  const surface = theme === "hero" ? (scrolledPastHero ? "light" : "transparent") : theme;

  const openClear = () => setClearOpen(true);
  const openSignOut = () => setSignOutOpen(true);

  const confirmSignOut = () => {
    setSignOutOpen(false);
    setMenuOpen(false);
    signOut();
  };

  const confirmClear = () => {
    setClearOpen(false);
    setMenuOpen(false);
    clearState();
    navigate("/");
    // Force a full remount of the routed page below: navigating to "/" from
    // "/" itself doesn't remount Landing, so any state it read from
    // localStorage on mount (Travel Fit banner, saved-trip rails) would
    // otherwise keep showing stale data until a manual reload.
    setResetKey((k) => k + 1);
    setTimeout(() => logoRef.current?.focus(), 0);
  };

  const close = () => setMenuOpen(false);

  const headerStyle =
    surface === "transparent"
      ? { background: "transparent" }
      : surface === "light"
      ? {
          background: "rgba(246, 249, 252, .82)",
          backdropFilter: "saturate(160%) blur(18px)",
          WebkitBackdropFilter: "saturate(160%) blur(18px)",
          borderBottom: "1px solid rgb(var(--wn-line-l))"
        }
      : {
          background: "rgba(8, 20, 40, .72)",
          backdropFilter: "saturate(160%) blur(18px)",
          WebkitBackdropFilter: "saturate(160%) blur(18px)",
          borderBottom: "1px solid var(--wn-line)"
        };

  const linkCls =
    surface === "light"
      ? "text-wn-text-2-l hover:text-wn-text-l"
      : "text-wn-text-2 hover:text-wn-text";
  const iconTextCls = surface === "light" ? "text-wn-text-l" : "text-wn-text";
  const ringOffset =
    surface === "light"
      ? "focus-visible:ring-offset-2 focus-visible:ring-offset-wn-surface-l"
      : "focus-visible:ring-offset-2 focus-visible:ring-offset-wn-page";

  return (
    <div className="min-h-screen flex flex-col bg-workflow text-ink">
      <header
        className="z-40 sticky top-0 motion-safe:transition-[background-color,backdrop-filter,border-color] motion-safe:duration-300"
        style={{ height: NAV_HEIGHT, ...headerStyle }}
      >
        <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between">
          <Link
            ref={logoRef}
            to="/"
            aria-label="WhereNova home"
            className={`flex items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan ${ringOffset}`}
          >
            {/* wherenova-wordmark.png is white lettering, illegible on the
                "light"/"transparent" nav states -- only the true dark nav
                gets the real asset; see Logo.jsx's temporary-gap note. */}
            <Logo surface={surface === "dark" ? "dark" : "light"} size={34} />
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            <Button asChild variant="ghost" className={`hover:bg-transparent ${linkCls} focus-visible:!ring-wn-cyan ${ringOffset}`}>
              <Link to="/">Home</Link>
            </Button>
            <Button asChild variant="ghost" className={`hover:bg-transparent ${linkCls} focus-visible:!ring-wn-cyan ${ringOffset}`}>
              <Link to="/saved-trips">Saved trips</Link>
            </Button>
            <Button asChild variant="ghost" className={`hover:bg-transparent ${linkCls} focus-visible:!ring-wn-cyan ${ringOffset}`}>
              <Link to="/about">About</Link>
            </Button>
            {isSignedIn ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={`ml-2 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan ${ringOffset} ${linkCls}`}
                    aria-label="My profile"
                  >
                    <User className="w-3.5 h-3.5" /> My profile
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[220px]">
                  {email && (
                    <>
                      <DropdownMenuLabel className="font-normal text-xs text-muted-foreground truncate" title={email}>
                        Signed in as {email}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem asChild className="min-h-11 cursor-pointer">
                    <Link to="/profile">Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openSignOut} className="min-h-11 cursor-pointer">
                    <LogOut className="w-4 h-4 mr-2" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <button
                  type="button"
                  onClick={beginGoogleSignIn}
                  className={`ml-2 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan ${ringOffset} ${linkCls}`}
                  aria-label="Sign in"
                >
                  <LogIn className="w-3.5 h-3.5" /> Sign in
                </button>
                <button
                  type="button"
                  onClick={openClear}
                  className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan ${ringOffset} ${linkCls}`}
                  aria-label="Clear my data"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear my data
                </button>
              </>
            )}
          </nav>
          <button
            className={`sm:hidden p-2 min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-cyan rounded ${ringOffset} ${iconTextCls}`}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
        {menuOpen && (
          <div
            className="sm:hidden px-4 pb-4 pt-2 flex flex-col gap-1"
            style={
              surface === "light"
                ? { background: "rgb(246, 249, 252)", borderTop: "1px solid rgb(var(--wn-line-l))" }
                : { background: "rgb(8, 20, 40)", borderTop: "1px solid var(--wn-line)" }
            }
          >
            <Button asChild variant="ghost" className={`hover:bg-transparent justify-start min-h-11 ${linkCls} focus-visible:!ring-wn-cyan ${ringOffset}`} onClick={close}>
              <Link to="/">Home</Link>
            </Button>
            <Button asChild variant="ghost" className={`hover:bg-transparent justify-start min-h-11 ${linkCls} focus-visible:!ring-wn-cyan ${ringOffset}`} onClick={close}>
              <Link to="/saved-trips">Saved trips</Link>
            </Button>
            <Button asChild variant="ghost" className={`hover:bg-transparent justify-start min-h-11 ${linkCls} focus-visible:!ring-wn-cyan ${ringOffset}`} onClick={close}>
              <Link to="/about">About</Link>
            </Button>
            {isSignedIn ? (
              <>
                <Button asChild variant="ghost" className={`hover:bg-transparent justify-start min-h-11 ${linkCls} focus-visible:!ring-wn-cyan ${ringOffset}`} onClick={close}>
                  <Link to="/profile">
                    <User className="w-4 h-4 mr-2" /> My profile
                  </Link>
                </Button>
                <Button
                  onClick={() => { close(); openSignOut(); }}
                  variant="ghost"
                  className={`hover:bg-transparent justify-start min-h-11 ${linkCls} focus-visible:!ring-wn-cyan ${ringOffset}`}
                >
                  <LogOut className="w-4 h-4 mr-2" /> Sign out
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => { close(); beginGoogleSignIn(); }}
                  variant="ghost"
                  className={`hover:bg-transparent justify-start min-h-11 ${linkCls} focus-visible:!ring-wn-cyan ${ringOffset}`}
                >
                  <LogIn className="w-4 h-4 mr-2" /> Sign in
                </Button>
                <Button
                  onClick={() => { close(); openClear(); }}
                  variant="ghost"
                  className={`hover:bg-transparent justify-start min-h-11 ${linkCls} focus-visible:!ring-wn-cyan ${ringOffset}`}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Clear my data
                </Button>
              </>
            )}
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet key={resetKey} />
      </main>

      <footer className="bg-cinema text-on-dark/70">
        <div className="max-w-5xl mx-auto px-4 py-10 text-sm">
          <p className="mb-3 flex items-center gap-2">
            <Logo surface="dark" size={30} />
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

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll be signed out of your account on this device. Trips saved to your account
              become inaccessible until you sign back in, but nothing is deleted -- they'll be
              there when you return. Trips saved locally on this browser are not affected either
              way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSignOut}>Sign out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all local data?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes from this browser: your questionnaire answers, current destination
              selection, current and active-trip packing progress, every saved trip with its packing
              progress, and any trip still waiting on sign-up to save. This cannot be undone.
              {isSignedIn
                ? " Trips already saved to your account are not affected."
                : " You don't have an account yet, so nothing outside this browser is affected."}
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
