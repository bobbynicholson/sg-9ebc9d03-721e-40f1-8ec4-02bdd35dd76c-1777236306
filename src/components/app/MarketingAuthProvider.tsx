import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AuthContext, type AuthContextType } from "@/contexts/authContextCore";
import { hasSupabaseSessionHint } from "@/lib/auth/sessionHint";
import { applyBrandingToDOM, loadBrandFonts } from "@/lib/branding/applyBranding";
import { setBrandingRow } from "@/lib/branding/store";
import { UserRole } from "@/types/app";

const RealAuthBridge = dynamic(
  () => import("./RealAuthBridge").then((module) => module.RealAuthBridge),
  { ssr: false, loading: () => null },
);

/**
 * Auth for public marketing pages without shipping the Supabase client in
 * their first load.
 *
 *  - Server render and first client render match the real AuthProvider's
 *    initial state (signed out, loading), so hydration is unchanged.
 *  - No session in this browser: report "signed out" and reset any tenant
 *    branding - exactly what the real provider does on these routes - and
 *    never download the auth client.
 *  - A session (or an auth link) is present: load the real AuthProvider in
 *    the background and pass its values through, so a signed-in visitor gets
 *    the same header, role switcher and company colours as before.
 *  - Calling signIn / signOut / switchRole etc. before it has loaded loads
 *    it first and then runs the real action.
 */
export function MarketingAuthProvider({ children }: { children: ReactNode }) {
  const [real, setReal] = useState<AuthContextType | null>(null);
  const [bridgeWanted, setBridgeWanted] = useState(false);
  const [loading, setLoading] = useState(true);
  const latestReal = useRef<AuthContextType | null>(null);
  const waiting = useRef<Array<(value: AuthContextType) => void>>([]);

  useEffect(() => {
    if (hasSupabaseSessionHint()) {
      setBridgeWanted(true);
      return;
    }
    setBrandingRow(null);
    applyBrandingToDOM(null);
    loadBrandFonts(null);
    setLoading(false);
  }, []);

  const onRealChange = useCallback((value: AuthContextType) => {
    latestReal.current = value;
    setReal(value);
    const resolvers = waiting.current;
    waiting.current = [];
    resolvers.forEach((resolve) => resolve(value));
  }, []);

  const getReal = useCallback((): Promise<AuthContextType> => {
    if (latestReal.current) return Promise.resolve(latestReal.current);
    return new Promise((resolve) => {
      waiting.current.push(resolve);
      setBridgeWanted(true);
    });
  }, []);

  const signedOut = useMemo<AuthContextType>(() => ({
    user: null,
    profile: null,
    company: null,
    companySlug: null,
    loading,
    error: null,
    userRoles: [],
    activeRole: UserRole.ADMIN,
    switchRole: (role) => getReal().then((auth) => auth.switchRole(role)),
    signIn: (email, password) => getReal().then((auth) => auth.signIn(email, password)),
    signUp: (email, password, metadata) => getReal().then((auth) => auth.signUp(email, password, metadata)),
    signOut: () => getReal().then((auth) => auth.signOut()),
    updateProfile: (updates) => getReal().then((auth) => auth.updateProfile(updates)),
  }), [loading, getReal]);

  // Same element across re-renders, so a report from the bridge re-renders
  // this provider without re-rendering (and re-reporting from) the bridge.
  const bridge = useMemo(
    () => (bridgeWanted ? <RealAuthBridge onChange={onRealChange} /> : null),
    [bridgeWanted, onRealChange],
  );

  return (
    <AuthContext.Provider value={real ?? signedOut}>
      {children}
      {bridge}
    </AuthContext.Provider>
  );
}
