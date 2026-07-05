import { Zap, Users, Clock, Sparkles, Leaf, Shield, Award, Heart } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";

const REASONS = [
  {
    icon: Zap,
    title: "Quote in minutes, not days",
    body: "Itemised, branded quotes your clients can accept online - so you win the booking while you're still top of mind.",
  },
  {
    icon: Users,
    title: "Your whole team, in sync",
    body: "Kitchen, drivers, shopping and cleaning all work from one live plan. No more forty coordination calls a day.",
  },
  {
    icon: Clock,
    title: "On-time, every single event",
    body: "Live GPS, prep schedules and delivery sheets keep every function running to the minute - and clients in the loop.",
  },
  {
    icon: Sparkles,
    title: "Custom menus & branded portals",
    body: "Tailor menus per client and hand them a portal that carries your brand, your colours, your logo - not ours.",
  },
];

const TRUST_CHIPS = [
  { icon: Leaf, text: "Built for fresh, fast service" },
  { icon: Shield, text: "Bank-level security" },
  { icon: Award, text: "99.9% uptime" },
  { icon: Heart, text: "Founded by caterers" },
];

export function WhySection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 md:py-28">
      <Reveal className="mx-auto mb-14 max-w-3xl text-center">
        <h2 className="text-balance font-display text-3xl font-medium tracking-tight text-stone-900 md:text-5xl">
          The difference is in the details
        </h2>
        <p className="mt-4 text-balance text-lg text-stone-600">
          The unseen work that makes your service look effortless - finally handled.
        </p>
      </Reveal>

      {/* Hairline-divided editorial pairs, not cloned tiles: a solid ink
          icon leads each reason; hierarchy comes from the heading weight. */}
      <Stagger className="mx-auto grid max-w-5xl gap-x-12 gap-y-10 sm:grid-cols-2">
        {REASONS.map((reason, index) => (
          <StaggerItem key={index}>
            <div className="flex gap-4 border-t border-stone-200 pt-6">
              <reason.icon className="mt-1 h-6 w-6 shrink-0 text-amber-700" strokeWidth={1.75} />
              <div>
                <h3 className="text-lg font-semibold text-stone-900">{reason.title}</h3>
                <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-stone-600">{reason.body}</p>
              </div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      <Stagger className="mt-14 flex flex-wrap justify-center gap-3" gap={0.05}>
        {TRUST_CHIPS.map((t, index) => (
          <StaggerItem key={index}>
            <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 shadow-sm">
              <t.icon className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-stone-700">{t.text}</span>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
