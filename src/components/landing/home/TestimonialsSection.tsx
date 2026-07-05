import { Star, Quote, MapPin } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/Reveal";
import { IMG, Photo, SectionHeader } from "./shared";

const TESTIMONIALS = [
  {
    quote: "We went from barely breaking even to 18% profit margins. The automation alone saved us enough to hire two full-time staff members.",
    author: "Sarah Johnson",
    role: "Owner, Cape Town Catering Co.",
    event: "Weddings & functions",
    img: IMG.people.sarah,
    rating: 5,
  },
  {
    quote: "Finally, I can take a vacation. The system runs everything. My team knows exactly what to do without calling me every hour.",
    author: "Michael Peters",
    role: "Director, Durban Events & Catering",
    event: "Corporate catering",
    img: IMG.people.michael,
    rating: 5,
  },
  {
    quote: "The GPS tracking feature alone improved our customer satisfaction significantly. Clients love seeing their food on the way in real-time.",
    author: "Linda Ndlovu",
    role: "Founder, Johannesburg Function Foods",
    event: "Private & special events",
    img: IMG.people.linda,
    rating: 5,
  },
];

export function TestimonialsSection() {
  return (
    <section id="reviews" className="scroll-mt-24 bg-stone-950 py-20 text-white md:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeader
          dark
          title="Real results from real businesses"
          copy="South African catering teams running calmer, more profitable operations."
        />

        {/* Featured layout: the lead quote carries the section at display
            size; the other two stack beside it. */}
        <Stagger className="grid gap-6 md:grid-cols-2">
          {TESTIMONIALS.map((testimonial, index) => {
            const featured = index === 0;
            return (
              <StaggerItem key={index} className={featured ? "md:row-span-2" : ""}>
                <div className={`flex h-full flex-col rounded-2xl border border-white/10 bg-stone-900 ${featured ? "p-8 md:p-10" : "p-7"}`}>
                  <div className="mb-4 flex gap-1">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <Quote className={`mb-4 text-amber-400/40 ${featured ? "h-10 w-10" : "h-8 w-8"}`} />
                  <p
                    className={
                      featured
                        ? "mb-6 flex-1 text-balance font-display text-2xl font-medium leading-snug text-white md:text-3xl"
                        : "mb-6 flex-1 leading-relaxed text-stone-200"
                    }
                  >
                    &ldquo;{testimonial.quote}&rdquo;
                  </p>
                  <div className="flex items-center gap-3 border-t border-white/10 pt-5">
                    <Photo
                      src={testimonial.img}
                      alt={testimonial.author}
                      gradient="from-amber-300 to-orange-400"
                      className="h-12 w-12 shrink-0 rounded-full"
                    />
                    <div>
                      <p className="font-semibold text-white">{testimonial.author}</p>
                      <p className="text-sm text-stone-400">{testimonial.role}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-300">
                        <MapPin className="h-3 w-3" /> {testimonial.event}
                      </p>
                    </div>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}
