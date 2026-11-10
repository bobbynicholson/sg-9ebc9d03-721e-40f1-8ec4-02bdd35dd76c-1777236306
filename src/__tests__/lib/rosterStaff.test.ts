import {
  filterRosterStaff,
  resolveRosterProfileId,
  type RosterStaffProfile,
} from "@/lib/rosterStaff";

const profiles: RosterStaffProfile[] = [
  {
    id: "driver-id",
    full_name: "Callum Rogers",
    email: "shared@example.com",
    role: "driver",
    active_role: "driver",
  },
  {
    id: "kitchen-id",
    full_name: "Wilma Engelbrecht",
    email: "wilma@example.com",
    role: "kitchen_staff",
    active_role: "kitchen_manager",
  },
];

describe("kitchen roster staff links", () => {
  const eligibleProfiles = new Set(
    filterRosterStaff(profiles, [{ user_id: "kitchen-id", department: "kitchen_manager" }], "kitchen")
      .map((profile) => profile.id),
  );

  it("does not link a kitchen directory worker to an ineligible driver by email", () => {
    expect(
      resolveRosterProfileId(
        { linked_profile_id: null, email: " SHARED@example.com " },
        profiles,
        eligibleProfiles,
      ),
    ).toBeNull();
  });

  it("does not treat the currently selected portal as an assigned role", () => {
    const staleKitchenPortal = { ...profiles[0], active_role: "kitchen_manager" };

    expect(filterRosterStaff([staleKitchenPortal], [], "kitchen")).toEqual([]);
  });

  it("keeps every assigned department for a multi-role user even when another role is active", () => {
    const multiRoleDriver = profiles[0];
    const assignments = [
      { user_id: multiRoleDriver.id, department: "driver" },
      { user_id: multiRoleDriver.id, department: "kitchen_manager" },
      { user_id: multiRoleDriver.id, department: "cleaning_staff" },
    ];
    const kitchenEligible = new Set(
      filterRosterStaff([multiRoleDriver], assignments, "kitchen").map((profile) => profile.id),
    );
    const cleaningEligible = new Set(
      filterRosterStaff([multiRoleDriver], assignments, "cleaning").map((profile) => profile.id),
    );

    expect(kitchenEligible).toEqual(new Set([multiRoleDriver.id]));
    expect(cleaningEligible).toEqual(new Set([multiRoleDriver.id]));
    expect(resolveRosterProfileId(
      { linked_profile_id: multiRoleDriver.id, email: multiRoleDriver.email },
      [multiRoleDriver],
      kitchenEligible,
    )).toBe(multiRoleDriver.id);
    expect(resolveRosterProfileId(
      { linked_profile_id: multiRoleDriver.id, email: multiRoleDriver.email },
      [multiRoleDriver],
      cleaningEligible,
    )).toBe(multiRoleDriver.id);
  });

  it("links a unique email match only when the profile is kitchen-eligible", () => {
    expect(
      resolveRosterProfileId(
        { linked_profile_id: null, email: "WILMA@example.com" },
        profiles,
        eligibleProfiles,
      ),
    ).toBe("kitchen-id");
  });

  it("keeps a direct link to an ineligible profile from falling back by email", () => {
    expect(
      resolveRosterProfileId(
        { linked_profile_id: "driver-id", email: "wilma@example.com" },
        profiles,
        eligibleProfiles,
      ),
    ).toBeNull();
  });

  it("does not guess when multiple eligible profiles share an email", () => {
    const duplicateKitchenProfiles = [
      ...profiles,
      { ...profiles[1], id: "second-kitchen-id", full_name: "Kitchen Profile 2" },
    ];
    const eligible = new Set(["kitchen-id", "second-kitchen-id"]);

    expect(
      resolveRosterProfileId(
        { email: "wilma@example.com" },
        duplicateKitchenProfiles,
        eligible,
      ),
    ).toBeNull();
  });
});
