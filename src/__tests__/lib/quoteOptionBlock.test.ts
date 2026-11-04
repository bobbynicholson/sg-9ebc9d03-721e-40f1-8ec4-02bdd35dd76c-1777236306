import { appendOptionBeforeSignoff, buildOptionBlock } from "@/lib/email/quoteOptionBlock";

const option = buildOptionBlock({
  quoteNumber: "QUO-000062",
  amount: "R 11 950.00",
  quoteUrl: "https://example.com/q/option-2",
  guestCount: null,
  eventDateLabel: "50 guests - 13 February 2027",
  eventName: "Off-site catering",
  label: "Option 2",
});

describe("quote option block", () => {
  it("lists the second quote's reference, details, total and link", () => {
    expect(option).toEqual([
      "Option 2 — QUO-000062 (Off-site catering)",
      "50 guests - 13 February 2027",
      "Total: R 11 950.00",
      "View and accept this quote: https://example.com/q/option-2",
    ]);
  });

  it("points to the attached PDF when the quote has no link", () => {
    const block = buildOptionBlock({
      quoteNumber: "QUO-1", amount: "", quoteUrl: null, guestCount: 2, eventDateLabel: null, eventName: null, label: "Option 2",
    });
    expect(block).toEqual(["Option 2 — QUO-1", "2 guests", "Please see the attached PDF for this option."]);
  });

  it("puts the option before a custom template's sign-off", () => {
    const body = "Hi Sam,\n\nThanks again Sam and have an amazing day further.\n\nRegards,\nCallum.";
    const result = appendOptionBeforeSignoff(body, option);
    expect(result.indexOf("Option 2 — QUO-000062")).toBeGreaterThan(result.indexOf("amazing day"));
    expect(result.indexOf("Option 2 — QUO-000062")).toBeLessThan(result.indexOf("Regards,"));
  });

  it("adds the option at the end when there is no sign-off", () => {
    expect(appendOptionBeforeSignoff("Hi Sam,\n\nYour quote is ready.", ["Option 2"]))
      .toBe("Hi Sam,\n\nYour quote is ready.\n\nOption 2");
  });

  it("keeps HTML templates as HTML and escapes the option text", () => {
    const result = appendOptionBeforeSignoff("<p>Hi Sam</p><p>Regards,</p>", ["A & B", "<b>"]);
    expect(result).toBe("<p>Hi Sam</p><p>A &amp; B<br>&lt;b&gt;</p><p>Regards,</p>");
  });
});
