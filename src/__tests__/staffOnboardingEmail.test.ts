/** @jest-environment node */
import { sendStaffInviteEmail } from "@/lib/staffInviteEmail";
import { emailService } from "@/services/emailService";
jest.mock("@/services/emailService", () => ({ emailService: { sendEmailDetailed: jest.fn() } }));

describe("new-user onboarding and resend", () => {
  let admin: any, invitationQuery: any;
  const args = {
    email: "wilma@example.com", fullName: "Wilma Engelbrecht", role: "kitchen_manager",
    companyId: "company", userId: "user", invitedBy: "owner", baseUrl: "https://portal.example.com",
  };
  beforeEach(() => {
    jest.clearAllMocks();
    function query(data: unknown) {
      const q: any = { then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) };
      for (const method of ["select", "eq", "limit", "insert", "update"]) q[method] = jest.fn(() => q);
      q.maybeSingle = jest.fn(async () => ({ data, error: null }));
      return q;
    }
    invitationQuery = query(null);
    admin = {
      from: (table: string) => table === "staff_invitations" ? invitationQuery : query({ company_name: "Team", slug: "team" }),
      auth: { admin: { generateLink: jest.fn(async () => ({ data: { properties: { action_link: "https://auth.example/verify?token=fresh" } }, error: null })) } },
    };
    (emailService.sendEmailDetailed as jest.Mock).mockResolvedValue({ success: true });
  });
  it.each(["kitchen_manager", "kitchen_staff", "cleaning_manager", "shopping_staff", "driver", "admin", "company_admin"])("sends an activation link and tracks pending %s users", async (role) => {
    expect(await sendStaffInviteEmail(admin, { ...args, role })).toMatchObject({ emailed: true, via: "invite_link" });
    expect(invitationQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user", role, status: "pending" }));
    expect(admin.auth.admin.generateLink).toHaveBeenCalledWith({ type: "recovery", email: args.email, options: { redirectTo: "https://portal.example.com/auth/reset-password?invite=1" } });
    expect(emailService.sendEmailDetailed).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining("https://auth.example/verify?token=fresh"), companyId: "company", allowPlatformFallback: true, _client: admin,
    }));
  });
  it("resend renews the existing pending invitation instead of adding another", async () => {
    invitationQuery.maybeSingle.mockResolvedValue({ data: { id: "pending" }, error: null });
    await sendStaffInviteEmail(admin, args);
    expect(invitationQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: "pending", user_id: "user" }));
    expect(invitationQuery.insert).not.toHaveBeenCalled();
    expect(admin.auth.admin.generateLink).toHaveBeenCalledTimes(1);
  });
  it("does not claim an invitation was sent when activation-link generation fails", async () => {
    admin.auth.admin.generateLink.mockResolvedValue({ data: null, error: { message: "Link failed" } });
    expect(await sendStaffInviteEmail(admin, { ...args, tempPassword: "temporary" })).toMatchObject({ emailed: false, errorCode: "link_generation_failed" });
    expect(emailService.sendEmailDetailed).not.toHaveBeenCalled();
  });
  it("propagates provider failure so the admin sees retry rather than success", async () => {
    (emailService.sendEmailDetailed as jest.Mock).mockResolvedValue({ success: false, error_code: "resend_auth" });
    expect(await sendStaffInviteEmail(admin, args)).toMatchObject({ emailed: false, errorCode: "resend_auth" });
  });
});
