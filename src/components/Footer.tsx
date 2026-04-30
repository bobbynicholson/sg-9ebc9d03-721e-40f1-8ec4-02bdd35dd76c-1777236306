import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Mail,
  Phone,
  MapPin,
  Building2,
  Users,
  ArrowRight,
} from "lucide-react";
import { useBranding } from "@/contexts/BrandingContext";
import { useAuth } from "@/contexts/AuthContext";

export function Footer() {
  const currentYear = new Date().getFullYear();
  const { branding, isWhiteLabeled } = useBranding();
  // Auth state drives whether we show the "Sign in" CTA card. The
  // block doesn't help anyone who's already inside their portal --
  // it just adds noise to authenticated dashboards. Hidden when
  // signed in.
  const { user } = useAuth() as any;
  const isSignedIn = !!user;

  // Footer-below-the-fold: on signed-in dashboards the footer was
  // showing in the viewport on short pages (e.g. /admin/onboarding).
  // We dynamically measure how much vertical space the page would have
  // without the footer, and add a spacer above the footer so its top
  // edge sits at >=100vh from the page top. Long pages get spacer = 0
  // and look identical to before.
  const footerRef = useRef<HTMLElement | null>(null);
  const [spacerHeight, setSpacerHeight] = useState(0);

  useEffect(() => {
    if (!isSignedIn) return;

    const recompute = () => {
      const f = footerRef.current;
      if (!f) return;
      const rect = f.getBoundingClientRect();
      const winH = window.innerHeight;
      // Where is the footer's top edge in document coords today?
      const currentTop = rect.top + window.scrollY;
      // Desired position: at least 100vh from the document top so a
      // first-paint user has to scroll to see it.
      const targetTop = winH;
      // We can only push DOWN, never up -- if the footer is already
      // below the fold (long page), spacer = 0.
      const naturalTop = currentTop - spacerHeight;
      const needed = Math.max(0, Math.round(targetTop - naturalTop));
      setSpacerHeight((prev) => (Math.abs(prev - needed) < 2 ? prev : needed));
    };

    recompute();
    // Re-measure after async content settles. Keep the timeouts short
    // so the spacer doesn't visibly snap.
    const timers = [setTimeout(recompute, 80), setTimeout(recompute, 300), setTimeout(recompute, 1000)];
    window.addEventListener("resize", recompute);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", recompute);
    };
  // We deliberately exclude spacerHeight from deps -- recompute reads
  // the latest via state setter; including it would loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  const displayName = branding?.organizationName || "CateringMS";
  const displayLogo = branding?.logoUrl;

  const quickLinks = [
    { name: "About", href: "/about" },
    { name: "Features", href: "/features" },
    { name: "Pricing", href: "/pricing" },
    { name: "Security", href: "/security" },
    { name: "Blog", href: "/blog" },
    { name: "Contact", href: "/contact" },
    { name: "Support", href: "/support" }
  ];

  return (
    <>
      {/* Pushes the footer below the visible viewport on short signed-in
          pages. Sized to whatever leftover space the page has at first
          paint, so long pages stay tight and short ones don't surface
          the footer until the user actively scrolls. */}
      {isSignedIn && spacerHeight > 0 && (
        <div aria-hidden style={{ height: spacerHeight }} />
      )}
    <footer ref={footerRef} className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white mt-20">
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        {/*
          Sign-in CTA card. Only shown to UNAUTHENTICATED visitors --
          on every authenticated dashboard the team already has their
          own nav, so the old six-portal grid was just noise.
          Two clean entry points:
            1. Catering business -> /auth/login + /company-signup
            2. Event customer    -> log in via the link in their
                                    booking email (their company
                                    portal lives at /{slug}/client/login
                                    which they shouldn't have to type)
        */}
        {!isSignedIn && (
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-8 mb-12 border border-slate-600">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Catering company CTA */}
              <div className="bg-slate-900/50 border border-slate-600 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-purple-900/30 text-purple-300">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <h4 className="text-lg font-semibold text-white">Catering business</h4>
                </div>
                <p className="text-sm text-slate-300 mb-4">
                  Sign in to manage quotes, orders, kitchen prep, drivers and clients.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/auth/login">
                    <Button size="sm" className="bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90">
                      Sign in
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </Link>
                  <Link href="/company-signup">
                    <Button size="sm" variant="outline" className="border-slate-500 text-slate-200 hover:text-white hover:bg-slate-800">
                      Sign up free
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Event customer CTA */}
              <div className="bg-slate-900/50 border border-slate-600 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-blue-900/30 text-blue-300">
                    <Users className="w-5 h-5" />
                  </div>
                  <h4 className="text-lg font-semibold text-white">Booked an event?</h4>
                </div>
                <p className="text-sm text-slate-300 mb-4">
                  Open the "Track your event" link in your booking confirmation email, it takes you straight to your portal.
                </p>
                <p className="text-xs text-slate-400">
                  Lost the email? Reply to your last quote and the catering team will resend it.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="col-span-1 md:col-span-2">
            {displayLogo ? (
              <img
                src={displayLogo}
                alt={displayName}
                className="h-12 object-contain mb-4"
              />
            ) : (
              <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
                {displayName}
              </h3>
            )}
            <p className="text-slate-300 mb-6 max-w-md">
              {isWhiteLabeled
                ? `Complete catering management solution powered by advanced technology.`
                : `Complete solution for South African catering businesses. Automate your operations, increase profitability, and deliver exceptional service.`}
            </p>
            <div className="space-y-2 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>Cape Town, South Africa</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                <span>+27 (0) 21 123 4567</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span>support@cateringplatform.co.za</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-slate-200">Quick Links</h4>
            <ul className="space-y-2">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link href={link.href}>
                    <span className="text-slate-300 hover:text-white transition-colors text-sm">
                      {link.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-slate-200">Resources</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/blog">
                  <span className="text-slate-300 hover:text-white transition-colors text-sm">
                    Blog
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/help">
                  <span className="text-slate-300 hover:text-white transition-colors text-sm">
                    Help Center
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/documentation">
                  <span className="text-slate-300 hover:text-white transition-colors text-sm">
                    Documentation
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/tutorials">
                  <span className="text-slate-300 hover:text-white transition-colors text-sm">
                    Video Tutorials
                  </span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar with CateringMS Attribution */}
        <div className="border-t border-slate-700 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-slate-400 text-center md:text-left">
              <p>© {currentYear} {displayName}. All rights reserved.</p>
              {isWhiteLabeled && (
                <p className="mt-2">
                  <Link href="https://cateringms.com" target="_blank" rel="noopener noreferrer">
                    <span className="inline-flex items-center gap-2 text-slate-500 hover:text-white transition-colors">
                      <Sparkles className="w-4 h-4" />
                      <span>Powered by CateringMS - Catering Management & Process Solutions</span>
                    </span>
                  </Link>
                </p>
              )}
            </div>
            <div className="flex gap-6 text-sm text-slate-400">
              <Link href="/privacy">
                <span className="hover:text-white transition-colors">Privacy Policy</span>
              </Link>
              <Link href="/terms">
                <span className="hover:text-white transition-colors">Terms of Service</span>
              </Link>
              <Link href="/cookies">
                <span className="hover:text-white transition-colors">Cookie Policy</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
    </>
  );
}
