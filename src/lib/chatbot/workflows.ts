import { NAVIGATION_REFS, type ChatNavigationRef } from "./navigation";

export interface ChatWorkflowStep {
  id: string;
  title: string;
  description: string;
  ref: string;
  href: string;
  targetType: "page" | "section" | "tab" | "record";
}

export interface ChatWorkflow {
  id: string;
  label: string;
  description: string;
  steps: ChatWorkflowStep[];
}

interface WorkflowStepDefinition {
  id: string;
  title: string;
  description: string;
  ref: string;
}

interface WorkflowDefinition {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  roles: string[];
  steps: WorkflowStepDefinition[];
}

const ADMIN = ["super_admin", "owner", "company_admin", "region_admin", "sales_admin", "admin"];
const KITCHEN = ["kitchen_manager", "kitchen_staff"];
const SHOPPING = ["shopping_staff", "shopping"];
const DRIVER = ["driver"];
const CLEANING = ["cleaning_manager", "cleaning_staff"];
const CLIENT = ["client"];

const WORKFLOW_DEFINITIONS: WorkflowDefinition[] = [
  {
    id: "sales-lead-to-invoice",
    label: "Lead to confirmed event",
    description: "Move a new enquiry through qualification, quoting, confirmation, and billing.",
    keywords: ["new lead", "lead process", "lead workflow", "sales process", "enquiry", "qualify lead", "convert lead", "close lead", "quote customer"],
    roles: ADMIN,
    steps: [
      { id: "review-leads", title: "Review and qualify the lead", description: "Filter the pipeline and confirm the enquiry has enough customer and event detail.", ref: "admin.leads.filters" },
      { id: "follow-up", title: "Work the lead follow-up", description: "Review follow-ups, ownership, and conversion status before preparing an offer.", ref: "admin.leads.pipeline" },
      { id: "prepare-quote", title: "Prepare or review the quote", description: "Check the quote value, status, and validity before sending it to the customer.", ref: "admin.quotes.pipeline" },
      { id: "confirm-order", title: "Confirm the booked event", description: "Open the order list to verify the event date, service details, and operational handoff.", ref: "admin.orders.list" },
      { id: "check-billing", title: "Check billing and payment status", description: "Review the invoice ledger and follow up on balances or overdue payments.", ref: "admin.invoices.ledger" },
    ],
  },
  {
    id: "event-fulfilment",
    label: "Event fulfilment",
    description: "Coordinate a confirmed event from readiness checks through production and dispatch.",
    keywords: ["fulfil event", "event fulfilment", "event workflow", "prepare event", "order readiness", "from order to delivery", "operational process", "event process"],
    roles: ADMIN,
    steps: [
      { id: "check-order", title: "Check the confirmed order", description: "Verify the event date, guest count, venue, and current order status.", ref: "admin.orders.list" },
      { id: "check-stock", title: "Check stock and shortages", description: "Review inventory and identify anything that must be purchased before production.", ref: "admin.inventory.catalogue" },
      { id: "plan-buying", title: "Plan urgent purchases", description: "Open the buy-now list to assign shortages and procurement priorities.", ref: "admin.shopping.buy-now" },
      { id: "plan-production", title: "Coordinate kitchen production", description: "Review the production board and prep demand for the event handoff.", ref: "kitchen.production.board" },
      { id: "plan-delivery", title: "Plan delivery and dispatch", description: "Assign routes and confirm the delivery plan for the event.", ref: "admin.route-planning" },
      { id: "monitor-live", title: "Monitor live operations", description: "Track active deliveries and resolve exceptions from the live operations view.", ref: "admin.tracking.map" },
    ],
  },
  {
    id: "kitchen-production",
    label: "Kitchen production",
    description: "Follow the kitchen's daily production path from workload to prep completion.",
    keywords: ["kitchen process", "kitchen workflow", "production process", "production steps", "prepare food", "prep workflow", "kitchen order"],
    roles: KITCHEN,
    steps: [
      { id: "kitchen-today", title: "Open today's kitchen workload", description: "Start with the day's orders, timing, and assigned responsibilities.", ref: "kitchen.today" },
      { id: "production-board", title: "Review the production board", description: "Check production readiness, order sequence, and handoffs.", ref: "kitchen.production.board" },
      { id: "prep-list", title: "Complete the prep list", description: "Work through assigned prep tasks and record completion status.", ref: "kitchen.prep" },
      { id: "check-stock", title: "Confirm ingredient stock", description: "Check ingredient stock and identify shortages before service.", ref: "kitchen.stock" },
    ],
  },
  {
    id: "procurement-restock",
    label: "Restock and procurement",
    description: "Identify shortages, prepare the buying list, compare suppliers, and record receipts.",
    keywords: ["procurement process", "shopping process", "restock process", "restocking", "what to buy", "buying workflow", "purchase workflow", "supplier process"],
    roles: [...ADMIN, ...SHOPPING],
    steps: [
      { id: "stock-check", title: "Review procurement stock", description: "Find low, out-of-stock, or below-par items that need attention.", ref: "shopping.inventory.stock" },
      { id: "buy-list", title: "Build the buy list", description: "Prioritise the items to purchase and connect them to upcoming demand.", ref: "shopping.buy-list.items" },
      { id: "suppliers", title: "Compare suppliers", description: "Review supplier options, linked products, and purchase terms.", ref: "shopping.suppliers" },
      { id: "receipts", title: "Record purchase evidence", description: "Review or record receipts so purchasing spend and stock movement remain traceable.", ref: "shopping.receipts" },
    ],
  },
  {
    id: "driver-delivery",
    label: "Driver delivery",
    description: "Follow an assigned delivery from route review to completion and proof of delivery.",
    keywords: ["delivery process", "driver process", "delivery steps", "delivery workflow", "make a delivery", "route workflow", "dispatch process"],
    roles: DRIVER,
    steps: [
      { id: "route", title: "Review your route", description: "Check assigned stops, timing, and route order before leaving.", ref: "driver.routes" },
      { id: "upcoming", title: "Open upcoming deliveries", description: "Confirm collection details, venue information, and delivery requirements.", ref: "driver.deliveries.upcoming" },
      { id: "tracking", title: "Use delivery tracking", description: "Keep the delivery status and live location current while on the route.", ref: "driver.tracking" },
      { id: "complete", title: "Review completed deliveries", description: "Confirm completed stops and any proof or exception notes.", ref: "driver.deliveries.completed" },
    ],
  },
  {
    id: "cleaning-return",
    label: "Cleaning and equipment return",
    description: "Complete assigned cleaning work, verify returned equipment, and record damage.",
    keywords: ["cleaning process", "cleaning workflow", "equipment return", "equipment process", "inspect equipment", "damage process", "cleaning steps"],
    roles: CLEANING,
    steps: [
      { id: "tasks", title: "Open assigned cleaning tasks", description: "Review the work assigned for the current shift or event.", ref: "cleaning.tasks" },
      { id: "equipment", title: "Inspect equipment", description: "Check equipment condition, availability, and cleaning status.", ref: "cleaning.equipment" },
      { id: "verify", title: "Verify returned equipment", description: "Confirm returned equipment is ready for the next event or flag an exception.", ref: "cleaning.dashboard.verification" },
      { id: "damage", title: "Record damage or loss", description: "Review or report damaged and missing equipment with the correct status.", ref: "cleaning.dashboard.damages" },
    ],
  },
  {
    id: "client-event",
    label: "Client event journey",
    description: "Guide a client from quote response through booking, payment, and delivery tracking.",
    keywords: ["client process", "my event process", "event journey", "booking process", "customer steps", "what happens next", "client workflow"],
    roles: CLIENT,
    steps: [
      { id: "quote", title: "Review the quote", description: "Open quotes waiting for your response and review the event offer.", ref: "client.quotes.waiting" },
      { id: "booking", title: "Review booking details", description: "Confirm the event details, schedule, venue, and included services.", ref: "client.bookings.list" },
      { id: "billing", title: "Check billing and payments", description: "Review invoices, balances, and payment status for the event.", ref: "client.billing.invoices" },
      { id: "tracking", title: "Track the delivery", description: "Monitor active delivery progress when the event is in transit.", ref: "client.tracking.live" },
    ],
  },
  {
    id: "assistant-governance",
    label: "Assistant governance",
    description: "Manage approved knowledge sources, role access, and live-data tool permissions.",
    keywords: ["ai access process", "assistant access", "rag process", "knowledge process", "manage assistant", "restrict tools", "tool permissions", "ai governance"],
    roles: ["super_admin", "owner", "company_admin"],
    steps: [
      { id: "knowledge", title: "Manage approved knowledge", description: "Add or review approved documents, PDFs, and website sources for the assistant.", ref: "admin.ai-brain" },
      { id: "role-tools", title: "Set role-level live access", description: "Choose which company roles may receive current operational answers.", ref: "admin.ai-brain.access.live-tools" },
      { id: "tool-scopes", title: "Restrict individual data tools", description: "Enable or disable specific approved scopes such as orders, leads, invoices, inventory, or deliveries.", ref: "admin.ai-brain.access.live-tools" },
    ],
  },
];

