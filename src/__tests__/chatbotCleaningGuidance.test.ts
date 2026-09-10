import { normalizeChatMessage } from "@/lib/chatbot/intents/normalize";
import { getRelevantNavigation } from "@/lib/chatbot/navigation";
import { generateChatReply } from "@/server/chatbot/brain";
import { getLiveToolDefinition, selectLiveTools } from "@/server/chatbot/liveTools";

const cleaningIdentity = {
  userId: "cleaning-user",
  companyId: "company-1",
  role: "cleaning_staff",
  fullName: "Cleaning User",
  regionId: null,
  regionsCovered: [],
};

describe("cleaning assistant guidance", () => {
  it("exposes the complete cleaning read-only tool set and screens", () => {
    expect(getLiveToolDefinition("cleaning_supplies")?.roles).toContain("cleaning_staff");
    for (const question of ["show my cleaning supplies", "where is the washing procedure", "what is on my cleaning schedule", "show cleaning notifications", "which types of questions can I ask here"]) {
      expect(getRelevantNavigation(question, "cleaning_staff", 3).length).toBeGreaterThan(0);
    }
    expect(selectLiveTools("cleaning_staff", "show my cleaning supplies").some((tool) => tool.id === "cleaning_supplies")).toBe(true);
    expect(selectLiveTools("cleaning_staff", "show my cleaning jobs").some((tool) => tool.id === "cleaning_work_tasks")).toBe(true);
    expect(selectLiveTools("cleaning_staff", "what are my work hours").some((tool) => tool.id === "work_hours")).toBe(true);
  });

  it("covers every cleaning live-data capability for both roles", () => {
    const sharedTools = [
      "cleaning_equipment",
      "cleaning_supplies",
      "cleaning_damage_reports",
      "cleaning_schedules",
      "cleaning_work_tasks",
      "daily_operations_tasks",
      "user_notifications",
      "work_clock_status",
      "work_hours",
    ];
    for (const role of ["cleaning_staff", "cleaning_manager"]) {
      for (const toolId of sharedTools) {
        expect(getLiveToolDefinition(toolId as any)?.roles).toContain(role);
      }
    }
    for (const toolId of ["team_roster", "staff_shift_schedule"]) {
      expect(getLiveToolDefinition(toolId as any)?.roles).toContain("cleaning_manager");
    }
  });

  it.each([
    ["Which equipment has returned from an event?", "cleaning.dashboard.verification", "cleaning_equipment"],
    ["Which items are currently being washed?", "cleaning.equipment", "cleaning_work_tasks"],
    ["Which cleaning supplies are low?", "cleaning.supplies", "cleaning_supplies"],
    ["What is the washing procedure for glassware?", "cleaning.workflows", "cleaning_equipment"],
    ["Show my cleaning notifications", "cleaning.notifications", "user_notifications"],
    ["What cleaning settings are enabled?", "cleaning.settings", "company_profile"],
  ])("routes cleaning question %s to %s and %s", (question, ref, toolId) => {
    expect(getRelevantNavigation(question, "cleaning_staff", 3).map((item) => item.ref)).toContain(ref);
    expect(selectLiveTools("cleaning_staff", question).map((tool) => tool.id)).toContain(toolId);
  });

  it("keeps manager-only management navigation separate from staff navigation", () => {
    expect(getRelevantNavigation("Show cleaning team assignments and unassigned work", "cleaning_manager", 3).map((item) => item.ref))
      .toEqual(["cleaning.management"]);
    expect(getRelevantNavigation("Show cleaning team assignments and unassigned work", "cleaning_staff", 3).map((item) => item.ref))
      .not.toContain("cleaning.management");
  });

  it.each([
    "what are the clokcing and all is for here",
    "which retures are waiting for wwashiig",
    "chekc damaged items and who reported them",
    "show my clenaning schdule",
  ])("keeps typo-heavy cleaning questions useful: %s", (question) => {
    const navigation = getRelevantNavigation(question, "cleaning_staff", 3);
    const tools = selectLiveTools("cleaning_staff", question);
    expect(navigation.length).toBeGreaterThan(0);
    expect(tools.length).toBeGreaterThan(0);
  });

  it("uses Cleaning Schedules records instead of staff shifts", async () => {
    expect(selectLiveTools("cleaning_staff", "What is my cleaning schedule?").map((tool) => tool.id))
      .toEqual(["cleaning_schedules", "current_user_profile"]);
    expect(getRelevantNavigation("What is my cleaning schedule?", "cleaning_staff", 3).map((item) => item.ref))
      .toEqual(["cleaning.schedules"]);

    const answer = await generateChatReply({
      identity: cleaningIdentity,
      message: "What is my cleaning schedule?",
      history: [],
      liveContext: "LIVE AUTHORIZED TOOL RESULTS:\n" + JSON.stringify({
        cleaning_schedules: [
          { scheduled_date: "2026-09-12", scheduled_time: "09:30:00", area_name: "Glassware", frequency: "weekly", status: "scheduled" },
        ],
      }),
      knowledge: [],
      navigation: [],
    });

    expect(answer.rendered.title).toBe("Cleaning schedules");
    expect(answer.rendered.text).toContain("Glassware");
    expect(answer.rendered.text).toContain("2026-09-12");
    expect(answer.rendered.text).not.toContain("scheduled shifts");
  });

  it("keeps damage answers on Damage Reports and identifies the reporter", async () => {
    expect(getRelevantNavigation("Is there any damage and who did that?", "cleaning_staff", 3).map((item) => item.ref))
      .toEqual(["cleaning.damage"]);

    const answer = await generateChatReply({
      identity: cleaningIdentity,
      message: "Is there any damage and who did that?",
      history: [],
      liveContext: "LIVE AUTHORIZED TOOL RESULTS:\n" + JSON.stringify({
        cleaning_damage_reports: [
          { equipment_name: "Commercial blender", damage_type: "broken motor", reporter_name: "Cleaning Lisa", created_at: "2026-09-10T10:42:00.000Z", resolved: false },
        ],
      }),
      knowledge: [],
      navigation: [],
    });

    expect(answer.rendered.title).toBe("Damage reports");
    expect(answer.rendered.text).toContain("Commercial blender");
    expect(answer.rendered.text).toContain("Cleaning Lisa");
  });

  it("covers cleaning-manager team oversight with the manager screen", async () => {
    expect(getRelevantNavigation("Which cleaning staff are on duty?", "cleaning_manager", 3).map((item) => item.ref))
      .toEqual(["cleaning.management"]);
    expect(selectLiveTools("cleaning_manager", "Which cleaning staff are on duty?").some((tool) => ["team_roster", "work_clock_status", "work_hours"].includes(tool.id))).toBe(true);

    const answer = await generateChatReply({
      identity: { ...cleaningIdentity, role: "cleaning_manager" },
      message: "Which cleaning staff are on duty?",
      history: [],
      liveContext: "",
      knowledge: [],
      navigation: [],
    });
    expect(answer.rendered.title).toBe("Cleaning staff workflow");
    expect(answer.rendered.text.toLowerCase()).toContain("team management");
  });

  it("normalizes common cleaning-staff typos", () => {
    expect(normalizeChatMessage("what are the clokcing and all is for here")).toContain("clocking");
    expect(normalizeChatMessage("what are the retures and wwashiig here")).toContain("returns");
    expect(normalizeChatMessage("what are the retures and wwashiig here")).toContain("washing");
  });

  it.each([
    "what are the things you are providing for cleaner here",
    "what are the clokcing and all is for how it will use for here",
    "what are the retures and wwashiig here is for",
  ])("answers cleaning workflow question: %s", async (message) => {
    const answer = await generateChatReply({
      identity: cleaningIdentity,
      message,
      history: [],
      liveContext: "",
      knowledge: [],
      navigation: [],
    });

    expect(answer.provider).toBe("cleaning-guidance");
    expect(answer.rendered.title).toBe("Cleaning staff workflow");
    expect(answer.rendered.text.toLowerCase()).toContain("returns");
    expect(answer.rendered.text.toLowerCase()).toContain("washing");
    expect(answer.rendered.text.toLowerCase()).toContain("clock");
    expect(answer.rendered.text.toLowerCase()).toContain("damage");
  });
});
