import { NAVIGATION_REFS, type ChatNavigationRef } from "./navigation";
import { normalizeChatRole } from "./roles";

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

export const WORKFLOW_DEFINITIONS: WorkflowDefinition[] = [
  {
    id: "duplicate-order-invoice",
    label: "Invoice a rebooked order",
    description: "Create the new booking's invoice and correctly account for any deposit carried over from the cancelled booking.",
    keywords: [
      "invoice for duplicate order", "invoice for duplicated order", "duplicate order invoice",
      "invoice for the new order", "invoice for new order", "invoice for rebooked order",
      "invoice for new booking", "duplicate booking invoice", "duplicated booking invoice",
      "create payment request for order", "rebook cancelled order", "rebook cancelled booking",
      "new order after cancellation",
    ],
    roles: ADMIN,
    steps: [
      { id: "open-rebooked-order", title: "Open the new duplicated order", description: "In Orders, find the new copy and verify its event date, client, and total before billing.", ref: "admin.orders.list" },
      { id: "check-cancellation-settlement", title: "Check how the original deposit was settled", description: "The duplicate starts as a fresh unpaid order; its original invoice and payment history stay with the cancelled order. If cancellation issued store credit, do not record the same deposit again as a new payment: send the new invoice and the client can apply available store credit through its payment link. If the deposit was refunded, request payment normally. If money was retained without store credit being issued, reconcile the cancellation before requesting more money.", ref: "admin.order-finance" },
      { id: "create-rebooked-invoice", title: "Create and send the new payment request", description: "Duplicating creates the new order's quote and a draft invoice; nothing is emailed yet. In the new order's Finance section, choose Send payment request, review the invoice and email, then send. Order edits update the draft invoice and quote, so fix the order first. If the order has no invoice, choose Create payment request. Quote acceptance is not needed for a duplicated order.", ref: "admin.order-finance" },
    ],
  },
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
      { id: "plan-production", title: "Coordinate kitchen production", description: "Review today's kitchen workload and prep demand for the event handoff.", ref: "kitchen.today" },
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
      { id: "calendar", title: "Plan the kitchen calendar", description: "Review the month calendar for event timing, readiness, and handoffs.", ref: "kitchen.today" },
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
    keywords: ["client process", "my event process", "event journey", "booking process", "customer steps", "what happens next", "what do i need to do next", "what should i do next", "next steps", "client workflow"],
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
  {
    id: "payment-reminders",
    label: "Payment reminders",
    description: "Decide when clients must pay and whether they get one payment reminder. Reminders are off until you turn them on; each unpaid order gets at most one.",
    keywords: ["payment reminder", "payment reminders", "stop payment reminders", "turn off payment reminders", "turn off reminders", "reminder days", "remind clients to pay", "set up reminders", "payment terms", "pay after event", "too many reminders"],
    roles: ADMIN,
    steps: [
      { id: "payment-due", title: "Set when payment is due", description: "In Settings, Financial, set Payment is due to a number of days before the event (clients who pay upfront) or after it (clients on terms, for example 30 days). Invoice due dates follow this.", ref: "admin.settings.payment-due" },
      { id: "payment-reminder", title: "Choose the payment reminder", description: "Under Payment reminders pick Don't send payment reminders, or Send one reminder before payment is due and enter the number of days. Then press Save defaults at the top of the page.", ref: "admin.settings.payment-reminders" },
      { id: "client-override", title: "Optional: a different rule for one client", description: "In Contacts, open the client, choose Edit, then More details. Under Payment due date and reminder set this client's own rule; anything left on Same as company setting follows Settings.", ref: "admin.contacts.page" },
    ],
  },
  {
    id: "automatic-emails",
    label: "Automatic emails on or off",
    description: "Choose which automatic emails are sent. Off means that automatic email is not sent at all; emails you send yourself (Send quote, Send invoice, messages, Resend) always go out, and sign-in links and invitations are always sent.",
    keywords: ["automatic emails", "turn off automatic emails", "stop automatic emails", "too many emails", "manual or automatic", "automated emails", "disable emails", "stop emailing clients", "email automation", "which emails are sent"],
    roles: ADMIN,
    steps: [
      { id: "all-emails", title: "Turn all automatic emails on or off", description: "In Email settings, open Automation and sending control and use Send automatic emails. Off stops every automatic email except any you set to Automatic below.", ref: "admin.email-settings.automatic-emails" },
      { id: "each-email", title: "Turn individual emails on or off", description: "Under Automatic emails by category, search for an email or open its category. Choose Automatic or Off, then press Save settings at the top of the page.", ref: "admin.email-settings.each-email" },
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
  role = normalizeChatRole(role);
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
