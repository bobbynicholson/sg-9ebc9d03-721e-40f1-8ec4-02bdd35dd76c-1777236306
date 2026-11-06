/* eslint-disable @typescript-eslint/no-explicit-any */
/** Tells company admins when WhatsApp needs attention. Never includes client details. */
const AUTH_ERROR = /access token|oauth|session has expired|invalid token|error validating/i;

export function isConnectionProblem(reason: string | null | undefined): boolean {
  return AUTH_ERROR.test(String(reason || ""));
}

async function notifyAdmins(companyId: string, type: string, title: string, message: string, link = "/admin/whatsapp") {
  const { notificationService } = await import("@/services/notificationService");
  const { UserRole } = await import("@/types/app");
  await (notificationService as any).broadcastNotification({
    companyId,
    type,
    title,
    message,
    priority: "high",
    link,
    targetRoles: [UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, "owner"],
    dedup: true,
    dedupWindowMinutes: type === "whatsapp_reply" ? 5 : 1440,
  });
}

/** Marks the connection as needing attention so the page shows a warning. */
export async function flagWhatsAppConnectionProblem(sb: any, companyId: string): Promise<void> {
  const { data: row } = await sb.from("integrations").select("id, settings")
    .eq("company_id", companyId).eq("integration_type", "whatsapp").maybeSingle();
  if (!row) return;
  await sb.from("integrations").update({
    status: "needs_attention",
    settings: { ...(row.settings || {}), attention: "WhatsApp stopped sending because Meta rejected the access token. Disconnect and connect again with a new token." },
  }).eq("id", row.id);
  await notifyAdmins(companyId, "whatsapp_connection_problem", "WhatsApp has stopped sending",
    "Meta rejected your access token. Open WhatsApp and connect again.").catch((e) => console.warn("[whatsapp/alerts] notify failed:", e?.message));
}

export async function alertWhatsAppFailures(companyId: string, count: number): Promise<void> {
  await notifyAdmins(companyId, "whatsapp_send_failed", "WhatsApp messages failed",
    `${count} WhatsApp message${count === 1 ? "" : "s"} could not be sent. Open Recent messages on the WhatsApp page to see why.`)
    .catch((e) => console.warn("[whatsapp/alerts] notify failed:", e?.message));
}

export async function alertWhatsAppReply(companyId: string, name: string | null): Promise<void> {
  await notifyAdmins(companyId, "whatsapp_reply", "New WhatsApp reply", `${name || "A client"} replied on WhatsApp.`)
    .catch((e) => console.warn("[whatsapp/alerts] notify failed:", e?.message));
}
