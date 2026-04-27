import { ReactNode } from "react";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Sparkles } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Footer } from "@/components/Footer";

interface PortalPagePlaceholderProps {
  /** Sidebar nav component for this portal (KitchenNav, ShoppingNav, etc) */
  Nav: React.ComponentType;
  /** Title shown in <head> */
  title: string;
  /** Heading icon */
  icon: React.ComponentType<{ className?: string }>;
  /** Heading shown on the page */
  heading: string;
  /** Subheading describing the feature */
  subheading: string;
  /** Tailwind gradient class for the icon block, e.g. "from-orange-500 to-red-500" */
  accent: string;
  /** Bullet list of what's coming for this feature */
  capabilities: string[];
  /** Optional extra content (charts, demo cards, etc) */
  children?: ReactNode;
}

/**
 * Reusable placeholder for portal sub-pages we haven't fully built yet.
 * Renders the portal sidebar so the user knows they're in the right place,
 * a clear "in beta" message so it doesn't feel broken, and a list of what's
 * coming so the screen still earns its place in a demo.
 */
export function PortalPagePlaceholder({
  Nav,
  title,
  icon: Icon,
  heading,
  subheading,
  accent,
  capabilities,
  children,
}: PortalPagePlaceholderProps) {
  return (
    <>
      <NoIndexMeta />
      <Head><title>{title}</title></Head>
      <Nav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-64 xl:pl-72 pt-16 lg:pt-0">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="mb-8 flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center shadow-lg`}
            >
              <Icon className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">{heading}</h1>
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
                  <Sparkles className="w-3 h-3" />
                  Coming soon
                </Badge>
              </div>
              <p className="text-slate-600 mt-1">{subheading}</p>
            </div>
          </div>

          {children}

          <Card className="border-0 shadow-lg mt-6">
            <CardHeader>
              <CardTitle>What's shipping in this view</CardTitle>
              <CardDescription>
                The data layer is wired -- we're polishing the UI before it goes live.
                Expect this page in the next round of updates.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {capabilities.map((c) => (
                  <li key={c} className="flex items-start gap-3 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    </>
  );
}
