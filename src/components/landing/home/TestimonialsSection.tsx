import { Star, Quote, MapPin } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { IMG, Photo } from "./shared";

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
        <Reveal className="mb-14 text-center">
          <h2 className="text-balance font-display text-3xl font-medium tracking-tight text-white md:text-5xl">
            Real results from real businesses
          </h2>
          <p className="mt-4 text-lg text-stone-300">
            South African catering teams running calmer, more profitable operations.
          </p>
        </Reveal>

        <Stagger className="grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((testimonial, index) => (
            <StaggerItem key={index}>
              <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-stone-900 p-7">
                <div className="mb-4 flex gap-1">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <Quote className="mb-4 h-8 w-8 text-amber-400/40" />
                <p className="mb-6 flex-1 leading-relaxed text-stone-200">&ldquo;{testimonial.quote}&rdquo;</p>
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
          ))}
        </Stagger>
      </div>
    </section>
  );
}
