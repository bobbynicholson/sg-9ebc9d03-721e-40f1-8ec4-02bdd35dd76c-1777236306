/**
 * A one-off R5 checkout used only to verify the PayFast return and ITN flow
 * for the dedicated test tenant. This plan must never be offered to another
 * company or included in public pricing.
 */
export const PAYFAST_TEST_TENANT_SLUG = "raj267748-payfast-test";
export const PAYFAST_TEST_PLAN_ID = "payfast-test";
export const PAYFAST_TEST_PLAN_AMOUNT_ZAR = 5;

export function isPayfastTestPlan(planId: string | null | undefined): boolean {
  return String(planId || "").trim().toLowerCase() === PAYFAST_TEST_PLAN_ID;
}

export function isPayfastTestTenant(slug: string | null | undefined): boolean {
  return String(slug || "").trim().toLowerCase() === PAYFAST_TEST_TENANT_SLUG;
}
