import {
  emailPreferenceForOperationalNotification,
  profileMatchesTargetRoles,
} from "@/lib/notificationAudience";

describe("notification audience routing", () => {
  it("routes operational assignments to the shared task email preference", () => {
    expect(emailPreferenceForOperationalNotification("chef_assigned", "Kitchen", "Prep order")).toBe("task_assigned");
    expect(emailPreferenceForOperationalNotification("kitchen_task_assigned", "Prep", "Do it")).toBe("task_assigned");
    expect(emailPreferenceForOperationalNotification("cleaning_task_assigned", "Cleaning", "Do it")).toBe("task_assigned");
    expect(emailPreferenceForOperationalNotification("driver_assigned", "Driver", "Go")).toBe("driver_assigned");
    expect(emailPreferenceForOperationalNotification("waiter_assigned", "Waiter", "Go")).toBeNull();
  });

  it("matches the active role before falling back to the legacy base role", () => {
    expect(profileMatchesTargetRoles({ role: "kitchen_staff", active_role: "waiter" }, ["waiter"])).toBe(true);
    expect(profileMatchesTargetRoles({ role: "kitchen_staff", active_role: "waiter" }, ["kitchen_staff"])).toBe(false);
    expect(profileMatchesTargetRoles({ role: "kitchen_staff", active_role: null }, ["kitchen_staff"])).toBe(true);
    expect(profileMatchesTargetRoles({ role: "driver", active_role: "driver" }, ["driver"])).toBe(true);
  });
});
