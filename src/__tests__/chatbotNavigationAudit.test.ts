import fs from "node:fs";
import path from "node:path";
import { NAVIGATION_REFS, filterRelevantNavigation, getRelevantNavigation } from "@/lib/chatbot/navigation";
import { routeChatQuestion } from "@/server/chatbot/router";

const ROOT = process.cwd();
const roles = [
  "super_admin", "owner", "company_admin", "region_admin", "sales_admin", "admin",
  "kitchen_manager", "kitchen_staff", "shopping_staff", "shopping", "driver", "waiter",
  "cleaning_manager", "cleaning_staff", "client", "staff",
];

function routeFile(href: string): string | null {
  const pathname = href.split(/[?#]/)[0].replace(/^\//, "");
  const candidates = [
    path.join(ROOT, "src", "pages", `${pathname}.tsx`),
    path.join(ROOT, "src", "pages", `${pathname}.ts`),
    path.join(ROOT, "src", "pages", pathname, "index.tsx"),
    path.join(ROOT, "src", "pages", pathname, "index.ts"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function sectionAnchorExists(href: string): boolean {
  const hash = href.match(/#([^#]+)$/)?.[1];
  if (!hash) return true;
  const file = routeFile(href);
  if (!file) return false;
  return fs.readFileSync(file, "utf8").includes(hash);
}

describe("chatbot local Phase 2 audit", () => {
  it("audits 200 role-specific questions plus every registered destination", () => {
    const cases = Array.from({ length: 200 }, (_, index) => {
      const item = NAVIGATION_REFS[index % NAVIGATION_REFS.length];
      const role = item.roles?.[index % item.roles.length] || roles[index % roles.length];
      const keyword = item.keywords[index % item.keywords.length] || item.label;
      return { item, role, question: `Where can I ${keyword}?` };
    });

    const questionFailures = cases.map(({ item, role, question }) => {
      const navigation = getRelevantNavigation(question, role, 3);
      return navigation.some((candidate) => candidate.ref === item.ref)
        ? null
        : `${role}: ${question} -> expected ${item.ref}; got ${navigation.map((candidate) => candidate.ref).join(", ") || "none"}`;
    }).filter(Boolean);

    const destinationFailures = NAVIGATION_REFS.map((item) => {
      if (!routeFile(item.href)) return `${item.ref}: route missing for ${item.href}`;
      if (item.targetType === "section" || item.targetType === "tab") {
        return sectionAnchorExists(item.href) ? null : `${item.ref}: anchor missing for ${item.href}`;
      }
      return null;
    }).filter(Boolean);

    const roleFailures = NAVIGATION_REFS
      .filter((item) => item.roles?.length)
      .filter((item) => !item.roles?.every((role) => roles.includes(role)))
      .map((item) => `${item.ref}: unknown role in ${item.roles?.join(", ")}`);

    const routeExamples = [
      ["What is our cancellation policy?", "knowledge"],
      ["How many open leads do I have this month?", "live_data"],
      ["Which companies are currently on trial?", "live_data"],
      ["How many companies use each plan?", "live_data"],
      ["Show registered company", "live_data"],
      ["Switch to that company's admin view.", "live_data"],
      ["Show all company owners.", "live_data"],
      ["Give me a complete platform overview.", "live_data"],
      ["What is our current subscription?", "hybrid"],
      ["Explain the cancellation policy and show this month's cancellations.", "hybrid"],
      ["Create an appointment for tomorrow.", "action_request"],
    ];
    const routeFailures = routeExamples
      .filter(([question, expected]) => routeChatQuestion(question).route !== expected)
      .map(([question, expected]) => `${question}: expected ${expected}, got ${routeChatQuestion(question).route}`);

    const fastStableFailures = ["hello", "What does CateringMS provide?"].filter((question) => {
      const route = routeChatQuestion(question);
      return route.useKnowledge || route.useLiveData;
    }).map((question) => `${question}: expected no retrieval or live-data work`);

    const allFailures = [...questionFailures, ...destinationFailures, ...roleFailures, ...routeFailures, ...fastStableFailures];
    console.log(`[chatbot audit] questions=${cases.length} refs=${NAVIGATION_REFS.length} pages=${NAVIGATION_REFS.filter((item) => !item.targetType || item.targetType === "page").length} deep_links=${NAVIGATION_REFS.filter((item) => item.targetType === "section" || item.targetType === "tab").length} failures=${allFailures.length}`);
    if (allFailures.length) console.log(allFailures.slice(0, 40).join("\n"));
    expect(allFailures).toEqual([]);
  });

  it("can retrieve every permitted destination for every supported role", () => {
    const failures = NAVIGATION_REFS
      // A plain label can intentionally have more than one destination (for
      // example a page and one of its tabs). Verify the first registered
      // canonical destination for that label; the full question audit above
      // still checks the specific keywords for each deep link.
      .filter((item, index, items) => items.findIndex((candidate) =>
        candidate.label.toLowerCase() === item.label.toLowerCase(),
      ) === index)
      .flatMap((item) => (item.roles?.length ? item.roles : roles)
      .filter((role, index, list) => list.indexOf(role) === index)
      .filter((role) => !getRelevantNavigation(`Open ${item.label}`, role, NAVIGATION_REFS.length).some((candidate) => candidate.ref === item.ref))
      .map((role) => `${role}: ${item.ref}`));
    console.log(`[chatbot destination matrix] checked=${NAVIGATION_REFS.length} refs across ${roles.length} roles failures=${failures.length}`);
    expect(failures).toEqual([]);
  });

  it("uses curated product entry points for a broad product overview question", () => {
    const navigation = getRelevantNavigation("What does CateringMS provide?", "admin", 3);
    expect(navigation.map((item) => item.ref)).toEqual(["admin.dashboard", "admin.offering", "admin.orders"]);
    expect(navigation.some((item) => ["admin.onboarding.import", "account.settings", "admin.company-profile"].includes(item.ref))).toBe(false);
  });

  it("returns only the destination requested by an operational question", () => {
    const inventory = getRelevantNavigation("Where can I check current inventory levels?", "admin", 3);
    expect(inventory[0]?.ref).toBe("admin.inventory");
    expect(inventory.some((item) => ["admin.onboarding.import", "account.settings", "admin.company-profile"].includes(item.ref))).toBe(false);

    const importData = getRelevantNavigation("Where can I import initial business data?", "admin", 3);
    expect(importData[0]?.ref).toBe("admin.onboarding.import");
    expect(importData.some((item) => ["account.settings", "admin.company-profile"].includes(item.ref))).toBe(false);
  });

  it("keeps current customer questions on the contact book", () => {
    const navigation = getRelevantNavigation("What's our active customers?", "owner", 3);
    expect(navigation.map((item) => item.ref)).toEqual(["admin.contacts", "admin.contacts.book"]);
    expect(navigation.some((item) => ["admin.leads.pipeline", "admin.live-operations", "admin.tracking"].includes(item.ref))).toBe(false);
  });

  it("keeps current subscription questions on the subscription screen", () => {
    const navigation = getRelevantNavigation("Which subscription plans are active?", "owner", 3);
    expect(navigation.map((item) => item.ref)).toEqual(["admin.subscription"]);
    expect(navigation.some((item) => ["admin.leads.pipeline", "admin.ai-brain", "admin.contacts"].includes(item.ref))).toBe(false);
  });

  it("keeps platform live questions on their single relevant screen", () => {
    expect(getRelevantNavigation("How many users are on the platform?", "super_admin", 3).map((item) => item.ref))
      .toEqual(["platform.user-management"]);
    expect(getRelevantNavigation("How many companies are currently registered?", "super_admin", 3).map((item) => item.ref))
      .toEqual(["platform.company-database"]);
    expect(getRelevantNavigation("Show registered company", "super_admin", 3).map((item) => item.ref))
      .toEqual(["platform.company-database"]);
    expect(getRelevantNavigation("Which companies are currently on trial?", "super_admin", 3).map((item) => item.ref))
      .toEqual(["platform.trial-management"]);
    expect(getRelevantNavigation("How many companies use each plan?", "super_admin", 3).map((item) => item.ref))
      .toEqual(["platform.subscription-management"]);
    expect(getRelevantNavigation("Which subscription plans are active?", "super_admin", 3).map((item) => item.ref))
      .toEqual(["platform.subscription-management"]);
    expect(getRelevantNavigation("Give me a complete platform overview.", "super_admin", 3).map((item) => item.ref))
      .toEqual(["platform.dashboard"]);
    expect(getRelevantNavigation("Where can I view MRR details?", "super_admin", 3).map((item) => item.ref))
      .toEqual(["platform.financial-dashboard"]);
    expect(getRelevantNavigation("Switch to that company's admin view.", "super_admin", 3).map((item) => item.ref))
      .toEqual(["platform.company-database"]);
    expect(getRelevantNavigation("Which currencies are supported?", "super_admin", 3).map((item) => item.ref))
      .toEqual(["platform.currency-monitoring"]);
  });

  it("keeps pending-invitation links focused on user management", () => {
    expect(getRelevantNavigation("Which invitations are still pending?", "super_admin", 3).map((item) => item.ref))
      .toEqual(["platform.user-management.pending-invitations", "platform.user-management"]);
    expect(getRelevantNavigation("Which invitations are still pending?", "company_admin", 3).map((item) => item.ref))
      .toEqual(["admin.users"]);

    const staleNavigation = [
      NAVIGATION_REFS.find((item) => item.ref === "platform.user-management.pending-invitations")!,
      NAVIGATION_REFS.find((item) => item.ref === "platform.user-management")!,
      NAVIGATION_REFS.find((item) => item.ref === "platform.pricing-management")!,
    ];
    expect(filterRelevantNavigation("There are no pending invitations currently.", "super_admin", staleNavigation).map((item) => item.ref))
      .toEqual(["platform.user-management.pending-invitations", "platform.user-management"]);
  });

  it("resolves direct platform navigation to one canonical page", () => {
    expect(getRelevantNavigation("Open Pricing.", "super_admin", 3).map((item) => item.ref))
      .toEqual(["platform.pricing-management"]);
    expect(getRelevantNavigation("Open Subscriptions", "super_admin", 3).map((item) => item.ref))
      .toEqual(["platform.subscription-management"]);
    expect(getRelevantNavigation("Open Users", "super_admin", 3).map((item) => item.ref))
      .toEqual(["platform.user-management"]);
  });

  it("keeps direct pricing navigation inside a company workspace", () => {
    expect(getRelevantNavigation("Open Pricing", "company_admin", 3).map((item) => item.ref))
      .toEqual(["admin.offering"]);
  });

  it("does not offer links for data outside a role's scope", () => {
    expect(getRelevantNavigation("Which companies are currently on trial?", "company_admin", 3)).toEqual([]);
    expect(getRelevantNavigation("How many companies are currently registered?", "company_admin", 3)).toEqual([]);
    expect(getRelevantNavigation("Show all orders across companies", "owner", 3)).toEqual([]);
    expect(getRelevantNavigation("What is the owner's email?", "company_admin", 3)).toEqual([]);
    expect(getRelevantNavigation("Which currencies are supported?", "company_admin", 3)).toEqual([]);
  });
});
