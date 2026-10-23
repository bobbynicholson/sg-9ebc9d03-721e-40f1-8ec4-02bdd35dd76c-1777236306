/** @jest-environment node */
import { notifyAdminOfEmbedLead } from "@/lib/embed/notifyAdminOfEmbedLead";

const send = jest.fn().mockResolvedValue(true);
jest.mock("@/services/emailService", () => ({ emailService: { sendEmail: (...args: unknown[]) => send(...args) } }));
jest.mock("@/services/email/templateResolver", () => ({
  resolveEmailTemplate: async () => ({ subject: "New enquiry", bodyHtml: "Name: Jane\nGuests: 25" }),
}));

function client() {
  return { from: (table: string) => {
    const query: any = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: table === "companies"
        ? { company_name: "Catering company", slug: "catering-company", currency: "ZAR" }
        : { id: "owner", email: "office@example.test" } }),
      in: async () => ({ data: [{ id: "owner" }] }),
      insert: async () => ({ error: null }),
    };
    return query;
  } };
}

const input = {
  companyId: "company", ownerUserId: "owner", regionId: null, leadId: "lead-1",
  leadInsert: { client_name: "Jane", client_email: "jane@example.test", guest_count: 25 },
  formName: "Website enquiry", formId: "form-1", formNotifyAdminEmail: true,
  appOrigin: "https://temporary-deploy.vercel.app",
};

afterEach(() => { jest.restoreAllMocks(); send.mockClear(); });

it("uses the stable tenant app URL for a production form alert, never the deployment hostname", async () => {
  jest.replaceProperty(process, "env", { ...process.env, NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "", NEXT_PUBLIC_SITE_URL: "", VERCEL_PROJECT_PRODUCTION_URL: "", VERCEL_URL: "temporary-deploy.vercel.app" });
  await notifyAdminOfEmbedLead(client(), input);
  expect(send).toHaveBeenCalledTimes(1);
  const payload = send.mock.calls[0][0];
  expect(payload.body).toContain('href="https://cateringms.com/catering-company/admin/leads?leadId=lead-1"');
  expect(payload.body).not.toContain("vercel.app");
  expect(payload).toMatchObject({ to: "office@example.test", automationKey: "embed_lead_admin_email", skipBrandedShell: true });
});

it("preserves an explicitly configured app domain and normalises its trailing path", async () => {
  jest.replaceProperty(process, "env", { ...process.env, NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://app.example.test/some/path/" });
  await notifyAdminOfEmbedLead(client(), input);
  expect(send.mock.calls[0][0].variables.leadLink).toBe("https://app.example.test/catering-company/admin/leads?leadId=lead-1");
});

it("uses the configured public site domain when APP_URL is unset", async () => {
  jest.replaceProperty(process, "env", { ...process.env, NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "", NEXT_PUBLIC_SITE_URL: "https://cateringms.com/", NEXT_PUBLIC_VERCEL_URL: "temporary-deploy.vercel.app" });
  await notifyAdminOfEmbedLead(client(), input);
  expect(send.mock.calls[0][0].variables.leadLink).toBe("https://cateringms.com/catering-company/admin/leads?leadId=lead-1");
});

it("keeps the local form origin available during development", async () => {
  jest.replaceProperty(process, "env", { ...process.env, NODE_ENV: "development", NEXT_PUBLIC_APP_URL: "", NEXT_PUBLIC_SITE_URL: "", VERCEL_URL: "", NEXT_PUBLIC_VERCEL_URL: "" });
  await notifyAdminOfEmbedLead(client(), { ...input, appOrigin: "http://localhost:3001" });
  expect(send.mock.calls[0][0].variables.leadLink).toBe("http://localhost:3001/catering-company/admin/leads?leadId=lead-1");
});

it("respects the form's email-off control", async () => {
  await notifyAdminOfEmbedLead(client(), { ...input, formNotifyAdminEmail: false });
  expect(send).not.toHaveBeenCalled();
});
