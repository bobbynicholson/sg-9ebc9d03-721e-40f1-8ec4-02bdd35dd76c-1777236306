import {
  dashboardRolesForOneOffTask,
  dashboardLabelForRoles,
  oneOffTaskNotificationLabel,
  rolesForOneOffTask,
  shiftTypesForOneOffTask,
} from "@/lib/dailyOperationsTaskTargets";

describe("one-off daily operations task audiences", () => {
  it("routes kitchen tasks to kitchen staff and kitchen shifts", () => {
    expect(rolesForOneOffTask("custom_kitchen")).toEqual(["kitchen_staff", "kitchen_manager"]);
    expect(dashboardRolesForOneOffTask("custom_kitchen")).toEqual(["kitchen_staff", "kitchen_manager"]);
    expect(shiftTypesForOneOffTask("custom_kitchen")).toEqual(["kitchen", "kitchen_and_cleaning"]);
    expect(dashboardLabelForRoles(rolesForOneOffTask("custom_kitchen"))).toBe("Kitchen only");
  });

  it("routes cleaning tasks to cleaning staff while displaying on both dashboards", () => {
    expect(rolesForOneOffTask("custom_cleaning")).toEqual(["cleaning_staff", "cleaning_manager"]);
    expect(dashboardRolesForOneOffTask("custom_cleaning")).toEqual([
      "kitchen_staff", "kitchen_manager", "cleaning_staff", "cleaning_manager",
    ]);
    expect(dashboardLabelForRoles(dashboardRolesForOneOffTask("custom_cleaning"))).toBe("Kitchen + cleaning");
    expect(shiftTypesForOneOffTask("custom_cleaning")).toEqual(["cleaning", "kitchen_and_cleaning"]);
    expect(dashboardLabelForRoles(rolesForOneOffTask("custom_cleaning"))).toBe("Cleaning only");
  });

  it("shares one task across both dashboards and team types", () => {
    expect(rolesForOneOffTask("custom_both")).toEqual([
      "kitchen_staff", "kitchen_manager", "cleaning_staff", "cleaning_manager",
    ]);
    expect(shiftTypesForOneOffTask("custom_both")).toEqual(["kitchen", "cleaning", "kitchen_and_cleaning"]);
    expect(dashboardRolesForOneOffTask("custom_both")).toEqual([
      "kitchen_staff", "kitchen_manager", "cleaning_staff", "cleaning_manager",
    ]);
    expect(dashboardLabelForRoles(rolesForOneOffTask("custom_both"))).toBe("Kitchen + cleaning");
    expect(oneOffTaskNotificationLabel("custom_both")).toBe("Shared task");
  });
});
