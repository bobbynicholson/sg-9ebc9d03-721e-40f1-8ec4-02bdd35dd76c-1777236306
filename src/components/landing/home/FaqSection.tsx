import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE } from "@/components/motion/marketing";

// Exported so the page <Head> builds its FAQPage JSON-LD from the same source
// of truth - the schema and the visible answers can never drift apart.
export const FAQS = [
  { question: "How long does setup take?", answer: "It depends on how much menu and booking information you add. Start with your company details, then add quotes and orders as you need them. You can also import bookings from PDFs or spreadsheets." },
  { question: "Do I need technical skills to use this?", answer: "Not at all. The platform is designed for caterers, not tech experts. If you can use WhatsApp, you can use our system. We've made everything intuitive and simple." },
  { question: "What if my team isn't tech-savvy?", answer: "Our mobile apps are incredibly simple. Drivers tap a button to start jobs, kitchen staff see clear prep lists, clients track orders visually. Everyone picks it up in minutes." },
  { question: "Can I scale to multiple locations?", answer: "Yes. Manage kitchens, teams and operations across regions, with head office and local teams working from the same booking information." },
  { question: "What payment methods do you support?", answer: "Connect the payment gateways available for your business and region, then track deposits, balances and invoices alongside each booking." },
  { question: "Is my data secure?", answer: "Bank-level encryption, daily backups, 99.9% uptime. Your business data is protected, secure, and always accessible when you need it." },
  { question: "Can I try it before committing?", answer: "Yes! Start with a free trial. No credit card required. Test everything, invite your team, run a real event. Only pay if you love it." },
  { question: "What kind of support do you provide?", answer: "Get help from our support team, with guides and documentation to help your team set up and use the platform." },
];

export function FaqSection() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-20 md:py-28">
      <Reveal className="mb-14">
        <span aria-hidden className="mb-5 block h-1 w-12 rounded-full bg-amber-500" />
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
