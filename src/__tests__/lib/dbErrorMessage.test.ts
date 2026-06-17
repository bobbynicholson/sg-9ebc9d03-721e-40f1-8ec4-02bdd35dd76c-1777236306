import { dbErrorMessage, dbErrorStatus } from "@/lib/errors/dbErrorMessage";

describe("dbErrorMessage", () => {
  it("names the duplicate field on a unique violation", () => {
    const err = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "clients_company_id_email_key"',
      details: "Key (company_id, email)=(abc, sarah@example.co.za) already exists.",
    };
    expect(dbErrorMessage(err, { entity: "contact" })).toBe(
      "A contact with this email address already exists.",
    );
  });

  it("skips plumbing columns and names the meaningful one", () => {
    const err = {
      code: "23505",
      details: "Key (company_id, slug)=(abc, spit-braai) already exists.",
    };
    expect(dbErrorMessage(err)).toBe("A record with this URL already exists.");
  });

  it("falls back to a generic duplicate message when no column is parseable", () => {
    expect(dbErrorMessage({ code: "23505", message: "duplicate key" }, { entity: "supplier" })).toBe(
      "A supplier with these details already exists.",
    );
  });

  it("handles a raw duplicate message with no code", () => {
    expect(dbErrorMessage({ message: "duplicate key value violates unique constraint x" })).toBe(
      "A record with these details already exists.",
    );
  });

  it("names the missing field on a not-null violation", () => {
    const err = { code: "23502", message: 'null value in column "email" violates not-null constraint' };
    expect(dbErrorMessage(err)).toBe("Email address is required.");
  });

  it("explains a foreign-key violation", () => {
    expect(dbErrorMessage({ code: "23503" }, { entity: "client" })).toMatch(/linked to other records/);
  });

  it("maps permission and not-found codes", () => {
    expect(dbErrorMessage({ code: "42501" })).toBe("You don't have permission to do this.");
    expect(dbErrorMessage({ code: "PGRST116" })).toBe("We couldn't find that record.");
  });

  it("passes through our own intentional Error messages", () => {
    const err = new Error("A client with this email already exists as a lead.");
    expect(dbErrorMessage(err)).toBe("A client with this email already exists as a lead.");
  });

  it("does not leak raw constraint text through the plain-Error path", () => {
    const err = new Error('value violates constraint "foo"');
    expect(dbErrorMessage(err)).toBe("Something went wrong. Please try again.");
  });

  it("returns the fallback for null / unknown input", () => {
    expect(dbErrorMessage(null)).toBe("Something went wrong. Please try again.");
    expect(dbErrorMessage(undefined, { fallback: "Nope." })).toBe("Nope.");
  });
});

describe("dbErrorStatus", () => {
  it("maps codes to HTTP statuses", () => {
    expect(dbErrorStatus({ code: "23505" })).toBe(409);
    expect(dbErrorStatus({ code: "23502" })).toBe(400);
    expect(dbErrorStatus({ code: "42501" })).toBe(403);
    expect(dbErrorStatus({ code: "PGRST116" })).toBe(404);
    expect(dbErrorStatus({ code: "PGRST301" })).toBe(401);
    expect(dbErrorStatus(null)).toBe(500);
  });
});
