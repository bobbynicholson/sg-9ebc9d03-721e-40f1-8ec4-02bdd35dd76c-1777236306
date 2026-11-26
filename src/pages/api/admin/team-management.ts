/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { notificationService } from "@/services/notificationService";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { UserRole } from "@/types/app";
import { accessRolesForUser, teamBucketsForUser, type TeamRoleDepartmentRow } from "@/lib/teamRoleBuckets";
import { mergeTeamDirectoryMemberships } from "@/lib/teamDirectoryMemberships";
import { beginRoleClock, endCurrentRoleClock, saveRoleHandoffNote } from "@/services/roleClockService";
import { kitchenStaffService } from "@/services/kitchenStaffService";
import { toZonedISO } from "@/lib/localDate";

type Department = "kitchen" | "cleaning" | "drivers";
type Member = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  active_role: string | null;
  avatar_url?: string | null;
  is_active: boolean | null;
  departments?: string[] | null;
};

const ADMIN_ROLES = new Set<string>([
  UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN,
  UserRole.REGION_ADMIN, UserRole.SALES_ADMIN, UserRole.ADMIN,
]);

function cleanDepartment(value: unknown): Department | null {
  return value === "kitchen" || value === "cleaning" || value === "drivers" ? value : null;
}

function text(value: unknown, max = 4000): string {
  return String(value || "").trim().slice(0, max);
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
  // Drivers do not have a distinct driver-manager role in this product yet.
  // Keep their team clock actions on the admin/supervisor surface instead of
  // letting any individual driver clock another driver out through the API.
  if (department === "drivers" && !ADMIN_ROLES.has(callerRole)) {
    throw Object.assign(new Error("Only an administrator can manage driver clocks"), { statusCode: 403 });
  }
  const managerRole = department === "kitchen" ? UserRole.KITCHEN_MANAGER : UserRole.CLEANING_MANAGER;
  const hasManagerRole = accessRolesForUser(caller as any, callerDepartments).includes(managerRole);
  if (department !== "drivers" && !ADMIN_ROLES.has(callerRole) && !hasManagerRole) {
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
  const { data: directoryRows, error: directoryError } = department === "drivers"
    ? { data: [], error: null }
    : await (admin as any)
      .from("kitchen_staff_members")
      .select("id, linked_profile_id, email, full_name, role_title, departments")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .contains("departments", [department])
      .is("deleted_at", null);
  if (directoryError) throw directoryError;
  const directoryMembers = (directoryRows || []) as Array<{
    id: string; linked_profile_id: string | null; email: string | null;
    full_name: string | null; role_title: string | null; departments: string[] | null;
  }>;
  const merged = mergeTeamDirectoryMemberships(profileRows, departmentRows, directoryMembers);
  const rosterProfiles = merged.profiles.filter((profile) =>
    teamBucketsForUser(profile, merged.departmentRows).has(department),
  ) as Array<Member & { departments?: string[] }>;
  const directoryByRosterId = new Map<string, typeof directoryMembers[number]>();
  for (const member of directoryMembers) {
    const identity = merged.directoryIdentity.get(member.id);
    if (identity) directoryByRosterId.set(identity.teamMemberId, member);
  }
  const profileRosterIds = rosterProfiles
    .filter((member) => !member.id.startsWith("staff-member:"))
    .map((member) => member.id);

  const statusByUser = new Map<string, {
    on_duty: boolean;
    started_at: string | null;
    shift_id: string | null;
    source: string | null;
    duty_shift_id: string | null;
    payroll_shift_id: string | null;
  }>();
  if (profileRosterIds.length) {
    if (department === "drivers") {
      const { data: shifts, error } = await (admin as any)
        .from("driver_shifts")
        .select("id, driver_id, actual_start")
        .eq("company_id", companyId)
        .in("driver_id", profileRosterIds)
        .is("actual_end", null)
        .is("deleted_at", null)
        .not("actual_start", "is", null)
        .order("actual_start", { ascending: false });
      if (error) throw error;
      for (const row of shifts || []) {
        if (!statusByUser.has(row.driver_id)) statusByUser.set(row.driver_id, {
          on_duty: true, started_at: row.actual_start, shift_id: row.id, source: "driver_shifts",
          duty_shift_id: null, payroll_shift_id: null,
        });
      }
    } else if (department === "cleaning") {
      const { data: logs, error } = await (admin as any)
        .from("cleaning_duty_logs")
        .select("id, user_id, duty_started_at, created_at")
        .eq("company_id", companyId)
        .eq("on_duty", true)
        .in("user_id", profileRosterIds)
        .order("duty_started_at", { ascending: false });
      if (error) throw error;
      for (const row of logs || []) {
        if (!statusByUser.has(row.user_id)) statusByUser.set(row.user_id, {
          on_duty: true, started_at: row.duty_started_at || row.created_at, shift_id: row.id, source: "cleaning_duty_logs",
          duty_shift_id: row.id, payroll_shift_id: null,
        });
      }
    } else {
      const { data: shifts, error } = await (admin as any)
        .from("kitchen_duty_shifts")
        .select("id, staff_id, shift_start")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .in("staff_id", profileRosterIds)
        .order("shift_start", { ascending: false });
      if (error) throw error;
      for (const row of shifts || []) {
        if (!statusByUser.has(row.staff_id)) statusByUser.set(row.staff_id, {
          on_duty: true, started_at: row.shift_start, shift_id: row.id, source: "kitchen_duty_shifts",
          duty_shift_id: row.id, payroll_shift_id: null,
        });
      }
    }
  }

  const directoryMemberIds = directoryMembers.map((member) => member.id);
  if (directoryMemberIds.length) {
    const { data: tabletShifts, error: tabletShiftError } = await (admin as any)
      .from("kitchen_staff_shifts")
      .select("id, staff_member_id, shift_start")
      .eq("company_id", companyId)
      .eq("department", department)
      .in("staff_member_id", directoryMemberIds)
      .is("shift_end", null)
      .is("deleted_at", null)
      .order("shift_start", { ascending: false });
    if (tabletShiftError) throw tabletShiftError;
    for (const row of tabletShifts || []) {
      const identity = merged.directoryIdentity.get(row.staff_member_id);
      if (!identity) continue;
      const existing = statusByUser.get(identity.teamMemberId);
      if (existing) {
        existing.payroll_shift_id = row.id;
        if (new Date(row.shift_start).getTime() < new Date(existing.started_at || row.shift_start).getTime()) {
          existing.started_at = row.shift_start;
        }
      } else {
        statusByUser.set(identity.teamMemberId, {
          on_duty: true,
          started_at: row.shift_start,
          shift_id: row.id,
          source: "kitchen_staff_shifts",
          duty_shift_id: null,
          payroll_shift_id: row.id,
        });
      }
    }
  }

  const { data: notes, error: notesError } = department === "drivers"
    ? { data: [], error: null }
    : await (admin as any)
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
    members: rosterProfiles.map((member) => {
      const directory = directoryByRosterId.get(member.id);
      const isDirectoryOnly = member.id.startsWith("staff-member:");
      return {
      ...member,
      full_name: member.full_name || directory?.full_name || (department === "drivers" ? "Driver" : "Cleaning / kitchen team member"),
      email: member.email || directory?.email || null,
      role: member.role || directory?.role_title || (department === "drivers" ? "driver" : `${department}_staff`),
      directory_only: isDirectoryOnly,
      staff_member_id: directory?.id || null,
      status: statusByUser.get(member.id) || {
        on_duty: false, started_at: null, shift_id: null, source: null,
        duty_shift_id: null, payroll_shift_id: null,
      },
    }; }),
    notes: noteRows,
    diary_available: !notesError,
  };
}

