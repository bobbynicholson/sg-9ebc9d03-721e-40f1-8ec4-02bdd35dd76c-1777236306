import { CHAT_ACCESS_ROLE_DETAILS, CHAT_ACCESS_ROLES } from "@/server/chatbot/accessPolicy";
import { getLiveToolDefinition, getLiveToolsForRole, LIVE_TOOL_DEFINITIONS, runLiveTool, selectLiveTools } from "@/server/chatbot/liveTools";
import { getRelevantWorkflows } from "@/lib/chatbot/workflows";
import { getRelevantNavigation } from "@/lib/chatbot/navigation";
import { generateChatReply } from "@/server/chatbot/brain";
import { buildRoleContext } from "@/lib/chatbot/roleContext";

describe("chatbot live-data policy catalog", () => {
  it("documents every tool and keeps every role in the access matrix", () => {
    expect(LIVE_TOOL_DEFINITIONS.length).toBeGreaterThan(0);
    expect(new Set(LIVE_TOOL_DEFINITIONS.map((tool) => tool.id)).size).toBe(LIVE_TOOL_DEFINITIONS.length);

    for (const tool of LIVE_TOOL_DEFINITIONS) {
      expect(tool.dataScope.trim()).not.toBe("");
      expect(tool.roles.length).toBeGreaterThan(0);
      expect(tool.roles.every((role) => (CHAT_ACCESS_ROLES as readonly string[]).includes(role))).toBe(true);
    }

    for (const role of CHAT_ACCESS_ROLES) {
      expect(CHAT_ACCESS_ROLE_DETAILS[role]).toBeDefined();
      expect(getLiveToolsForRole(role).length).toBeGreaterThan(0);
    }
  });

  it("grounds owner customer questions in company-scoped live data", () => {
    const selected = selectLiveTools("owner", "What's our active customers?");
    expect(selected.some((tool) => tool.id === "customer_summary")).toBe(true);
    expect(selected.some((tool) => tool.id === "registered_companies")).toBe(false);
    expect(selected.some((tool) => tool.id === "active_subscription_plans")).toBe(false);
  });

  it("selects the canonical current-subscription tool for company plan questions", () => {
    const selected = selectLiveTools("owner", "What is our current subscription?");
    expect(selected.some((tool) => tool.id === "company_subscription")).toBe(true);
    expect(selected[0]?.id).toBe("company_subscription");
  });

  it("keeps platform company tools unavailable to company roles", () => {
    expect(getLiveToolDefinition("registered_companies")?.roles).toEqual(["super_admin"]);
    expect(getLiveToolDefinition("platform_user_count")?.roles).toEqual(["super_admin"]);
    expect(getLiveToolDefinition("platform_company_owners")?.roles).toEqual(["super_admin"]);
    expect(getLiveToolDefinition("active_subscription_plans")?.roles).toEqual(["super_admin"]);
    expect(getLiveToolsForRole("owner").some((tool) => tool.id === "registered_companies")).toBe(false);
    expect(getLiveToolsForRole("owner").some((tool) => tool.id === "platform_user_count")).toBe(false);
    expect(getLiveToolsForRole("owner").some((tool) => tool.id === "active_subscription_plans")).toBe(false);
  });

  it("documents the company-admin owner and platform boundary", () => {
    const context = buildRoleContext("company_admin");
    expect(context).toContain("Do not reveal the company owner's private profile");
    expect(context).toContain("Do not provide platform-wide company information");
  });

  it("returns a policy response before a provider can answer an unauthorized request", async () => {
    const answer = await generateChatReply({
      identity: { userId: "admin-1", companyId: "company-1", role: "company_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "Which companies are currently on trial?",
      history: [],
      liveContext: 'LIVE AUTHORIZED TOOL RESULTS:\n{"company_profile":{"company_name":"My Company"}}',
      knowledge: [],
      navigation: [],
    });

    expect(answer.provider).toBe("role-policy");
    expect(answer.rendered.title).toBe("Access scope");
    expect(answer.rendered.message).toContain("only provide information for your company");
  });

  it("does not expose owner private details to a company admin", async () => {
    const answer = await generateChatReply({
      identity: { userId: "admin-1", companyId: "company-1", role: "company_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "What is the owner's email?",
      history: [],
      liveContext: 'LIVE AUTHORIZED TOOL RESULTS:\n{"team_members":[{"full_name":"Owner","email":"owner@example.com","role":"owner"}]}',
      knowledge: [],
      navigation: [],
    });

    expect(answer.provider).toBe("role-policy");
    expect(answer.rendered.message).not.toContain("owner@example.com");
    expect(answer.rendered.message).toContain("private information");
  });

  it("keeps the platform-wide owner list out of a company admin workspace", async () => {
    const answer = await generateChatReply({
      identity: { userId: "admin-1", companyId: "company-1", role: "company_admin", fullName: "Company Admin", regionId: null, regionsCovered: [] },
      message: "Show all company owners.",
      history: [],
      liveContext: 'LIVE AUTHORIZED TOOL RESULTS:\n{"team_members":[{"full_name":"Company Admin","role":"company_admin"}]}',
      knowledge: [],
      navigation: [],
    });

    expect(answer.provider).toBe("role-policy");
    expect(answer.rendered.message).toContain("full company-owner list is available to the platform owner");
    expect(answer.rendered.message).not.toContain("Callum Rogers");
  });

  it("resolves guided process steps to role-approved destinations", () => {
    const examples = [
      ["How do I work a new lead through to an invoice?", "company_admin"],
      ["What is the kitchen production process?", "kitchen_staff"],
      ["What is the restock process?", "shopping_staff"],
      ["What is the delivery process?", "driver"],
      ["How do I complete the equipment return process?", "cleaning_manager"],
      ["What happens next with my event?", "client"],
      ["How do I manage assistant tool permissions?", "owner"],
    ] as const;

    for (const [question, role] of examples) {
      const workflow = getRelevantWorkflows(question, role, 1)[0];
      expect(workflow?.steps.length).toBeGreaterThanOrEqual(2);
      expect(workflow?.steps.every((step) => step.ref && step.href.startsWith("/"))).toBe(true);
    }
  });

  it("selects and answers the platform-wide registered-company question", async () => {
    const selected = selectLiveTools("super_admin", "How many companies are currently registered?");
    expect(selected.some((tool) => tool.id === "registered_companies")).toBe(true);
    expect(selectLiveTools("super_admin", "How many users are on the platform?")[0]?.id).toBe("platform_user_count");
    expect(selectLiveTools("super_admin", "Which subscription plans are active?").some((tool) => tool.id === "active_subscription_plans")).toBe(true);

    const builder = {
      select: () => builder,
      is: () => builder,
      limit: async () => ({
        data: [
          { id: "company-1", company_name: "Active Caterers", subscription_status: "active", is_active: true },
          { id: "company-2", company_name: "Trial Caterers", subscription_status: "trial", is_active: true },
        ],
        count: 2,
        error: null,
      }),
    };
    const result = await runLiveTool(
      { from: () => builder },
      { userId: "user-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      getLiveToolDefinition("registered_companies")!,
      "How many companies are currently registered?",
    );

    expect(result).toMatchObject({ total: 2, active: 1, trial: 1, trialCompanies: ["Trial Caterers"] });

    const singularAnswer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "Show registered company",
      history: [],
      liveContext: "PLATFORM COMPANY SUMMARY: 2 registered companies",
      knowledge: [],
      navigation: [{ ref: "platform.company-database", label: "Company records", href: "/admin/platform/company-database", description: "Platform-wide company records", keywords: ["registered companies"] }],
    });
    expect(singularAnswer.provider).toBe("live-data");
    expect(singularAnswer.rendered.message).toContain("2 registered companies");
  });

  it("answers a platform overview only from approved live metrics", async () => {
    const selected = selectLiveTools("super_admin", "Give me a complete platform overview.");
    expect(selected.map((tool) => tool.id)).toEqual(["platform_dashboard_metrics", "current_user_profile"]);

    const answer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "Give me a complete platform overview.",
      history: [],
      liveContext: 'PLATFORM AUTHORIZED CONTEXT:\n{"platform_dashboard_metrics":{"totalCompanies":1,"activeCompanies":1,"trialCompanies":0,"cancelledCompanies":0,"monthlyRecurringRevenue":0,"churnRate":0,"conversionRate":100}}',
      knowledge: [{ id: "sample", source: "old-guidance", content: "Registered companies: 42", score: 0.9 }],
      navigation: [{ ref: "platform.dashboard", label: "Platform dashboard", href: "/admin/platform/dashboard", description: "Cross-company platform health and performance overview", keywords: ["platform overview"] }],
    });

    expect(answer.provider).toBe("live-data");
    expect(answer.rendered.message).toContain("current platform overview");
    expect(answer.rendered.details.join(" ")).toContain("Registered companies: 1");
    expect(answer.rendered.details.join(" ")).not.toContain("42");
  });

  it("resolves supported currencies from live region and rate records", async () => {
    const regionBuilder: any = {
      select: () => regionBuilder,
      eq: () => regionBuilder,
      limit: async () => ({ data: [{ currency: "ZAR" }, { currency: "USD" }], error: null }),
    };
    const rateBuilder: any = {
      select: () => rateBuilder,
      eq: () => rateBuilder,
      order: () => rateBuilder,
      limit: () => rateBuilder,
      maybeSingle: async () => ({
        data: { usd_to_zar_rate: 16.2, eur_to_zar_rate: 18.5, gbp_to_zar_rate: null },
        error: null,
      }),
    };
    const result = await runLiveTool(
      { from: (table: string) => table === "regions" ? regionBuilder : rateBuilder },
      { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      getLiveToolDefinition("supported_currencies")!,
      "Which currencies are supported?",
    );

    expect(result.currencies.map((currency: any) => currency.code)).toEqual(["EUR", "USD", "ZAR"]);
    expect(result.currencies.find((currency: any) => currency.code === "EUR")).toMatchObject({ name: "Euro" });
    expect(result.currencies.find((currency: any) => currency.code === "GBP")).toBeUndefined();
  });

  it("renders the supported-currency answer only from the authorized live result", async () => {
    const answer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "Which currencies are supported?",
      history: [],
      liveContext: `LIVE AUTHORIZED TOOL RESULTS:\n${JSON.stringify({ supported_currencies: { source: "test records", currencies: [{ code: "XXX", name: "Test Currency", symbol: "¤" }] } })}`,
      knowledge: [{ id: "old", source: "old-guidance", content: "USD, EUR, GBP", score: 0.9 }],
      navigation: [{ ref: "platform.currency-monitoring", label: "Currency monitoring", href: "/admin/platform/currency-monitoring", description: "Monitor currencies", keywords: ["currencies"] }],
    });

    expect(answer.provider).toBe("live-data");
    expect(answer.rendered.message).toContain("live configuration");
    expect(answer.rendered.details.join(" ")).toContain("XXX");
    expect(answer.rendered.details.join(" ")).not.toContain("USD");
  });

  it("routes latest-rate and threshold questions to their dedicated live tools", () => {
    expect(selectLiveTools("super_admin", "What are the latest exchange rates?")[0]?.id)
      .toBe("platform_latest_exchange_rates");
    expect(selectLiveTools("super_admin", "Are any currency thresholds exceeded?")[0]?.id)
      .toBe("platform_currency_thresholds");
  });

  it("reads latest exchange-rate pairs dynamically from the newest stored row", async () => {
    const builder: any = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({
        data: { date: "2026-08-30", usd_to_zar_rate: 16.2, eur_to_zar_rate: 18.4, custom_to_zar_rate: 99 },
        error: null,
      }),
    };
    const result = await runLiveTool(
      { from: () => builder },
      { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      getLiveToolDefinition("platform_latest_exchange_rates")!,
      "What are the latest exchange rates?",
    );

    expect(result.date).toBe("2026-08-30");
    expect(result.rates).toEqual([
      { from: "EUR", to: "ZAR", rate: 18.4, date: "2026-08-30" },
      { from: "USD", to: "ZAR", rate: 16.2, date: "2026-08-30" },
    ]);
  });

  it("renders latest rates and threshold status as readable live data", async () => {
    const latestAnswer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "What are the latest exchange rates?",
      history: [],
      liveContext: `LIVE AUTHORIZED TOOL RESULTS:\n${JSON.stringify({ platform_latest_exchange_rates: { date: "2026-08-30", rates: [{ from: "USD", to: "ZAR", rate: 16.2, date: "2026-08-30" }] } })}`,
      knowledge: [{ id: "old", source: "old-guidance", content: "Supported currencies: USD, EUR, GBP", score: 0.9 }],
      navigation: [{ ref: "platform.currency-monitoring", label: "Currency monitoring", href: "/admin/platform/currency-monitoring", description: "Monitor currencies", keywords: ["exchange rates"] }],
    });
    expect(latestAnswer.provider).toBe("live-data");
    expect(latestAnswer.rendered.title).toBe("Latest exchange rates");
    expect(latestAnswer.rendered.details.join(" ")).toContain("USD to ZAR: 16.2");
    expect(latestAnswer.rendered.details.join(" ")).not.toContain("Supported currencies");
    expect(latestAnswer.text).not.toContain("[object Object]");

    const thresholdAnswer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "Are any currency thresholds exceeded?",
      history: [],
      liveContext: `LIVE AUTHORIZED TOOL RESULTS:\n${JSON.stringify({ platform_currency_thresholds: { pair: "USD/ZAR", thresholdPercent: 15, reviewRequired: false, percentageChange: 3.25, startDate: "2026-06-01", endDate: "2026-08-30" } })}`,
      knowledge: [],
      navigation: [{ ref: "platform.currency-monitoring", label: "Currency monitoring", href: "/admin/platform/currency-monitoring", description: "Monitor currencies", keywords: ["threshold"] }],
    });
    expect(thresholdAnswer.provider).toBe("live-data");
    expect(thresholdAnswer.rendered.title).toBe("Currency threshold status");
    expect(thresholdAnswer.rendered.message).toContain("No currency review threshold is exceeded");
    expect(thresholdAnswer.text).not.toContain("[object Object]");
  });

  it("routes technology-cost questions to the platform cost model", async () => {
    expect(selectLiveTools("super_admin", "What are our current technology costs?")[0]?.id)
      .toBe("platform_technology_costs");
    expect(selectLiveTools("super_admin", "Which companies have the highest infrastructure cost?")[0]?.id)
      .toBe("platform_technology_costs");
    expect(selectLiveTools("super_admin", "Find the most expensive tenants and open Tech-stack Costs.")[0]?.id)
      .toBe("platform_technology_costs");

    const answer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "What are our current technology costs?",
      history: [],
      liveContext: `LIVE AUTHORIZED TOOL RESULTS:\n${JSON.stringify({ platform_technology_costs: { tenantCount: 3, activeTenantCount: 2, trialTenantCount: 1, monthlyCostUsd: 101.2, monthlyCostZar: 1639.44, averageCostPerTenantZar: 546.48, subscriptionRevenueZar: 4000, marginZar: 2360.56, marginPercent: 59.014, costByService: [{ service: "Vercel hosting", monthlyZar: 321.8 }], as_of: "2026-08-30T00:00:00.000Z" } })}`,
      knowledge: [{ id: "old", source: "old-guidance", content: "Technology costs are $1,245,000", score: 0.9 }],
      navigation: [{ ref: "platform.tech-costs", label: "Tech-stack costs", href: "/admin/platform/tech-costs", description: "Technology costs and margin", keywords: ["technology costs"] }],
    });
    expect(answer.provider).toBe("live-data");
    expect(answer.rendered.title).toBe("Technology costs");
    expect(answer.rendered.details.join(" ")).toMatch(/ZAR 1[\s\u00a0]639,44/);
    expect(answer.rendered.details.join(" ")).not.toContain("1,245,000");
    expect(answer.text).not.toContain("[object Object]");

    const rankingAnswer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "Find the most expensive tenants and open Tech-stack Costs.",
      history: [],
      liveContext: `LIVE AUTHORIZED TOOL RESULTS:\n${JSON.stringify({ platform_technology_costs: { tenantCount: 1, activeTenantCount: 1, trialTenantCount: 0, monthlyCostUsd: 62.12, monthlyCostZar: 1000.70, averageCostPerTenantZar: 1000.70, subscriptionRevenueZar: null, marginZar: null, marginPercent: null, costByService: [], as_of: "2026-08-30T00:00:00.000Z" } })}`,
      knowledge: [],
      navigation: [{ ref: "platform.tech-costs", label: "Tech-stack costs", href: "/admin/platform/tech-costs", description: "Technology costs and margin", keywords: ["technology costs"] }],
    });
    expect(rankingAnswer.provider).toBe("live-data");
    expect(rankingAnswer.rendered.details.join(" ")).toContain("cannot name the most expensive company");
    expect(rankingAnswer.rendered.details.join(" ")).not.toContain("most expensive by default");

    expect(selectLiveTools("super_admin", "Which invitations are still pending?")[0]?.id)
      .toBe("platform_pending_invitations");
    const invitationsAnswer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "Which invitations are still pending?",
      history: [],
      liveContext: `PLATFORM AUTHORIZED CONTEXT:\n${JSON.stringify({ platform_pending_invitations: { total: 1, pending: [{ name: "New Staff", email: "new@example.com", companyName: "Spit Braai Delivery" }] } })}`,
      knowledge: [],
      navigation: [
        { ref: "platform.user-management.pending-invitations", label: "Pending invitations", href: "/admin/platform/user-management?status=pending#pending-invitations", description: "Pending invitations", keywords: ["pending invitations"] },
        { ref: "platform.user-management", label: "Platform user management", href: "/admin/platform/user-management", description: "All users", keywords: ["users"] },
      ],
    });
    expect(invitationsAnswer.provider).toBe("live-data");
    expect(invitationsAnswer.rendered.title).toBe("Pending invitations");
    expect(invitationsAnswer.rendered.message).toContain("1 pending invitation");
    expect(invitationsAnswer.rendered.details.join(" ")).toContain("New Staff");
  });

  it("answers payment-setup questions from the live company-health check", async () => {
    expect(selectLiveTools("super_admin", "Are there any payment issues?")[0]?.id)
      .toBe("platform_tenant_health");
    expect(selectLiveTools("super_admin", "Is there a payment issue?")[0]?.id)
      .toBe("platform_tenant_health");

    const noIssuesAnswer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "Are there any payment issues?",
      history: [],
      liveContext: `LIVE AUTHORIZED TOOL RESULTS:\n${JSON.stringify({ platform_tenant_health: { tracked: 1, stuckOnboarding: [], noPaymentGateway: [] } })}`,
      knowledge: [{ id: "old", source: "old-guidance", content: "Open Payment issues to continue.", score: 0.9 }],
      navigation: [{ ref: "platform.tenant-health.payment-issues", label: "Payment issues", href: "/admin/platform/tenant-health#payment-issues", description: "Review payment setup issues", keywords: ["payment issues"] }],
    });
    expect(noIssuesAnswer.provider).toBe("live-data");
    expect(noIssuesAnswer.rendered.title).toBe("Payment issues");
    expect(noIssuesAnswer.rendered.message).toBe("No companies currently have a payment setup issue.");
    expect(noIssuesAnswer.rendered.details.join(" ")).toContain("No onboarded company is currently missing an active payment connection.");
    expect(noIssuesAnswer.rendered.message).not.toContain("Open Payment issues to continue");
    expect(noIssuesAnswer.rendered.details.join(" ")).not.toContain("Open Payment issues to continue");

    const issuesAnswer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "Which companies have payment issues?",
      history: [],
      liveContext: `LIVE AUTHORIZED TOOL RESULTS:\n${JSON.stringify({ platform_tenant_health: { tracked: 2, stuckOnboarding: [], noPaymentGateway: [{ id: "company-2", name: "Example Catering", slug: "example-catering" }] } })}`,
      knowledge: [],
      navigation: [{ ref: "platform.tenant-health.payment-issues", label: "Payment issues", href: "/admin/platform/tenant-health#payment-issues", description: "Review payment setup issues", keywords: ["payment issues"] }],
    });
    expect(issuesAnswer.provider).toBe("live-data");
    expect(issuesAnswer.rendered.message).toContain("1 company whose payment setup needs attention");
    expect(issuesAnswer.rendered.details.join(" ")).toContain("[Example Catering](/admin/platform/company-database?company=company-2)");
  });

  it("routes role-specific access questions to AI Access and explains defaults", async () => {
    expect(selectLiveTools("super_admin", "Can I allow kitchen staff to access inventory?").map((tool) => tool.id))
      .toEqual(["platform_ai_access", "current_user_profile"]);
    expect(selectLiveTools("super_admin", "Can I allow cleaning staff to access equipment data?").map((tool) => tool.id))
      .toEqual(["platform_ai_access", "current_user_profile"]);

    const answer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "Can I allow kitchen staff to access inventory?",
      history: [],
      liveContext: `PLATFORM AUTHORIZED CONTEXT:\n${JSON.stringify({ platform_ai_access: { roles: [], note: "Named, read-only tools" } })}`,
      knowledge: [],
      navigation: [{ ref: "platform.ai-access.role-controls", label: "Role controls", href: "/admin/ai-brain/access#role-access-controls", description: "Review assistant access by role", keywords: ["role controls"] }],
    });

    expect(answer.provider).toBe("live-data");
    expect(answer.rendered.title).toBe("Kitchen staff access");
    expect(answer.rendered.message).toContain("Yes");
    expect(answer.rendered.message).toContain("Kitchen staff");
    expect(answer.rendered.details.join(" ")).toContain("built-in role rules apply");
    expect(answer.rendered.details.join(" ")).toContain("read-only");

    const cleaningAnswer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "Can I allow cleaning staff to access equipment data?",
      history: [],
      liveContext: `PLATFORM AUTHORIZED CONTEXT:\n${JSON.stringify({ platform_ai_access: { roles: [], note: "Named, read-only tools" } })}`,
      knowledge: [],
      navigation: [{ ref: "platform.ai-access.role-controls", label: "Role controls", href: "/admin/ai-brain/access#role-access-controls", description: "Review assistant access by role", keywords: ["role controls"] }],
    });

    expect(cleaningAnswer.provider).toBe("live-data");
    expect(cleaningAnswer.rendered.title).toBe("Cleaning staff access");
    expect(cleaningAnswer.rendered.message).toContain("Yes");
    expect(cleaningAnswer.rendered.message).toContain("equipment");
    expect(cleaningAnswer.rendered.details.join(" ")).toContain("built-in role rules apply");

    expect(selectLiveTools("owner", "Can I allow cleaning staff to access equipment data?").map((tool) => tool.id))
      .toEqual(["company_ai_access", "current_user_profile"]);
    const companyAnswer = await generateChatReply({
      identity: { userId: "owner-1", companyId: "company-1", role: "owner", fullName: "Owner", regionId: null, regionsCovered: [] },
      message: "Can I allow cleaning staff to access equipment data?",
      history: [],
      liveContext: `LIVE AUTHORIZED TOOL RESULTS:\n${JSON.stringify({ company_ai_access: { roles: [], note: "Named, read-only tools" } })}`,
      knowledge: [],
      navigation: [{ ref: "admin.ai-brain.access.role-controls", label: "Role controls", href: "/admin/ai-brain/access#role-access-controls", description: "Review company assistant access by role", keywords: ["role controls"] }],
    });
    expect(companyAnswer.provider).toBe("live-data");
    expect(companyAnswer.rendered.message).toContain("Yes");
    expect(companyAnswer.rendered.details.join(" ")).toContain("built-in role rules apply");

    const staffAnswer = await generateChatReply({
      identity: { userId: "cleaner-1", companyId: "company-1", role: "cleaning_staff", fullName: "Cleaner", regionId: null, regionsCovered: [] },
      message: "Can I allow cleaning staff to access equipment data?",
      history: [],
      liveContext: "",
      knowledge: [],
      navigation: [{ ref: "admin.ai-brain.access.role-controls", label: "Role controls", href: "/admin/ai-brain/access#role-access-controls", description: "Review company assistant access by role", keywords: ["role controls"] }],
    });
    expect(staffAnswer.provider).toBe("policy");
    expect(staffAnswer.rendered.message).toContain("Only the company owner or a company administrator");
  });

  it("uses the company list when a platform owner asks to switch views", async () => {
    const selected = selectLiveTools("super_admin", "Switch to that company's admin view.");
    expect(selected.map((tool) => tool.id)).toEqual(["registered_companies", "current_user_profile"]);

    const answer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "Switch to that company's admin view.",
      history: [],
      liveContext: 'PLATFORM AUTHORIZED CONTEXT:\n{"registered_companies":{"companies":[{"name":"Spit Braai Delivery","slug":"spit-braai-delivery","status":"active"}]}}',
      knowledge: [],
      navigation: [{ ref: "platform.company-database", label: "Company records", href: "/admin/platform/company-database", description: "Platform-wide company records", keywords: ["company records"] }],
    });

    expect(answer.provider).toBe("live-data");
    expect(answer.rendered.message).toContain("Which company");
    expect(answer.rendered.details.join(" ")).toContain("[Spit Braai Delivery](/spit-braai-delivery/admin/dashboard)");

    expect(selectLiveTools("super_admin", "Find a company, show its subscription, and open its tenant view.").map((tool) => tool.id))
      .toEqual(["registered_companies", "current_user_profile"]);
    const tenantWorkflowAnswer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "Find a company, show its subscription, and open its tenant view.",
      history: [],
      liveContext: 'PLATFORM AUTHORIZED CONTEXT:\n{"registered_companies":{"companies":[{"name":"Spit Braai Delivery","slug":"spit-braai-delivery","status":"active"}]}}',
      knowledge: [],
      navigation: [{ ref: "platform.company-database", label: "Company records", href: "/admin/platform/company-database", description: "Platform-wide company records", keywords: ["company records"] }],
    });
    expect(tenantWorkflowAnswer.provider).toBe("workflow");
    expect(tenantWorkflowAnswer.rendered.title).toBe("Choose a company");
    expect(tenantWorkflowAnswer.rendered.details.join(" ")).toContain("[Spit Braai Delivery](/spit-braai-delivery/admin/dashboard)");
  });

  it("reports only controls and tags that are visible on the current page", async () => {
    const controlsAnswer = await generateChatReply({
      identity: { userId: "owner-1", companyId: "company-1", role: "owner", fullName: "Owner", regionId: null, regionsCovered: [] },
      message: "What actions are available on this page?",
      history: [],
      liveContext: "LIVE AUTHORIZED TOOL RESULTS:\n{}",
      knowledge: [],
      navigation: [],
      frontend: {
        pathname: "/admin/orders",
        controls: [{ label: "Refresh orders", kind: "button" }, { label: "Search orders", kind: "input" }],
        tags: ["Confirmed", "Ready"],
        sections: [],
      },
    });
    expect(controlsAnswer.provider).toBe("frontend-context");
    expect(controlsAnswer.rendered.details.join(" ")).toContain("Refresh orders; Search orders");
    expect(controlsAnswer.rendered.details.join(" ")).not.toContain("Export orders");

    const tagsAnswer = await generateChatReply({
      identity: { userId: "owner-1", companyId: "company-1", role: "owner", fullName: "Owner", regionId: null, regionsCovered: [] },
      message: "Which tags are visible here?",
      history: [],
      liveContext: "LIVE AUTHORIZED TOOL RESULTS:\n{}",
      knowledge: [],
      navigation: [],
      frontend: { pathname: "/admin/orders", controls: [], tags: ["Confirmed", "Ready"], sections: [] },
    });
    expect(tagsAnswer.provider).toBe("frontend-context");
    expect(tagsAnswer.rendered.details.join(" ")).toContain("Confirmed; Ready");
  });

  it("counts platform users from the same records shown in user management", async () => {
    const builder = {
      select: () => builder,
      limit: async () => ({
        data: [
          { id: "user-1", is_active: true },
          { id: "user-2", is_active: true },
          { id: "user-3", is_active: false },
        ],
        count: 3,
        error: null,
      }),
    };
    const result = await runLiveTool(
      { from: () => builder },
      { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      getLiveToolDefinition("platform_user_count")!,
      "How many users are on the platform?",
    );

    expect(result).toMatchObject({ total: 3, active: 2 });
  });

  it("answers the platform user-count question from approved live data", async () => {
    const answer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "How many users are on the platform?",
      history: [],
      liveContext: 'PLATFORM AUTHORIZED CONTEXT:\nPLATFORM USER SUMMARY: 3 users are currently listed.\n{"platform_user_count":{"total":3}}',
      knowledge: [],
      navigation: [{ ref: "platform.user-management", label: "Platform user management", href: "/admin/platform/user-management", description: "Manage user access across companies", keywords: ["users"] }],
    });

    expect(answer.provider).toBe("live-data");
    expect(answer.rendered.message).toContain("3 user accounts");
  });

  it("answers company-owner questions from linked company records", async () => {
    const selected = selectLiveTools("super_admin", "Show all company owners.");
    expect(selected.map((tool) => tool.id)).toEqual(["platform_company_owners", "current_user_profile"]);

    const answer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "Show all company owners.",
      history: [],
      liveContext: 'PLATFORM AUTHORIZED CONTEXT:\n{"platform_company_owners":{"total":1,"owners":[{"companyId":"company-1","companyName":"Spit Braai Delivery","ownerName":"Bobby Whitcher"}]}}',
      knowledge: [],
      navigation: [{ ref: "platform.company-database", label: "Company records", href: "/admin/platform/company-database", description: "Platform-wide company records", keywords: ["owners"] }],
    });

    expect(answer.provider).toBe("live-data");
    expect(answer.rendered.message).toContain("1 company owner");
    expect(answer.rendered.details.join(" ")).toContain("Bobby Whitcher");
    expect(answer.rendered.details.join(" ")).toContain("/admin/platform/company-database?company=company-1");
    expect(answer.rendered.details.join(" ")).not.toContain("Emily Carter");
  });

  it("answers an owner subscription question from company-scoped data without a provider", async () => {
    const answer = await generateChatReply({
      identity: { userId: "owner-1", companyId: "company-1", role: "owner", fullName: "Owner", regionId: null, regionsCovered: [] },
      message: "Which subscription plans are active?",
      history: [],
      liveContext: 'LIVE AUTHORIZED TOOL RESULTS:\n{"company_profile":{"subscription_plan":"Growth","subscription_status":"active"}}',
      knowledge: [],
      navigation: [{ ref: "admin.subscription", label: "Subscription", href: "/admin/subscription", description: "Review the current company subscription", keywords: ["subscription", "plan"] }],
    });

    expect(answer.provider).toBe("live-data");
    expect(answer.rendered.message).toContain("Growth");
    expect(answer.rendered.details.join(" ")).toContain("active");
  });

  it("does not attach unrelated navigation to a company subscription answer", () => {
    const navigation = getRelevantNavigation("Which subscription plans are active?", "owner", 3);
    expect(navigation.map((item) => item.ref)).toEqual(["admin.subscription"]);
  });

  it("answers an owner customer question from company-scoped data without a provider", async () => {
    const answer = await generateChatReply({
      identity: { userId: "owner-1", companyId: "company-1", role: "owner", fullName: "Owner", regionId: null, regionsCovered: [] },
      message: "What's our active customers?",
      history: [],
      liveContext: 'LIVE AUTHORIZED TOOL RESULTS:\n{"customer_summary":{"total":3,"active":2,"inactive":1,"activeCustomers":["A Caterer","B Events"]}}',
      knowledge: [],
      navigation: [{ ref: "admin.contacts", label: "Contacts", href: "/admin/contacts", description: "Clients and contact records", keywords: ["customers"] }],
    });

    expect(answer.provider).toBe("live-data");
    expect(answer.rendered.message).toContain("2 active customers");
    expect(answer.rendered.details.join(" ")).toContain("3 customer records");
  });

  it("applies platform audit categories and date filters to the live query", async () => {
    const calls: string[] = [];
    const rows = [
      { id: "audit-1", created_at: "2026-08-30T10:00:00.000Z", action: "user_soft_deleted", entity_type: "user", entity_id: "user-1", user_id: "admin-1", company_id: "company-1", details: {} },
    ];
    const builder: any = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      or: (value: string) => { calls.push(`or:${value}`); return builder; },
      eq: (column: string, value: string) => { calls.push(`eq:${column}=${value}`); return builder; },
      gte: (column: string) => { calls.push(`gte:${column}`); return builder; },
      lt: (column: string) => { calls.push(`lt:${column}`); return builder; },
      then: (resolve: (value: any) => void) => resolve({ data: rows, error: null }),
    };
    const result = await runLiveTool(
      { from: () => builder },
      { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      getLiveToolDefinition("platform_audit_events")!,
      "When was this user deactivated in the last 7 days?",
    );

    expect(result).toMatchObject({ filter: "user_deactivation", totalReturned: 1 });
    expect(calls).toContain("eq:entity_type=user");
    expect(calls.some((call) => call.startsWith("or:action.ilike.%deactivat"))).toBe(true);
    expect(calls).toContain("gte:created_at");
    expect(calls).toContain("lt:created_at");
  });

  it("renders platform audit results with the matching category", async () => {
    const answer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "When was this user deactivated?",
      history: [],
      liveContext: `PLATFORM AUTHORIZED CONTEXT:\n${JSON.stringify({ platform_audit_events: { filter: "user_deactivation", events: [{ id: "audit-1", occurredAt: "2026-07-30T12:44:00.000Z", action: "user_soft_deleted", entityType: "user", entityId: "user-1" }] } })}`,
      knowledge: [],
      navigation: [{ ref: "platform.audit-logs.filters.user", label: "User audit filter", href: "/admin/platform/audit-logs?entityType=user&since=all#platform-audit-filters", description: "User audit filter", keywords: ["user audit"] }],
    });

    expect(answer.provider).toBe("live-data");
    expect(answer.rendered.title).toBe("Recent User deactivation changes");
    expect(answer.rendered.message).toContain("matching user deactivation activity record");
    expect(answer.rendered.details.join(" ")).toContain("user soft deleted");
  });

  it("does not guess a current plan when the company record is unavailable", async () => {
    const answer = await generateChatReply({
      identity: { userId: "owner-1", companyId: "company-1", role: "owner", fullName: "Owner", regionId: null, regionsCovered: [] },
      message: "What is our current subscription?",
      history: [],
      liveContext: "LIVE AUTHORIZED TOOL RESULTS:\n{}",
      knowledge: [{ id: "old", source: "old-guidance", content: "The default plan is Growth.", score: 0.9 }],
      navigation: [{ ref: "admin.subscription", label: "Subscription", href: "/admin/subscription", description: "Review the current company subscription", keywords: ["subscription", "plan"] }],
      route: { route: "hybrid", useKnowledge: true, useLiveData: true, explanation: "Current company subscription information." },
    });

    expect(answer.provider).toBe("grounded-fallback");
    expect(answer.rendered.message).toContain("current information");
    expect(answer.rendered.message).not.toContain("Growth");
  });

  it("returns a readable grounded fallback when every model provider fails", async () => {
    const answer = await generateChatReply({
      identity: { userId: "owner-1", companyId: "company-1", role: "owner", fullName: "Owner", regionId: null, regionsCovered: [] },
      message: "What is our current order status?",
      history: [],
      liveContext: "LIVE AUTHORIZED TOOL RESULTS:\n{}",
      knowledge: [],
      navigation: [{ ref: "admin.orders", label: "Orders", href: "/admin/orders", description: "Confirmed bookings and order status", keywords: ["orders"] }],
      route: { route: "live_data", useKnowledge: false, useLiveData: true, explanation: "Current information." },
    });

    expect(answer.provider).toBe("grounded-fallback");
    expect(answer.rendered.message).toContain("current information");
  });

  it("does not hallucinate that a quote was saved in Gmail drafts", async () => {
    const answer = await generateChatReply({
      identity: { userId: "platform-1", companyId: null, role: "super_admin", fullName: "Admin", regionId: null, regionsCovered: [] },
      message: "I sent a quote, but email says it is in Gmail draft. Please check.",
      history: [],
      liveContext: "LIVE AUTHORIZED CONTEXT: no company selected",
      knowledge: [],
      navigation: [],
      route: { route: "action_request", useKnowledge: true, useLiveData: false, explanation: "The request asks about a quote email." },
    });

    expect(answer.provider).toBe("built-in");
    expect(answer.rendered.message).toContain("configured email sender");
    expect(answer.rendered.message).not.toContain("currently in the Gmail draft folder");
    expect(answer.rendered.details.join(" ")).toContain("No company workspace is selected");
  });
});
