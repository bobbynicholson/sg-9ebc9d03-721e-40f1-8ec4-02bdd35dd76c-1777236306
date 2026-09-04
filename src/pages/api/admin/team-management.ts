/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { notificationService } from "@/services/notificationService";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { UserRole } from "@/types/app";
import { teamBucketsForUser, type TeamRoleDepartmentRow } from "@/lib/teamRoleBuckets";

type Department = "kitchen" | "cleaning";
type Member = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  active_role: string | null;
  avatar_url?: string | null;
  is_active: boolean | null;
};

const ADMIN_ROLES = new Set<string>([
  UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN,
  UserRole.REGION_ADMIN, UserRole.SALES_ADMIN, UserRole.ADMIN,
]);

function cleanDepartment(value: unknown): Department | null {
  return value === "kitchen" || value === "cleaning" ? value : null;
}

function text(value: unknown, max = 4000): string {
  return String(value || "").trim().slice(0, max);
}

function memberBelongsToDepartment(
  profile: Member,
  departmentRows: TeamRoleDepartmentRow[],
  department: Department,
): boolean {
  return teamBucketsForUser(profile, departmentRows).has(department);
}

async function getCompanyContext(req: NextApiRequest, res: NextApiResponse) {
  const ssr = createPagesServerClient({ req, res });
  let { data: { user: authUser } } = await ssr.auth.getUser();
  // Support the same browser-session fallback as role switching for client
  // login paths whose SSR cookie has not been refreshed yet.
  if (!authUser) {
    const authorization = String(req.headers.authorization || "");
    const accessToken = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";
    if (accessToken) {
      const tokenResult = await getServiceSupabase().auth.getUser(accessToken);
      authUser = tokenResult.data.user;
    }
  }
  if (!authUser) throw Object.assign(new Error("Please sign in again"), { statusCode: 401 });

  const admin = getServiceSupabase();
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("id, company_id, full_name, email, role, active_role, is_active, avatar_url")
    .eq("id", authUser.id)
    .maybeSingle();
  if (callerError || !caller) throw Object.assign(new Error("Your staff profile could not be found"), { statusCode: 403 });

  const { data: callerDepartments, error: callerDepartmentsError } = await (admin as any)
    .from("user_departments")
    .select("user_id, department, is_primary")
    .eq("user_id", authUser.id);
  if (callerDepartmentsError) throw callerDepartmentsError;

  const callerRole = String(caller.active_role || caller.role || "");
  return { admin, authUser, caller, callerDepartments: (callerDepartments || []) as TeamRoleDepartmentRow[], callerRole };
}

function assertManagerAccess(context: Awaited<ReturnType<typeof getCompanyContext>>, department: Department) {
  const { caller, callerDepartments, callerRole } = context;
  if (!ADMIN_ROLES.has(callerRole) && !teamBucketsForUser(caller as any, callerDepartments).has(department)) {
    throw Object.assign(new Error(`Only the ${department} manager or an administrator can manage this team`), { statusCode: 403 });
  }
}

