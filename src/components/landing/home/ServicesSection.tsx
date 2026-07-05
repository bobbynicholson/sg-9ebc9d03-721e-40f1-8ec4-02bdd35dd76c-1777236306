import { Heart, Building2, PartyPopper, Crown } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { IMG, Photo, warmCard, chip } from "./shared";

const SERVICES = [
  {
    icon: Heart,
    title: "Weddings",
    img: IMG.services.weddings,
    gradient: "from-rose-200 to-amber-200",
    body: "From the proposal to the last dance - itemised quotes, dietary tracking, minute-perfect kitchen timing and on-the-day coordination.",
  },
  {
    icon: Building2,
    title: "Corporate Events",
    img: IMG.services.corporate,
    gradient: "from-amber-200 to-stone-300",
    body: "Recurring orders, PO-friendly invoicing, multi-site delivery and last-minute headcount changes - handled without the email chaos.",
  },
  {
    icon: PartyPopper,
    title: "Private Parties",
    img: IMG.services.private,
    gradient: "from-orange-200 to-rose-200",
    body: "Fast quotes, deposit links and a branded client portal that makes booking a birthday or celebration feel effortless.",
  },
  {
    icon: Crown,
    title: "Galas & Special Events",
    img: IMG.services.gala,
    gradient: "from-amber-300 to-yellow-200",
    body: "Large-scale logistics: hire-in equipment, staffing rosters, allergen sheets and live tracking for your flagship functions.",
  },
];

export function ServicesSection() {
  return (
    <section id="services" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 md:py-28">
      <Reveal className="mx-auto mb-14 max-w-3xl text-center">
        <h2 className="text-balance font-display text-3xl font-medium tracking-tight text-stone-900 md:text-5xl">
          Built for the way you actually cater
        </h2>
        <p className="mt-4 text-balance text-lg text-stone-600">
          Whatever you're plating up this weekend, CateringMS runs the operation behind it.
        </p>
      </Reveal>

      <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {SERVICES.map((service, index) => (
          <StaggerItem key={index}>
            <div className={`${warmCard} flex flex-col`}>
              <Photo src={service.img} alt={`${service.title} catering`} gradient={service.gradient} className="aspect-[4/3] w-full" zoom>
                <div className="absolute inset-0 bg-gradient-to-t from-stone-900/50 to-transparent" />
                <div className={`${chip} absolute left-4 top-4 h-11 w-11 bg-white`}>
                  <service.icon className="h-5 w-5 text-amber-700" />
                </div>
              </Photo>
              <div className="flex flex-1 flex-col p-6">
                <h3 className="mb-2 text-xl font-semibold text-stone-900">{service.title}</h3>
                <p className="text-sm leading-relaxed text-stone-600">{service.body}</p>
              </div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
