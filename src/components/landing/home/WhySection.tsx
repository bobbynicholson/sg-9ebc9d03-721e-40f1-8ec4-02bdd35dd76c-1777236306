import { Zap, Users, Clock, Sparkles, Leaf, Shield, Award, Heart } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { IMG, Photo, SectionHeader } from "./shared";

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
      <SectionHeader
        title="The difference is in the details"
        copy="The unseen work that makes your service look effortless - finally handled."
      />

      {/* Split: tall kitchen-at-work photography left, the four reasons as
          hairline-divided editorial rows right. The photo carries the
          "unseen work" story the copy tells. */}
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
        <Reveal className="lg:col-span-5">
          <Photo
            src={IMG.why}
            alt="A chef plating dishes in a busy catering kitchen"
            gradient="from-stone-300 via-amber-200 to-stone-400"
            className="h-full min-h-[320px] w-full rounded-3xl shadow-sm lg:min-h-[520px]"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-stone-900/55 via-transparent to-transparent" />
            <p className="absolute bottom-6 left-6 right-6 font-display text-2xl font-medium leading-snug text-white">
              The work your guests never see is the work that decides the event.
            </p>
          </Photo>
        </Reveal>

        <Stagger className="flex flex-col justify-center gap-9 lg:col-span-7">
          {REASONS.map((reason, index) => (
            <StaggerItem key={index}>
              <div className="flex gap-5 border-t border-stone-200 pt-6">
                <reason.icon className="mt-1 h-6 w-6 shrink-0 text-amber-700" strokeWidth={1.75} />
                <div>
                  <h3 className="text-lg font-semibold text-stone-900">{reason.title}</h3>
                  <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-stone-600">{reason.body}</p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>

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
