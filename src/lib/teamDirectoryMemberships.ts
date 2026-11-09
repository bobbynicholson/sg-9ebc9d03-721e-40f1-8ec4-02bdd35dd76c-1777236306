import {
  teamBucketForRole,
  type TeamRoleDepartmentRow,
  type TeamRoleProfile,
} from "@/lib/teamRoleBuckets";

export interface TeamDirectoryMember {
  id: string;
  linked_profile_id?: string | null;
  email?: string | null;
  departments?: string[] | null;
}

type EmailProfile = TeamRoleProfile & { email?: string | null };

/**
 * Combine portal role assignments with the tablet staff directory's team
 * assignments. A directory record linked to a profile adds any missing team
 * memberships to that profile; an unlinked record becomes one team member of
 * its own. Other directory departments are intentionally ignored here.
 */
export function mergeTeamDirectoryMemberships<T extends EmailProfile>(
  profiles: T[],
  departmentRows: TeamRoleDepartmentRow[],
  directoryMembers: TeamDirectoryMember[],
) {
  const mergedProfiles: Array<T | TeamRoleProfile> = [...profiles];
  const mergedDepartmentRows = [...departmentRows];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const profileByEmail = new Map<string, T>();
  for (const profile of profiles) {
    const email = profile.email?.trim().toLowerCase();
    if (email) profileByEmail.set(email, profile);
  }

  const directoryIdentity = new Map<string, { teamMemberId: string; profileId: string | null }>();
  for (const member of directoryMembers) {
    const departments = Array.from(new Set(
      (member.departments || [])
        .map((department) => teamBucketForRole(department))
        .filter((bucket): bucket is "kitchen" | "cleaning" => bucket === "kitchen" || bucket === "cleaning"),
    ));
    if (departments.length === 0) continue;

    const linkedProfile = (member.linked_profile_id && profileById.get(member.linked_profile_id)) ||
      (member.email ? profileByEmail.get(member.email.trim().toLowerCase()) : undefined);
    if (linkedProfile) {
      for (const department of departments) {
        const alreadyAssigned = mergedDepartmentRows.some((row) =>
          row.user_id === linkedProfile.id && teamBucketForRole(row.department) === department,
        );
        const profileAlreadyInTeam = teamBucketForRole(linkedProfile.role) === department ||
          teamBucketForRole(linkedProfile.active_role) === department;
        if (!alreadyAssigned && !profileAlreadyInTeam) {
          mergedDepartmentRows.push({ user_id: linkedProfile.id, department });
        }
      }
      directoryIdentity.set(member.id, { teamMemberId: linkedProfile.id, profileId: linkedProfile.id });
    } else {
      const id = `staff-member:${member.id}`;
      mergedProfiles.push({ id, departments });
      directoryIdentity.set(member.id, { teamMemberId: id, profileId: null });
    }
  }

  return {
    profiles: mergedProfiles,
    departmentRows: mergedDepartmentRows,
    directoryIdentity,
  };
}