async function handleDriverClock(
  context: Awaited<ReturnType<typeof getCompanyContext>>,
  companyId: string,
  member: any,
  action: "clock_in" | "clock_out",
  note?: string,
) {
  const { admin, caller } = context;
  const driverId = String(member.id);
  const now = new Date();
  const nowIso = now.toISOString();
  const actorName = caller.full_name || caller.email || "A manager";

  const { data: openShifts, error: openError } = await (admin as any)
    .from("driver_shifts")
    .select("id, company_id, driver_id, shift_date, planned_start, actual_start, actual_end, notes, status")
    .eq("company_id", companyId)
    .eq("driver_id", driverId)
    .is("actual_end", null)
    .is("deleted_at", null)
    .not("actual_start", "is", null)
    .order("actual_start", { ascending: false })
    .limit(3);
  if (openError) throw openError;

  if (action === "clock_out") {
    if (!openShifts?.length) throw Object.assign(new Error(`${member.full_name || "This driver"} is already clocked out`), { statusCode: 409 });
    if (openShifts.length > 1) {
      throw Object.assign(new Error("This driver has multiple open shifts. Review them in Driver settlement before clocking out."), { statusCode: 409 });
    }
    const shift = openShifts[0];
    const suppliedNote = text(note);
    const closeNote = suppliedNote
      ? `Manager ${actorName} clocked this driver out: ${suppliedNote}`
      : `Manager ${actorName} clocked this driver out. No additional note supplied.`;
    const oldNotes = text(shift.notes, 3500);
    const patch = {
      actual_end: nowIso,
      status: "completed",
      notes: oldNotes ? `${oldNotes}\n\n${closeNote}` : closeNote,
    };
    const { data: closedRows, error } = await (admin as any)
      .from("driver_shifts")
      .update(patch)
      .eq("id", shift.id)
      .eq("company_id", companyId)
      .is("actual_end", null)
      .select("id");
    if (error) throw error;
    if (!closedRows?.length) throw Object.assign(new Error("The driver shift changed while you were clocking out. Refresh and try again."), { statusCode: 409 });

    // The payroll shift is authoritative. Keep the auxiliary role timer in
    // step when possible, but don't report a failed clock-out after the
    // driver's paid shift has already been closed.
    try {
      const { data: roleSessions, error: roleReadError } = await (admin as any)
        .from("role_work_sessions")
        .select("id")
        .eq("company_id", companyId)
        .eq("user_id", driverId)
        .eq("role", "driver")
        .is("ended_at", null);
      if (roleReadError) throw roleReadError;
      if (roleSessions?.length) {
        const { error: roleCloseError } = await (admin as any)
          .from("role_work_sessions")
          .update({ ended_at: nowIso, end_reason: "manual", end_note: closeNote })
          .in("id", roleSessions.map((row: any) => row.id))
          .is("ended_at", null);
        if (roleCloseError) throw roleCloseError;
      }
    } catch (roleError) {
      console.warn("[team-management] driver role clock close failed:", roleError);
    }

    try {
      const { error: auditError } = await (admin as any).from("audit_logs").insert({
        company_id: companyId,
        user_id: caller.id,
        action: "driver_shift_clocked_out_by_manager",
        entity_type: "driver_shift",
        entity_id: shift.id,
        details: { before: shift, patch },
      });
      if (auditError) console.warn("[team-management] driver clock-out audit write failed:", auditError);
    } catch (auditError) {
      console.warn("[team-management] driver clock-out audit write failed:", auditError);
    }
    try {
      await notificationService.createNotification({
        company_id: companyId,
        recipient_id: driverId,
        user_id: driverId,
        notification_type: "driver_clock_out",
        title: `${actorName} clocked you out`,
        message: `${actorName} ended your driver shift on your behalf.`,
        metadata: { acted_by_user_id: caller.id, acted_by_name: actorName, action, department: "drivers" },
        priority: "normal",
        link: "/team-portal/driver/dashboard",
        related_entity_type: "driver_shift",
        related_entity_id: shift.id,
      } as any, admin);
    } catch (notificationError) {
      console.warn("[team-management] driver clock-out notification failed:", notificationError);
    }
    return { ok: true, action, member_id: driverId, shift_id: shift.id };
  }

  if (openShifts?.length) throw Object.assign(new Error(`${member.full_name || "This driver"} is already clocked in`), { statusCode: 409 });

  const { data: company, error: companyError } = await (admin as any)
    .from("companies")
    .select("timezone")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) throw companyError;
  const shiftDate = toZonedISO(now, company?.timezone || "Africa/Johannesburg");

  // Reuse today's scheduled shift if there is one so planned hours, route
  // references and payroll all remain on the same row. Walk-in drivers get a
  // normal active shift, just as their own clock button creates.
  const { data: scheduledRows, error: scheduledError } = await (admin as any)
    .from("driver_shifts")
    .select("id, company_id, driver_id, shift_date, planned_start, actual_start, actual_end, notes, status")
    .eq("company_id", companyId)
    .eq("driver_id", driverId)
    .eq("shift_date", shiftDate)
    .eq("status", "scheduled")
    .is("actual_start", null)
    .is("actual_end", null)
    .is("deleted_at", null)
    .order("planned_start", { ascending: true })
    .limit(2);
  if (scheduledError) throw scheduledError;
  if ((scheduledRows || []).length > 1) {
    throw Object.assign(new Error("This driver has multiple scheduled shifts today. Review the roster before clocking in."), { statusCode: 409 });
  }

  let shiftId: string;
  let before: any = null;
  let patch: Record<string, unknown>;
  if (scheduledRows?.[0]) {
    before = scheduledRows[0];
    patch = { actual_start: nowIso, status: "active" };
    const { data: startedRows, error } = await (admin as any)
      .from("driver_shifts")
      .update(patch)
      .eq("id", before.id)
      .is("actual_start", null)
      .is("actual_end", null)
      .select("id");
    if (error) throw error;
    if (!startedRows?.length) throw Object.assign(new Error("The roster changed while you were clocking in. Refresh and try again."), { statusCode: 409 });
    shiftId = before.id;
  } else {
    patch = {
      company_id: companyId,
      driver_id: driverId,
      shift_date: shiftDate,
      actual_start: nowIso,
      status: "active",
      source: "manual",
      created_by_user_id: caller.id,
    };
    const { data: created, error } = await (admin as any)
      .from("driver_shifts")
      .insert(patch)
      .select("id")
      .single();
    if (error) throw error;
    shiftId = created.id;
  }

  try {
    const roleClock = await beginRoleClock({
      client: admin,
      companyId,
      userId: driverId,
      role: "driver",
      startedAt: nowIso,
    });
    if (roleClock.closed.length) {
      await saveRoleHandoffNote(
        roleClock.closed,
        `Manager ${actorName} clocked this driver into a shift. Previous work was automatically closed. No additional note supplied.`,
        admin,
      );
    }
  } catch (roleError) {
    // Avoid leaving an active payroll row if the shared role timer could not
    // be started. Restore a roster row or remove the walk-in row we created.
    if (before) {
      await (admin as any).from("driver_shifts").update({ actual_start: null, status: "scheduled" }).eq("id", shiftId).eq("actual_start", nowIso);
    } else {
      await (admin as any).from("driver_shifts").delete().eq("id", shiftId).eq("actual_end", null);
    }
    throw roleError;
  }

  try {
    const { error: auditError } = await (admin as any).from("audit_logs").insert({
      company_id: companyId,
      user_id: caller.id,
      action: "driver_shift_clocked_in_by_manager",
      entity_type: "driver_shift",
      entity_id: shiftId,
      details: { before, patch },
    });
    if (auditError) console.warn("[team-management] driver clock-in audit write failed:", auditError);
  } catch (auditError) {
    console.warn("[team-management] driver clock-in audit write failed:", auditError);
  }
  try {
    await notificationService.createNotification({
      company_id: companyId,
      recipient_id: driverId,
      user_id: driverId,
      notification_type: "driver_clock_in",
      title: `${actorName} clocked you in`,
      message: `${actorName} started your driver shift on your behalf.`,
      metadata: { acted_by_user_id: caller.id, acted_by_name: actorName, action, department: "drivers" },
      priority: "normal",
      link: "/team-portal/driver/dashboard",
      related_entity_type: "driver_shift",
      related_entity_id: shiftId,
    } as any, admin);
  } catch (notificationError) {
    console.warn("[team-management] driver clock-in notification failed:", notificationError);
  }
  return { ok: true, action, member_id: driverId, shift_id: shiftId };
}

