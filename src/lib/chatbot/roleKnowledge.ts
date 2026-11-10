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
  owner: "Administrators create one-off kitchen, cleaning, shared, or driver work in Daily operations. Tasks are assigned to the relevant team dashboard; the first eligible team member to start claims it. The chosen date and time must have roster coverage. Reminders can be sent from the task time up to three days before. A task timer creates a payroll session only when that worker has no open shift clock, avoiding duplicate pay.",
  company_admin: "Administrators create one-off kitchen, cleaning, shared, or driver work in Daily operations. Tasks are assigned to the relevant team dashboard; the first eligible team member to start claims it. The chosen date and time must have roster coverage. Reminders can be sent from the task time up to three days before. A task timer creates a payroll session only when that worker has no open shift clock, avoiding duplicate pay.",
  admin: "Administrators create one-off kitchen, cleaning, shared, or driver work in Daily operations. Tasks are assigned to the relevant team dashboard; the first eligible team member to start claims it. The chosen date and time must have roster coverage. Reminders can be sent from the task time up to three days before. A task timer creates a payroll session only when that worker has no open shift clock, avoiding duplicate pay.",
  kitchen_manager: "Kitchen tasks appear on the kitchen dashboard; cleaning work can appear on both kitchen and cleaning dashboards while remaining assigned to the cleaning team. Start a task to claim it and record work time, then complete it when finished. Existing open shift time already covers the task, so a separate payroll session is not added.",
  kitchen_staff: "Kitchen tasks appear on the kitchen dashboard; cleaning work can appear on both kitchen and cleaning dashboards while remaining assigned to the cleaning team. Start a task to claim it and record work time, then complete it when finished. Existing open shift time already covers the task, so a separate payroll session is not added.",
  cleaning_manager: "Cleaning tasks appear on the cleaning dashboard and may also be visible to kitchen staff. They remain assigned to the cleaning team. Start a task to claim it and record work time, then complete it when finished. Existing open shift time already covers the task, so a separate payroll session is not added.",
  cleaning_staff: "Cleaning tasks appear on the cleaning dashboard and may also be visible to kitchen staff. They remain assigned to the cleaning team. Start a task to claim it and record work time, then complete it when finished. Existing open shift time already covers the task, so a separate payroll session is not added.",
  driver: "One-off driver routes appear on the driver dashboard when the route time has driver roster coverage. The first eligible rostered driver to start claims the route and starts work time. Follow stops in order: start the route, mark arrival, complete the collection or delivery, then continue to the next stop. After the final stop, return to the kitchen and complete the route. The task and any task-created payroll session record the work time; an already-open shift clock is not duplicated.",
  waiter: "One-off tasks appear only on their assigned team dashboard. Start an eligible task to claim it and record work time, then complete it when finished. The assistant can summarize tasks and their status only within the signed-in role's access.",
  staff: "One-off tasks appear only on their assigned team dashboard. Start an eligible task to claim it and record work time, then complete it when finished. The assistant can summarize tasks and their status only within the signed-in role's access.",
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
