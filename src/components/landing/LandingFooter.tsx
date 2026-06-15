import Link from "next/link";
import { ChefHat, Phone, MapPin, ArrowRight, Facebook, Linkedin, Instagram } from "lucide-react";

const PHONE_DISPLAY = "+27 83 652 5755";
const PHONE_TEL = "+27836525755";

// Warm, premium footer for the marketing landing page only (the shared
// <Footer /> serves the rest of the site). Dark stone to bookend the page's
// dark sections and feel high-end.
const COLUMNS: { title: string; links: { name: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { name: "Features", href: "/features" },
      { name: "Pricing", href: "/pricing" },
      { name: "Book a demo", href: "/demo" },
      { name: "Security", href: "/security" },
    ],
  },
  {
    title: "Company",
    links: [
      { name: "Contact", href: "/contact" },
      { name: "Support", href: "/support" },
      { name: "Blog", href: "/blog" },
      { name: "Get started", href: "/company-signup" },
    ],
  },
  {
    title: "Legal",
    links: [
      { name: "Privacy", href: "/privacy" },
      { name: "Terms", href: "/terms" },
    ],
  },
];

export function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-stone-950 text-stone-300">
      <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand + contact */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500">
                <ChefHat className="h-5 w-5 text-white" />
              </span>
              <span className="font-display text-2xl font-semibold tracking-tight text-white">
                CateringMS
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-stone-400">
              The complete operating system for South African catering businesses -
              quote, plan, deliver and get paid, beautifully, from one platform.
            </p>
            <div className="mt-6 space-y-2 text-sm">
              <a href={`tel:${PHONE_TEL}`} className="inline-flex items-center gap-2 text-stone-300 transition-colors duration-150 hover:text-amber-400">
                <Phone className="h-4 w-4 text-amber-500" /> {PHONE_DISPLAY}
              </a>
              <p className="flex items-start gap-2 text-stone-400">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                17 Swalle Street, Golden Acre, South Africa
              </p>
            </div>
            <div className="mt-6 flex gap-3">
              {[
                { icon: Facebook, href: "https://www.facebook.com/cateringms", label: "Facebook" },
                { icon: Linkedin, href: "https://www.linkedin.com/company/cateringms", label: "LinkedIn" },
                { icon: Instagram, href: "https://www.instagram.com/cateringms", label: "Instagram" },
              ].map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-stone-300 transition-[background-color,color,border-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-amber-400/40 hover:bg-amber-500/10 hover:text-amber-400"
                >
                  <s.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="text-sm text-stone-400 transition-colors duration-150 hover:text-amber-400"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* CTA strip */}
        <div className="mt-14 flex flex-col items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:flex-row sm:items-center">
          <div>
            <p className="font-display text-xl font-semibold text-white">Ready to win your next booking?</p>
            <p className="mt-1 text-sm text-stone-400">Start free - no credit card, set up in under 3 hours.</p>
          </div>
          <Link
            href="/company-signup"
            className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-amber-500 to-amber-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-amber-700/20 transition-[transform,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:shadow-lg active:scale-[0.97]"
          >
            Get Your Free Quote
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-8 text-sm text-stone-500 sm:flex-row">
          <p>© {year} CateringMS · A product of Skylight Digital</p>
          <p>Made for South African caterers 🇿🇦</p>
        </div>
      </div>
    </footer>
  );
}