async function handleClock(
  context: Awaited<ReturnType<typeof getCompanyContext>>,
  department: Department,
  memberId: string,
  action: "clock_in" | "clock_out",
  note?: string,
) {
  const { admin, caller } = context;
  const team = await loadTeam(context, department);
  const member = team.members.find((candidate) => candidate.id === memberId);
  if (!member) throw Object.assign(new Error("That user is not an active member of this team"), { statusCode: 400 });
  if (department === "drivers") return handleDriverClock(context, team.company_id, member, action, note);
  const memberIsManager = member.active_role === `${department}_manager` || member.role === `${department}_manager`;
  if (memberIsManager && action === "clock_in") {
    throw Object.assign(new Error(`A ${department} manager must use the manager work clock, not the ${department} staff clock`), { statusCode: 409 });
  }
  const now = new Date().toISOString();
  const closeNote = text(note) || "Manager clocked this person out. No additional note supplied.";
  let shiftId: string | null = null;
  let payrollShiftId: string | null = null;
  let dutyShiftId: string | null = null;

  if (action === "clock_in") {
    if (member.status.on_duty) throw Object.assign(new Error(`${member.full_name || "This team member"} is already clocked in`), { statusCode: 409 });
    const role = department;
    let roleSessionStarted = false;
    try {
      if (!member.directory_only) {
        const { data: existingRoleSession, error: existingRoleError } = await (admin as any)
          .from("role_work_sessions")
          .select("id")
          .eq("company_id", team.company_id)
          .eq("user_id", memberId)
          .is("ended_at", null)
          .maybeSingle();
        if (existingRoleError) throw existingRoleError;
        const roleClock = await beginRoleClock({
          client: admin,
          companyId: team.company_id,
          userId: memberId,
          role: role as any,
          startedAt: now,
        });
        roleSessionStarted = !!roleClock.sessionId && roleClock.sessionId !== existingRoleSession?.id;
        if (roleClock.closed.length > 0) {
          await saveRoleHandoffNote(
            roleClock.closed,
            `Manager clocked this person into ${department}; previous work was automatically closed. No additional note supplied.`,
            admin,
          );
        }
      }
      if (member.staff_member_id) {
        const shift = await kitchenStaffService.clockIn({
          companyId: team.company_id,
          staffMemberId: member.staff_member_id,
          clockedInBy: caller.id,
          overrideStartAt: now,
          department,
          client: admin,
        });
        payrollShiftId = shift.id;
      }
      if (!member.directory_only) {
        if (department === "cleaning") {
          const { data, error } = await (admin as any).from("cleaning_duty_logs").insert({
            user_id: memberId, company_id: team.company_id, on_duty: true, duty_started_at: now,
          }).select("id").single();
          if (error) throw error;
          dutyShiftId = data.id;
        } else {
          const { data, error } = await (admin as any).from("kitchen_duty_shifts").insert({
            user_id: caller.id, staff_id: memberId, company_id: team.company_id, shift_start: now, is_active: true,
          }).select("id").single();
          if (error) throw error;
          dutyShiftId = data.id;
        }
        if (memberIsManager) {
          const { error } = await (admin as any).from("profiles").update({
            manager_working: true,
            manager_working_since: now,
          }).eq("id", memberId).eq("company_id", team.company_id);
          if (error) throw error;
        }
      }
    } catch (error) {
      // If a second clock write fails, remove only rows created by this
      // request so the next manager retry starts from a clean state.
      if (payrollShiftId) await (admin as any).from("kitchen_staff_shifts").delete().eq("id", payrollShiftId).is("shift_end", null);
      if (dutyShiftId && department === "kitchen") await (admin as any).from("kitchen_duty_shifts").delete().eq("id", dutyShiftId).eq("company_id", team.company_id);
      if (dutyShiftId && department === "cleaning") await (admin as any).from("cleaning_duty_logs").delete().eq("id", dutyShiftId).eq("company_id", team.company_id);
      if (roleSessionStarted) {
        await endCurrentRoleClock({ client: admin, companyId: team.company_id, userId: memberId, role: role as any, endedAt: now, reason: "manual", note: "Clock-in rolled back because a department clock could not be saved." });
      }
      throw error;
    }
    shiftId = payrollShiftId || dutyShiftId;
  } else if (department === "cleaning") {
    if (!member.status.on_duty || !member.status.shift_id) throw Object.assign(new Error(`${member.full_name || "This team member"} is already clocked out`), { statusCode: 409 });
    shiftId = member.status.shift_id;
    dutyShiftId = member.status.duty_shift_id || (member.status.source === "cleaning_duty_logs" ? member.status.shift_id : null);
    payrollShiftId = member.status.payroll_shift_id || (member.status.source === "kitchen_staff_shifts" ? member.status.shift_id : null);
    if (!payrollShiftId && member.staff_member_id) {
      // Older manager clocks wrote only the duty table. Carry that original
      // start time into payroll before closing it so hours are not lost.
      const recovered = await kitchenStaffService.clockIn({
        companyId: team.company_id,
        staffMemberId: member.staff_member_id,
        clockedInBy: caller.id,
        overrideStartAt: member.status.started_at || now,
        manualOverride: true,
        overrideReason: `Recovered from legacy ${department} duty clock started at ${member.status.started_at || now}.`,
        department,
        client: admin,
      });
      payrollShiftId = recovered.id;
    }
    if (dutyShiftId) {
      const { error } = await (admin as any).from("cleaning_duty_logs").update({
        on_duty: false,
        duty_ended_at: now,
        duty_end_reason: "manual",
        duty_end_note: closeNote,
      }).eq("id", dutyShiftId).eq("company_id", team.company_id).eq("on_duty", true);
      if (error) throw error;
    }
    if (payrollShiftId) {
      await kitchenStaffService.clockOut({ shiftId: payrollShiftId, clockedOutBy: caller.id, overrideEndAt: now, notes: closeNote, client: admin });
    }
    if (!member.directory_only) {
      if (memberIsManager) {
        await endCurrentRoleClock({ client: admin, companyId: team.company_id, userId: memberId, role: "cleaning_manager", endedAt: now, reason: "manual", note: closeNote });
      }
      await endCurrentRoleClock({ client: admin, companyId: team.company_id, userId: memberId, role: "cleaning", endedAt: now, reason: "manual", note: closeNote });
      if (memberIsManager) {
        const { error } = await (admin as any).from("profiles").update({ manager_working: false, manager_working_since: null }).eq("id", memberId).eq("company_id", team.company_id);
        if (error) throw error;
      }
    }
  } else {
    if (!member.status.on_duty || !member.status.shift_id) throw Object.assign(new Error(`${member.full_name || "This team member"} is already clocked out`), { statusCode: 409 });
    shiftId = member.status.shift_id;
    dutyShiftId = member.status.duty_shift_id || (member.status.source === "kitchen_duty_shifts" ? member.status.shift_id : null);
    payrollShiftId = member.status.payroll_shift_id || (member.status.source === "kitchen_staff_shifts" ? member.status.shift_id : null);
    if (!payrollShiftId && member.staff_member_id) {
      // Older manager clocks wrote only the duty table. Carry that original
      // start time into payroll before closing it so hours are not lost.
      const recovered = await kitchenStaffService.clockIn({
        companyId: team.company_id,
        staffMemberId: member.staff_member_id,
        clockedInBy: caller.id,
        overrideStartAt: member.status.started_at || now,
        manualOverride: true,
        overrideReason: `Recovered from legacy ${department} duty clock started at ${member.status.started_at || now}.`,
        department,
        client: admin,
      });
      payrollShiftId = recovered.id;
    }
    if (dutyShiftId) {
      const { error } = await (admin as any).from("kitchen_duty_shifts").update({
        is_active: false,
        shift_end: now,
        updated_at: now,
        end_reason: "manual",
        end_note: closeNote,
      }).eq("id", dutyShiftId).eq("company_id", team.company_id).eq("is_active", true);
      if (error) throw error;
    }
    if (payrollShiftId) {
      await kitchenStaffService.clockOut({ shiftId: payrollShiftId, clockedOutBy: caller.id, overrideEndAt: now, notes: closeNote, client: admin });
    }
    if (!member.directory_only) {
      if (memberIsManager) {
        await endCurrentRoleClock({ client: admin, companyId: team.company_id, userId: memberId, role: "kitchen_manager", endedAt: now, reason: "manual", note: closeNote });
      }
      await endCurrentRoleClock({ client: admin, companyId: team.company_id, userId: memberId, role: "kitchen", endedAt: now, reason: "manual", note: closeNote });
      if (memberIsManager) {
        const { error } = await (admin as any).from("profiles").update({ manager_working: false, manager_working_since: null }).eq("id", memberId).eq("company_id", team.company_id);
        if (error) throw error;
      }
    }
  }

  try {
    const actorName = caller.full_name || caller.email || "Your manager";
    if (!member.directory_only) await notificationService.createNotification({
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
    if (!department) return res.status(400).json({ error: "Choose kitchen, cleaning, or drivers" });
    assertManagerAccess(context, department);

    if (req.method === "GET") return res.status(200).json(await loadTeam(context, department));

    const action = text(req.body?.action, 30);
    if (action === "clock_in" || action === "clock_out") {
      const memberId = text(req.body?.member_id, 100);
      if (!memberId) return res.status(400).json({ error: "Choose a team member first" });
      return res.status(200).json(await handleClock(context, department, memberId, action, req.body?.note));
    }
    if (action === "add_note") {
      if (department === "drivers") return res.status(400).json({ error: "Driver team notes are not enabled here" });
      const body = text(req.body?.body);
      const memberId = text(req.body?.member_id, 100) || null;
      const noteDate = text(req.body?.note_date, 20) || new Date().toISOString().slice(0, 10);
      if (!body) return res.status(400).json({ error: "Write a note before saving" });
      const team = await loadTeam(context, department);
      if (memberId && !team.members.some((member) => member.id === memberId && !member.directory_only)) {
        return res.status(400).json({ error: "That user is not an active member of this team" });
      }
      const { data, error } = await (context.admin as any).from("team_manager_notes").insert({
        company_id: team.company_id, department, author_id: context.caller.id,
        member_user_id: memberId, note_date: noteDate, body,
      }).select("id, department, author_id, member_user_id, note_date, body, created_at, updated_at").single();
      if (error) throw error;
      return res.status(201).json({ ok: true, note: data });
    }
    return res.status(400).json({ error: "Choose clock in, clock out, or add a team note" });
  } catch (error: any) {
    const status = Number(error?.statusCode) || 500;
    console.error("[admin/team-management] failed:", error);
    return res.status(status).json({ error: status === 500 ? (dbErrorMessage(error) || "We could not update the team") : (error?.message || "We could not update the team") });
  }
}

export default withApiLogging(handler);
