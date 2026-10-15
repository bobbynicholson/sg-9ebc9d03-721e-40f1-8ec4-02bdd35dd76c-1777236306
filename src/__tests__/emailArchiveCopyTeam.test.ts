/** @jest-environment node */
/**
 * "Copy outgoing emails to": every client email is copied; each team
 * email reaches the archive mailbox once, not once per staff member.
 */
import { claimTeamArchiveCopy, emailService, releaseTeamArchiveCopy } from "@/services/emailService";

function profiles(rows: Array<{ company_id: string; email: string; role: string }>, fail = false) {
  return {
    from: jest.fn(() => {
      const filters: Array<(r: any) => boolean> = [];
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
        ilike: (k: string, v: string) => {
          const want = v.replace(/\\([%_\\])/g, "$1").toLowerCase();
          filters.push((r) => String(r[k]).toLowerCase() === want);
          return q;
        },
        limit: async () => (fail
          ? { data: null, error: { message: "offline" } }
          : { data: rows.filter((r) => filters.every((f) => f(r))), error: null }),
      };
      return q;
    }),
  };
}

const team = profiles([
  { company_id: "co-1", email: "hello@spitbraai.co.za", role: "company_admin" },
  { company_id: "co-1", email: "admin@spitbraai.co.za", role: "admin" },
  { company_id: "co-1", email: "kitchen1@spitbraai.co.za", role: "kitchen_staff" },
  { company_id: "co-1", email: "kitchen2@spitbraai.co.za", role: "kitchen_staff" },
  { company_id: "co-1", email: "client@example.com", role: "client" },
]);

let n = 0;
const copy = async (recipientEmail: string, subject: string, client: any = team) =>
  (await emailService.shouldSendArchiveCopy({ companyId: "co-1", recipientEmail, archiveEmail: "hello@spitbraai.co.za", subject, client })).copy;

describe("archive copy of team emails", () => {
  it("copies every client email", async () => {
    const subject = `Your invoice ${++n}`;
    expect(await copy("client@example.com", subject)).toBe(true);
    expect(await copy("client@example.com", subject)).toBe(true);
    expect(await copy("new.lead@example.com", subject)).toBe(true);
  });

  it("copies the same staff email once, not once per staff member", async () => {
    const subject = `Daily task: Daily kitchen clean ${++n}`;
    const results = await Promise.all([copy("kitchen1@spitbraai.co.za", subject), copy("kitchen2@spitbraai.co.za", subject)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await copy("kitchen1@spitbraai.co.za", `Daily task: Something else ${n}`)).toBe(true);
  });

  it("does not copy admin alerts when the archive mailbox is an admin (it gets them directly)", async () => {
    expect(await copy("admin@spitbraai.co.za", `Event tomorrow: ORD-1 ${++n}`)).toBe(false);
  });

  it("counts the archive mailbox's own email as its copy", () => {
    const subject = `Prep for tomorrow ${++n}`;
    expect(claimTeamArchiveCopy("co-1", subject)).toBe(true);
    expect(claimTeamArchiveCopy("co-1", subject)).toBe(false);
  });

  it("copies the same subject again after 30 minutes, and per company", () => {
    const subject = `Daily task: window ${++n}`;
    const t0 = 1_000_000;
    expect(claimTeamArchiveCopy("co-1", subject, t0)).toBe(true);
    expect(claimTeamArchiveCopy("co-1", subject, t0 + 29 * 60_000)).toBe(false);
    expect(claimTeamArchiveCopy("co-2", subject, t0 + 29 * 60_000)).toBe(true);
    expect(claimTeamArchiveCopy("co-1", subject, t0 + 31 * 60_000)).toBe(true);
  });

  it("gives the copy back when the send that took it fails", async () => {
    const subject = `Daily task: provider down ${++n}`;
    const first = await emailService.shouldSendArchiveCopy({ companyId: "co-1", recipientEmail: "kitchen1@spitbraai.co.za", archiveEmail: "hello@spitbraai.co.za", subject, client: team });
    expect(first).toEqual({ copy: true, claimed: true });
    releaseTeamArchiveCopy("co-1", subject); // what emailService does when that send fails
    expect(await copy("kitchen2@spitbraai.co.za", subject)).toBe(true);
    expect(await copy("kitchen1@spitbraai.co.za", subject)).toBe(false);
  });

  it("keeps the copy when the team lookup fails", async () => {
    expect(await copy("kitchen1@spitbraai.co.za", `Lookup down ${++n}`, profiles([], true))).toBe(true);
    expect(await emailService.companyTeamRole(null, "kitchen1@spitbraai.co.za", team)).toBeNull();
  });
});
