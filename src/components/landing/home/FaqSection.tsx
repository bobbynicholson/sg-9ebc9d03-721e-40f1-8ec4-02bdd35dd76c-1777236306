import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE } from "@/components/motion/marketing";

// Exported so the page <Head> builds its FAQPage JSON-LD from the same source
// of truth - the schema and the visible answers can never drift apart.
export const FAQS = [
  { question: "How long does it take to set up?", answer: "Most businesses are fully operational within 2-3 hours. We provide guided onboarding, video tutorials, and dedicated support to get you started quickly." },
  { question: "Do I need technical skills to use this?", answer: "Not at all. The platform is designed for caterers, not tech experts. If you can use WhatsApp, you can use our system. We've made everything intuitive and simple." },
  { question: "What if my team isn't tech-savvy?", answer: "Our mobile apps are incredibly simple. Drivers tap a button to start jobs, kitchen staff see clear prep lists, clients track orders visually. Everyone picks it up in minutes." },
  { question: "Can I scale to multiple locations?", answer: "Absolutely. Our multi-region feature lets you launch new kitchens, teams, and operations across South Africa with one-click setup. Head office manages sales, regions handle fulfillment." },
  { question: "What payment methods do you support?", answer: "We integrate with PayFast, Stripe, Paystack, and Flutterwave. Accept card payments, EFTs, and instant payments. All reconciled automatically." },
  { question: "Is my data secure?", answer: "Bank-level encryption, daily backups, 99.9% uptime. Your business data is protected, secure, and always accessible when you need it." },
  { question: "Can I try it before committing?", answer: "Yes! Start with a free trial. No credit card required. Test everything, invite your team, run a real event. Only pay if you love it." },
  { question: "What kind of support do you provide?", answer: "Email support, video tutorials, detailed documentation, and a growing community of South African caterers. We're invested in your success." },
];

export function FaqSection() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-20 md:py-28">
      <Reveal className="mb-14 text-center">
        <h2 className="text-balance font-display text-3xl font-medium tracking-tight text-stone-900 md:text-5xl">
          Everything you need to know
        </h2>
        <p className="mt-4 text-base text-stone-600">
          More questions? Explore the{" "}
          <Link href="/features" className="font-medium text-amber-700 underline-offset-2 hover:underline">feature overview</Link>{" "}
          or <Link href="/contact" className="font-medium text-amber-700 underline-offset-2 hover:underline">talk to our team</Link>.
        </p>
      </Reveal>

      {/* Native <details> accordion: keyboard-accessible for free, no JS
          state, and the closed-by-default list keeps the page scannable. */}
      <Stagger className="space-y-4" gap={0.05}>
        {FAQS.map((faq, index) => (
          <StaggerItem key={index}>
            <details
              className={`group rounded-2xl border border-stone-200 bg-white transition-[border-color,box-shadow] duration-300 ${EASE} open:border-amber-200 open:shadow-sm hover:border-amber-200`}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-6 text-lg font-semibold text-stone-900 [&::-webkit-details-marker]:hidden">
                {faq.question}
                <ChevronDown className="h-5 w-5 shrink-0 text-amber-600 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="px-6 pb-6 leading-relaxed text-stone-600">{faq.answer}</p>
            </details>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