async function loadTeam(
  context: Awaited<ReturnType<typeof getCompanyContext>>,
  department: Department,
) {
  const { admin, caller } = context;
  const companyId = String(caller.company_id || "");
  if (!companyId) throw Object.assign(new Error("Your profile is not linked to a company"), { statusCode: 403 });

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, email, role, active_role, is_active, avatar_url")
    .eq("company_id", companyId)
    .neq("is_active", false)
    .is("deleted_at", null)
    .order("full_name", { ascending: true });
  if (profileError) throw profileError;

  const profileRows = (profiles || []) as Member[];
  const ids = profileRows.map((profile) => profile.id);
  const { data: departments } = ids.length
    ? await (admin as any).from("user_departments").select("user_id, department, is_primary").in("user_id", ids)
    : { data: [] };
  const departmentRows = (departments || []) as TeamRoleDepartmentRow[];
  const members = profileRows.filter((profile) => memberBelongsToDepartment(profile, departmentRows, department));
  const memberIds = members.map((member) => member.id);

  const statusByUser = new Map<string, { on_duty: boolean; started_at: string | null; shift_id: string | null; source: string }>();
  if (memberIds.length) {
    if (department === "cleaning") {
      const { data: logs, error } = await (admin as any)
        .from("cleaning_duty_logs")
        .select("id, user_id, duty_started_at, created_at")
        .eq("company_id", companyId)
        .eq("on_duty", true)
        .in("user_id", memberIds)
        .order("duty_started_at", { ascending: false });
      if (error) throw error;
      for (const row of logs || []) {
        if (!statusByUser.has(row.user_id)) statusByUser.set(row.user_id, {
          on_duty: true, started_at: row.duty_started_at || row.created_at, shift_id: row.id, source: "cleaning_duty_logs",
        });
      }
    } else {
      const { data: shifts, error } = await (admin as any)
        .from("kitchen_duty_shifts")
        .select("id, staff_id, shift_start")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .in("staff_id", memberIds)
        .order("shift_start", { ascending: false });
      if (error) throw error;
      for (const row of shifts || []) {
        if (!statusByUser.has(row.staff_id)) statusByUser.set(row.staff_id, {
          on_duty: true, started_at: row.shift_start, shift_id: row.id, source: "kitchen_duty_shifts",
        });
      }
    }
  }

  const { data: notes, error: notesError } = await (admin as any)
    .from("team_manager_notes")
    .select("id, department, author_id, member_user_id, note_date, body, created_at, updated_at")
    .eq("company_id", companyId)
    .eq("department", department)
    .order("note_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  // A not-yet-applied diary migration should be shown clearly in the UI,
  // while the roster and clock controls remain usable.
  if (notesError && !String(notesError.message || "").toLowerCase().includes("team_manager_notes")) throw notesError;
  const allPeople = new Map(profileRows.map((profile) => [profile.id, profile]));
  const noteRows = (notes || []).map((note: any) => ({
    ...note,
    author_name: allPeople.get(note.author_id)?.full_name || allPeople.get(note.author_id)?.email || "Manager",
    member_name: note.member_user_id ? (allPeople.get(note.member_user_id)?.full_name || allPeople.get(note.member_user_id)?.email || "Team member") : null,
  }));

  return {
    company_id: companyId,
    members: members.map((member) => ({
      ...member,
      status: statusByUser.get(member.id) || { on_duty: false, started_at: null, shift_id: null, source: null },
    })),
    notes: noteRows,
    diary_available: !notesError,
  };
}

async function handleClock(
  context: Awaited<ReturnType<typeof getCompanyContext>>,
  department: Department,
  memberId: string,
  action: "clock_in" | "clock_out",
) {
  const { admin, caller } = context;
  const team = await loadTeam(context, department);
  const member = team.members.find((candidate) => candidate.id === memberId);
  if (!member) throw Object.assign(new Error("That user is not an active member of this team"), { statusCode: 400 });
  const now = new Date().toISOString();
  let shiftId: string | null = null;

  if (department === "cleaning") {
    if (action === "clock_in") {
      if (member.status.on_duty) throw Object.assign(new Error(`${member.full_name || "This team member"} is already clocked in`), { statusCode: 409 });
      const { data, error } = await (admin as any).from("cleaning_duty_logs").insert({
        user_id: memberId, company_id: team.company_id, on_duty: true, duty_started_at: now,
      }).select("id").single();
      if (error) throw error;
      shiftId = data.id;
    } else {
      if (!member.status.on_duty || !member.status.shift_id) throw Object.assign(new Error(`${member.full_name || "This team member"} is already clocked out`), { statusCode: 409 });
      shiftId = member.status.shift_id;
      const { error } = await (admin as any).from("cleaning_duty_logs").update({ on_duty: false, duty_ended_at: now }).eq("id", shiftId).eq("company_id", team.company_id);
      if (error) throw error;
    }
  } else {
    if (action === "clock_in") {
      if (member.status.on_duty) throw Object.assign(new Error(`${member.full_name || "This team member"} is already clocked in`), { statusCode: 409 });
      const { data, error } = await (admin as any).from("kitchen_duty_shifts").insert({
        user_id: caller.id, staff_id: memberId, company_id: team.company_id, shift_start: now, is_active: true,
      }).select("id").single();
      if (error) throw error;
      shiftId = data.id;
    } else {
      if (!member.status.on_duty || !member.status.shift_id) throw Object.assign(new Error(`${member.full_name || "This team member"} is already clocked out`), { statusCode: 409 });
      shiftId = member.status.shift_id;
      const { error } = await (admin as any).from("kitchen_duty_shifts").update({ is_active: false, shift_end: now, updated_at: now }).eq("id", shiftId).eq("company_id", team.company_id);
      if (error) throw error;
    }
  }

  try {
    const actorName = caller.full_name || caller.email || "Your manager";
    await notificationService.createNotification({
      company_id: team.company_id,
      recipient_id: memberId,
      user_id: memberId,
      notification_type: `${department}_manager_${action}`,
      title: action === "clock_in" ? `${actorName} clocked you in` : `${actorName} clocked you out`,
      message: `${actorName} changed your ${department} duty status on your behalf.`,
      metadata: {
        acted_by_user_id: caller.id,
        acted_by_name: caller.full_name || caller.email || "Manager",
        action,
        department,
      },
      priority: "normal",
      link: department === "kitchen" ? "/team-portal/kitchen/duty" : "/team-portal/cleaning/dashboard",
      related_entity_type: `${department}_duty_shift`,
      related_entity_id: shiftId,
    } as any, admin);
  } catch (notificationError) {
    // The clock record is already valid; return a clear warning rather than
    // reporting a failed clock action when only notification delivery failed.
    console.warn("[team-management] staff notification failed:", notificationError);
  }

  return { ok: true, action, member_id: memberId, shift_id: shiftId };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const context = await getCompanyContext(req, res);
    const department = cleanDepartment(req.method === "GET" ? req.query.department : req.body?.department);
    if (!department) return res.status(400).json({ error: "Choose kitchen or cleaning" });
    assertManagerAccess(context, department);

    if (req.method === "GET") return res.status(200).json(await loadTeam(context, department));

    const action = text(req.body?.action, 30);
    if (action === "clock_in" || action === "clock_out") {
      const memberId = text(req.body?.member_id, 100);
      if (!memberId) return res.status(400).json({ error: "Choose a team member first" });
      return res.status(200).json(await handleClock(context, department, memberId, action));
    }
    if (action === "add_note") {
      const body = text(req.body?.body);
      const memberId = text(req.body?.member_id, 100) || null;
      const noteDate = text(req.body?.note_date, 20) || new Date().toISOString().slice(0, 10);
      if (!body) return res.status(400).json({ error: "Write a note before saving" });
      const team = await loadTeam(context, department);
      if (memberId && !team.members.some((member) => member.id === memberId)) {
        return res.status(400).json({ error: "That user is not an active member of this team" });
      }
      const { data, error } = await (context.admin as any).from("team_manager_notes").insert({
        company_id: team.company_id, department, author_id: context.caller.id,
        member_user_id: memberId, note_date: noteDate, body,
      }).select("id, department, author_id, member_user_id, note_date, body, created_at, updated_at").single();
      if (error) throw error;
      return res.status(201).json({ ok: true, note: data });
    }
    return res.status(400).json({ error: "Choose clock in, clock out, or add note" });
  } catch (error: any) {
    const status = Number(error?.statusCode) || 500;
    console.error("[admin/team-management] failed:", error);
    return res.status(status).json({ error: status === 500 ? (dbErrorMessage(error) || "We could not update the team") : (error?.message || "We could not update the team") });
  }
}

export default withApiLogging(handler);
