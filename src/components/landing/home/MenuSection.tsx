import Link from "next/link";
import { Star, ArrowRight } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { IMG, Photo, SectionHeader, warmCard } from "./shared";

const DISHES = [
  { name: "Seared Beef Fillet", tag: "Signature Mains", img: IMG.menu.beef, gradient: "from-rose-300 to-amber-300", popular: true },
  { name: "Truffle Arancini", tag: "Canapés", img: IMG.menu.arancini, gradient: "from-amber-200 to-yellow-300" },
  { name: "Pan-Seared Linefish", tag: "Mains", img: IMG.menu.linefish, gradient: "from-orange-300 to-amber-400" },
  { name: "Grazing Table", tag: "Sharing", img: IMG.menu.grazing, gradient: "from-stone-300 to-amber-200", popular: true },
  { name: "Malva Pudding", tag: "Desserts", img: IMG.menu.malva, gradient: "from-amber-300 to-orange-200" },
  { name: "Lamb Potjie", tag: "Mains", img: IMG.menu.potjie, gradient: "from-stone-400 to-amber-300" },
];

export function MenuSection() {
  return (
    <section id="menu" className="scroll-mt-24 bg-stone-100 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4">
        <SectionHeader
          title="Menus worth showing off"
          copy="Build, cost and send beautiful menus in minutes. Your clients see this - you keep the margins."
        />

        <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {DISHES.map((dish, index) => (
            <StaggerItem key={index}>
              <div className={warmCard}>
                <Photo src={dish.img} alt={dish.name} gradient={dish.gradient} className="aspect-[5/4] w-full" zoom>
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-900/70 via-stone-900/10 to-transparent" />
                  {dish.popular && (
                    <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white shadow-md">
                      <Star className="h-3 w-3 fill-white" /> Popular
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <p className="text-xs font-medium uppercase tracking-wider text-amber-200">{dish.tag}</p>
                    <h3 className="mt-0.5 font-display text-2xl font-semibold text-white">{dish.name}</h3>
                  </div>
                </Photo>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="mt-12 text-center">
          <Link href="/features/kitchen-management" className="group inline-flex items-center gap-2 font-medium text-amber-700 transition-colors duration-150 hover:text-amber-800">
            See how the menu &amp; costing builder works
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
