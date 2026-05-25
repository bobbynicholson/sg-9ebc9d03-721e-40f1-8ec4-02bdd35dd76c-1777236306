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
import { DynamicNav } from "@/components/DynamicNav";
import { useAuth } from "@/contexts/AuthContext";

type ForcedSection = "kitchen" | "driver" | "waiter" | "shopping" | "cleaning" | "admin" | "client";

/**
 * ODOC G.1: normalise the ?role= query param to a force-section.
 *
 * We accept the canonical section keys (kitchen, driver, etc) AND
 * the broader role identifiers staff/admin links carry. Admin-tier
 * roles (owner, region_admin, sales_admin, company_admin) all map
 * to the admin section so finance auto-expands for them.
 *
 * kitchen_staff -> kitchen, shopping_staff -> shopping,
 * cleaning_staff -> cleaning are the long-form role IDs used in
 * notification producers and UI links.
 */
const ROLE_TO_SECTION: Record<string, ForcedSection> = {
  kitchen: "kitchen",
  kitchen_staff: "kitchen",
  driver: "driver",
  waiter: "waiter",
  shopping: "shopping",
  shopping_staff: "shopping",
  cleaning: "cleaning",
  cleaning_staff: "cleaning",
  admin: "admin",
  owner: "admin",
  region_admin: "admin",
  sales_admin: "admin",
  company_admin: "admin",
  super_admin: "admin",
  client: "client",
};

function resolveForcedSection(v: string | undefined): ForcedSection | null {
  if (!v) return null;
  return ROLE_TO_SECTION[v] || null;
}

function OrderDocumentInner({ id, print, forceSection }: {
  id: string;
  print: boolean;
  forceSection: ForcedSection | null;
}) {
  // ODOC H.6: internal staff lose their left-rail nav when they
  // open an order doc, breaking the "open order, jump to dispatch"
  // muscle memory every other admin page supports. We mount the
  // role-aware DynamicNav alongside the doc and pad the content
  // by the same lg:pl-72 xl:pl-80 every /admin/* page uses. Print
  // mode skips the nav so paper output stays clean.
  const { user } = useAuth();
  const role = (user?.role as string | undefined) || "";

  return (
    <>
      {!print && role && <DynamicNav userRole={role} />}
      <main
        className={
          print
            ? "min-h-screen bg-white"
            : "min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50 lg:pl-72 xl:pl-80"
        }
      >
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
    </>
  );
}

export default function OrderDocumentPage() {
  const router = useRouter();
  const id = String(router.query.id || "");
  const print = router.query.print === "1";
  const roleParam = typeof router.query.role === "string" ? router.query.role : undefined;
  const forceSection = resolveForcedSection(roleParam);

  if (!id) return null;

  const content = <OrderDocumentInner id={id} print={print} forceSection={forceSection} />;

  return (
    <>
      <Head><title>Order - CateringMS</title></Head>
      <NoIndexMeta />
      {print ? content : <ProtectedRoute>{content}</ProtectedRoute>}
    </>
  );
}
