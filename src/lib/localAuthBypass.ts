/** Development bypasses require deliberate opt-in and can never run in production. */
export function isLocalAuthBypassEnabled(hostname: string): boolean {
  return process.env.NODE_ENV !== "production"
    && process.env.NEXT_PUBLIC_ALLOW_LOCAL_AUTH_BYPASS === "true"
    && ["localhost", "127.0.0.1", "[::1]"].includes(hostname.toLowerCase());
}