function isAllowed(definition: WorkflowDefinition, role: string): boolean {
  return definition.roles.includes(role);
}

function score(query: string, definition: WorkflowDefinition): number {
  const normalized = query.toLowerCase();
  return definition.keywords.reduce((total, keyword) => total + (normalized.includes(keyword) ? (keyword.includes(" ") ? 3 : 1) : 0), 0);
}

function resolveStep(step: WorkflowStepDefinition, role: string): ChatWorkflowStep | null {
  const target: ChatNavigationRef | undefined = NAVIGATION_REFS.find((item) => item.ref === step.ref && (!item.roles || item.roles.includes(role)));
  if (!target) return null;
  return {
    ...step,
    href: target.href,
    targetType: target.targetType || "page",
  };
}

export function getRelevantWorkflows(query: string, role: string, limit = 1): ChatWorkflow[] {
  return WORKFLOW_DEFINITIONS
    .filter((definition) => isAllowed(definition, role))
    .map((definition) => ({ definition, score: score(query, definition) }))
    .filter(({ score: value }) => value > 0)
    .sort((left, right) => right.score - left.score || left.definition.label.localeCompare(right.definition.label))
    .slice(0, limit)
    .map(({ definition }) => ({
      id: definition.id,
      label: definition.label,
      description: definition.description,
      steps: definition.steps.map((step) => resolveStep(step, role)).filter((step): step is ChatWorkflowStep => !!step),
    }))
    .filter((workflow) => workflow.steps.length >= 2);
}
