import { getRelevantWorkflows } from "@/lib/chatbot/workflows";

describe("assistant help for quote email templates", () => {
  it.each([
    "how do I edit the new quote email?",
    "where is the two quotes preview",
    "how can I preview a quote email template",
    "where does option 2 go in the email",
    "how do I reset my email template",
    "change the revised quote email",
  ])("answers %j with the template steps", (question) => {
    const [workflow] = getRelevantWorkflows(question, "company_admin");
    expect(workflow?.id).toBe("quote-email-templates");
    expect(workflow.steps).toHaveLength(4);
    expect(workflow.steps[0].href).toContain("/admin/email-templates");
  });

  it("names the buttons exactly as they appear on the page", () => {
    const [workflow] = getRelevantWorkflows("two quotes preview", "company_admin");
    const text = workflow.steps.map((step) => step.description).join(" ");
    for (const label of ["One quote", "Two quotes", "Insert Option 1 and Option 2 block", "Save customisation", "Reset to default", "Send test email to me"]) {
      expect(text).toContain(label);
    }
  });

  it("is only offered to admins", () => {
    expect(getRelevantWorkflows("edit the new quote email", "driver")).toEqual([]);
    expect(getRelevantWorkflows("edit the new quote email", "client")).toEqual([]);
  });

  it("leaves automatic email questions on their own guide", () => {
    expect(getRelevantWorkflows("turn off automatic emails", "company_admin")[0]?.id).toBe("automatic-emails");
  });
});
