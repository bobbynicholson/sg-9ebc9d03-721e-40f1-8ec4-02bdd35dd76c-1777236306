import packs from "../../../content/ai-brain/role-packs.json";

export interface RoleKnowledgePack {
  key: string;
  name: string;
  roles: string[];
  content: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "owner",
  company_admin: "company admin",
  admin: "admin",
  region_admin: "region admin",
  sales_admin: "sales admin",
  kitchen_manager: "kitchen manager",
  kitchen_staff: "kitchen staff",
  shopping: "shopping",
  shopping_staff: "shopping staff",
  driver: "driver",
  cleaning_manager: "cleaning manager",
  cleaning_staff: "cleaning staff",
  client: "client portal",
  waiter: "waiter",
  staff: "staff",
  super_admin: "platform admin",
};

const EXTRA_ROLE_CONTENT: Record<string, string> = {
  waiter: "WAITER SERVICE GUIDE\n\nUse the waiter workflow for assigned service duties, event timing, guest-facing handoffs, table or service notes, and team notifications. Only rely on assignments for the signed-in waiter. Report service issues through the relevant operational screen. The assistant may summarize assigned work but must not expose payment, payroll, supplier, or unrelated client records.",
  staff: "GENERAL STAFF OPERATING GUIDE\n\nUse the staff portal for the tasks and notifications assigned to the signed-in staff member. Confirm the relevant order, event, handoff, and timing before acting. Record exceptions in the relevant operational screen. The assistant may explain assigned work and navigate to the correct page but must not expose unrelated customer, payment, payroll, or supplier data.",
  super_admin: "PLATFORM ADMIN GUIDE\n\nThe platform admin workspace manages companies, users, subscriptions, trials, tenant health, revenue, pricing, currency, technology costs, audit logs, and approved platform knowledge. Use platform pages for platform-wide operations. A platform session has no company context; never claim tenant-specific records until a company is explicitly selected through an approved workflow. The assistant may explain platform pages and approved platform knowledge but remains read-focused.",
};

const DAILY_TASK_GUIDANCE: Record<string, string> = {
  owner: "Use Daily operations to manage recurring kitchen and equipment-cleaning schedules and create dated one-off work. Assign a driver route to a named driver; no roster shift is required for that route. Assign a custom kitchen task to a kitchen manager, who then delegates it to a kitchen staff member. Cleaning and shared tasks appear on eligible team dashboards, and one-off cleaning/shared work requires roster coverage at the selected time. Reminders can be sent up to three days ahead. Task work time is recorded without duplicating an already-open shift clock.",
  company_admin: "Use Daily operations to manage recurring kitchen and equipment-cleaning schedules and create dated one-off work. Assign a driver route to a named driver; no roster shift is required for that route. Assign a custom kitchen task to a kitchen manager, who then delegates it to a kitchen staff member. Cleaning and shared tasks appear on eligible team dashboards, and one-off cleaning/shared work requires roster coverage at the selected time. Reminders can be sent up to three days ahead. Task work time is recorded without duplicating an already-open shift clock.",
  admin: "Use Daily operations to manage recurring kitchen and equipment-cleaning schedules and create dated one-off work. Assign a driver route to a named driver; no roster shift is required for that route. Assign a custom kitchen task to a kitchen manager, who then delegates it to a kitchen staff member. Cleaning and shared tasks appear on eligible team dashboards, and one-off cleaning/shared work requires roster coverage at the selected time. Reminders can be sent up to three days ahead. Task work time is recorded without duplicating an already-open shift clock.",
  kitchen_manager: "Custom kitchen tasks are assigned to you in Daily operations; delegate each task to a kitchen staff member, who can then complete it and record work time. Cleaning work can also appear on the kitchen dashboard while remaining assigned to the cleaning team; shared tasks are visible on eligible kitchen and cleaning dashboards. An already-open shift clock is not duplicated for task work.",
  kitchen_staff: "Custom kitchen tasks appear after the kitchen manager assigns them to a kitchen staff member. Complete assigned work from the kitchen dashboard and record work time. Cleaning or shared tasks may also appear there when your role is eligible. An already-open shift clock is not duplicated for task work.",
  cleaning_manager: "Cleaning tasks appear on the cleaning dashboard and may also be visible to kitchen staff. They remain assigned to the cleaning team. Start a task to claim it and record work time, then complete it when finished. Existing open shift time already covers the task, so a separate payroll session is not added.",
  cleaning_staff: "Cleaning tasks appear on the cleaning dashboard and may also be visible to kitchen staff. They remain assigned to the cleaning team. Start a task to claim it and record work time, then complete it when finished. Existing open shift time already covers the task, so a separate payroll session is not added.",
  driver: "One-off driver routes appear on the dashboard of the named driver assigned by an administrator; a driver roster shift is not required. Start your assigned route when it is time, then follow stops in order: mark arrival, complete each collection or delivery, and continue to the next stop. After the final stop, return to the kitchen and complete the route. Route progress records work time without duplicating an already-open shift clock.",
  waiter: "Use the waiter dashboard for work assigned to your role. One-off kitchen, cleaning, and driver tasks are managed through their respective team workflows. The assistant can summarize only work available within the signed-in role's access.",
  staff: "Use the staff dashboard for work assigned to your role. One-off kitchen, cleaning, and driver tasks follow their respective team workflows; do not claim work assigned to another person. The assistant can summarize only work available within the signed-in role's access.",
};

function makeRolePack(pack: RoleKnowledgePack, role: string): RoleKnowledgePack {
  const label = ROLE_LABELS[role] || role.replace(/_/g, " ");
  const baseContent = EXTRA_ROLE_CONTENT[role] || `${label.toUpperCase()} GUIDE\n\n${pack.content.split("\n\n").slice(1).join("\n\n")}`;
  const content = DAILY_TASK_GUIDANCE[role] ? `${baseContent}\n\nONE-OFF TASKS AND WORK TIME\n\n${DAILY_TASK_GUIDANCE[role]}` : baseContent;
  return { key: role, name: `CateringMS ${label} operating guide`, roles: [role], content };
}

const groupedPacks = packs as RoleKnowledgePack[];
export const ROLE_KNOWLEDGE_PACKS: RoleKnowledgePack[] = [
  ...groupedPacks.flatMap((pack) => pack.roles.map((role) => makeRolePack(pack, role))),
  makeRolePack({ key: "general", name: "General staff", roles: ["waiter", "staff"], content: groupedPacks[0]?.content || "" }, "waiter"),
  makeRolePack({ key: "general", name: "General staff", roles: ["waiter", "staff"], content: groupedPacks[0]?.content || "" }, "staff"),
  makeRolePack({ key: "platform", name: "Platform admin", roles: ["super_admin"], content: "" }, "super_admin"),
];
