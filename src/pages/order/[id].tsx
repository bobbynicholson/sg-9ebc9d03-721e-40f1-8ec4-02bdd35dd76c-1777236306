/**
 * ODOC: unified order document page. Phase 1 surface, parallel
 * with the existing per-role detail pages.
 *
 * URL shape:
 *   /order/<orderId>             - interactive (logged-in staff)
 *   /order/<orderId>?print=1     - print-friendly all-sections view
 *   /order/<orderId>?role=kitchen - force a section to be the highlighted one
 *
 * Auth: ProtectedRoute keeps unauthenticated visitors out. Client
 * magic-link path stays on /c/order/[id] (unchanged this phase).
 */
import Head from "next/head";
import { useRouter } from "next/router";
import { OrderDocument } from "@/components/order/OrderDocument";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { NoIndexMeta } from "@/components/NoIndexMeta";

type ForcedSection = "kitchen" | "driver" | "waiter" | "shopping" | "cleaning" | "admin" | "client";

function isForcedSection(v: string | undefined): v is ForcedSection {
  return v === "kitchen" || v === "driver" || v === "waiter" || v === "shopping" || v === "cleaning" || v === "admin" || v === "client";
}

export default function OrderDocumentPage() {
  const router = useRouter();
  const id = String(router.query.id || "");
  const print = router.query.print === "1";
  const roleParam = typeof router.query.role === "string" ? router.query.role : undefined;
  const forceSection = isForcedSection(roleParam) ? roleParam : null;

  if (!id) return null;

  const content = (
    <main className={print ? "min-h-screen bg-white" : "min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50"}>
      <OrderDocument
        orderId={id}
        mode={print ? "print" : "interactive"}
        forceSection={forceSection}
      />
      {/* ODOC: print-only CSS - hides chrome that doesn't belong on paper. */}
      <style jsx global>{`
        @media print {
          @page { margin: 1.5cm; size: A4; }
          html, body { background: white !important; }
          button[type="button"], .print\\:hidden { display: none !important; }
          /* Force every collapsible into expanded state when printed */
          [aria-expanded="false"] + div { display: block !important; }
        }
      `}</style>
    </main>
  );

  return (
    <>
      <Head><title>Order - CateringMS</title></Head>
      <NoIndexMeta />
      {print ? content : <ProtectedRoute>{content}</ProtectedRoute>}
    </>
  );
}
