import { FileText, Calendar, ChefHat, Truck, RefreshCw } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/Reveal";
import { SectionHeader } from "./shared";

const WORKFLOW = [
  { icon: FileText, step: "Enquiry & Quote", description: "Capture every lead and build itemised, menu-based quotes in minutes. Send a branded quote your client can accept online." },
  { icon: Calendar, step: "Confirm & Deposit", description: "Clients accept via a secure magic-link portal and pay a deposit through PayFast. The function locks into your calendar automatically." },
  { icon: ChefHat, step: "Plan & Prep", description: "Auto-generate the BEO, kitchen prep lists, shopping lists and allergen sheets - with own stock and hire-in equipment reconciled." },
  { icon: Truck, step: "Deliver & Serve", description: "Drivers get optimised routes and live GPS tracking. Clients watch their order arrive while equipment is checked out and back in." },
  { icon: RefreshCw, step: "Invoice & Rebook", description: "Settle the balance with final guest-count adjustments, then trigger automated thank-yous and rebooking nurture for next season." },
];

export function ProcessSection() {
  return (
    <section className="bg-stone-100 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4">
        <SectionHeader
          title="From first enquiry to repeat booking"
          copy="Every function follows the same path. CateringMS runs each stage for you, so nothing slips between the quote and the invoice."
        />

        {/* A genuine ordered sequence (the numbers carry the order, which the
            reader needs). Solid ink icons, no gradient chips; the hairline
            top rule ties the five steps into one timeline. */}
        <Stagger className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-5" gap={0.06}>
          {WORKFLOW.map((stage, index) => (
            <StaggerItem key={index}>
              <div className="flex h-full flex-col border-t-2 border-amber-700/70 pt-5">
                <div className="mb-4 flex items-baseline justify-between">
                  <span className="font-display text-2xl font-medium tabular-nums text-amber-700">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <stage.icon className="h-5 w-5 text-stone-400" strokeWidth={1.75} />
                </div>
                <h3 className="mb-2 text-base font-semibold text-stone-900">{stage.step}</h3>
                <p className="text-sm leading-relaxed text-stone-600">{stage.description}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
