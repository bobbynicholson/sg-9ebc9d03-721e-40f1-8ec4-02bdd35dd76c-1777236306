/** Stable authenticated links; access is checked again on every download. */
export const PRIVATE_COMPANY_BUCKETS = new Set([
  "imports", "purchase-receipts", "equipment-damage-photos", "pod",
]);

export function companyFileUrl(bucket: string, path: string): string {
  return `/api/company-files?${new URLSearchParams({ bucket, path })}`;
}

/** Upgrade stored public/long lived signed URLs without rewriting old rows. */
export function protectedCompanyFileUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://invalid.local");
    if (url.origin !== base.origin) return value;
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (match && PRIVATE_COMPANY_BUCKETS.has(match[1])) {
      return companyFileUrl(match[1], decodeURIComponent(match[2]));
    }
  } catch { /* Relative authenticated links and external images stay usable. */ }
  return value;
}
