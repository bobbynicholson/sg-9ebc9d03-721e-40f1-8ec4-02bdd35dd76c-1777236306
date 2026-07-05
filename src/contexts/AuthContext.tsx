import { createContext, useContext, ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { createClient } from "@/lib/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import type { Tables } from "@/integrations/supabase/types";
import { UserRole } from "@/types/app";
import { profileService } from "@/services/profileService";
import { prewarmCompanyTemplates } from "@/services/messageTemplateService";
import { deriveUserRoles } from "@/lib/roleDerivation";

type Company = Tables<"companies">;
type DbProfile = Tables<"profiles">;

export type AuthenticatedUser = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  active_role: string;
  avatar_url?: string;
  currency: string;
  company_id?: string;
  company_name?: string;
  company_slug?: string;
  phone_number?: string;
  user_metadata?: {
    company_id?: string;
    company_slug?: string;
    full_name?: string;
    avatar_url?: string;
    [key: string]: unknown;
  };
  app_metadata?: {
    provider?: string;
    [key: string]: unknown;
  };
  aud?: string;
  created_at?: string;
  updated_at?: string;
};

interface AuthContextType {
  user: AuthenticatedUser | null;
  profile: DbProfile | null;
  company: Company | null;
  companySlug: string | null;
  loading: boolean;
  error: string | null;
  userRoles: UserRole[];
  activeRole: string;
  switchRole: (newRole: UserRole) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ user: unknown; error: { message: string } | null }>;
  signUp: (email: string, password: string, metadata: Record<string, unknown>) => Promise<{ user: unknown; error: { message: string } | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<DbProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [profile, setProfile] = useState<DbProfile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [activeRole, setActiveRole] = useState<string>(UserRole.ADMIN);

  useEffect(() => {
    // Dev shortcut. Only honoured outside production builds. The
    // ?dev=true query escape hatch on production used to grant client-side
    // super_admin to anyone with the URL [P0-03].
    const isDevEnvironment =
      process.env.NODE_ENV !== "production" &&
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
       window.location.hostname === "127.0.0.1" ||
       window.location.search.includes("dev=true"));

    if (isDevEnvironment) {
      // A REAL session in the browser always wins over the dev
      // shortcut. Otherwise every locally signed-in tenant (and every
      // Playwright run with a minted cookie) is silently replaced by
      // the fake DEV TEST COMPANY identity and pages render day-zero
      // states instead of the real account's data.
      let cancelled = false;
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (cancelled) return;
        if (session?.user) {
          handleSessionChange(session);
          return;
        }
        applyDevBypass();
      });
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) handleSessionChange(session);
      });
      return () => {
        cancelled = true;
        subscription.unsubscribe();
      };
    }

    function applyDevBypass() {
      console.log("🔧 DEV MODE ACTIVE: Creating fake super admin user (no login required)");
      
      // Create a fake super admin user for dev mode with full access
      const devUser: AuthenticatedUser = {
        id: "00000000-0000-0000-0000-000000000000",
        email: "dev@localhost",
        full_name: "DEV MODE - Super Admin",
        role: UserRole.SUPER_ADMIN,
        active_role: UserRole.SUPER_ADMIN,
        currency: "ZAR",
        company_id: "11111111-1111-1111-1111-111111111111",
        company_name: "DEV TEST COMPANY",
        company_slug: "dev-test",
        created_at: new Date().toISOString(),
      };

      const devCompany = {
        id: "11111111-1111-1111-1111-111111111111",
        company_name: "DEV TEST COMPANY",
        slug: "dev-test",
        owner_id: "00000000-0000-0000-0000-000000000000",
        email: "dev@localhost",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true,
        trial_ends_at: null,
        subscription_status: "active",
        subscription_plan: "pro",
        currency: "ZAR",
      } as unknown as Company;

      setUser(devUser);
      // Fake profile to match the fake user - pages that gate on
      // profile.role/active_role (e.g. platform/company-database)
      // otherwise dead-end in dev because profile stays null forever.
      setProfile({
        id: devUser.id,
        email: devUser.email,
        full_name: devUser.full_name,
        role: "super_admin",
        active_role: "super_admin",
        company_id: devUser.company_id,
        currency: "ZAR",
        created_at: devUser.created_at,
      } as unknown as DbProfile);
      setCompany(devCompany);
      setUserRoles([UserRole.SUPER_ADMIN]);
      setActiveRole(UserRole.SUPER_ADMIN);
      setLoading(false);
      return;
    }

    // Skip the auth round-trip on public marketing + tokenised routes
    // [P2-14]. AuthProvider always wraps the tree (so shared chrome
    // that calls useAuth() doesn't bomb on prerender) but on routes
    // where there's no authenticated user to surface, we don't pay
    // the supabase.auth.getSession() + profile hydration cost.
    // setLoading(false) so consumers don't sit on a stuck loader.
    const PUBLIC_ROUTES = [
      /^\/$/,
      /^\/pricing$/,
      /^\/features(\/.*)?$/,
      /^\/blog(\/.*)?$/,
      /^\/page\//,
      /^\/(contact|support|security|terms|privacy|demo|404)$/,
      /^\/(uk|us|eu)(\/.*)?$/,
      /^\/q\//,
      /^\/pay\/i\//,
      /^\/c\/order\//,
    ];
    const pathname = typeof window !== "undefined" ? window.location.pathname : "";
    const isPublicRoute = PUBLIC_ROUTES.some((re) => re.test(pathname));
    if (isPublicRoute) {
      setLoading(false);
      // Still subscribe to auth state so a sign-in elsewhere in the
      // tab (rare) hydrates the context, but we don't fetch eagerly.
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) handleSessionChange(session);
      });
      return () => subscription.unsubscribe();
    }

    // Normal auth flow for production
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSessionChange(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSessionChange(session);
    });

    return () => subscription.unsubscribe();
  }, []); // Only run once on mount

  const handleSessionChange = async (session: Session | null) => {
    setLoading(true);
    setError(null);

    try {
      if (session?.user) {
        // Fetch user profile
        const userProfile = await profileService.getProfile(session.user.id);
        
        if (userProfile) {
          // Fetch company if user has company_id
          let userCompany = null;

          // Clients belong to tenants through the `clients` table, not
          // profiles.company_id - that column only records the FIRST
          // company the client ever signed in through (and is null for
          // older client accounts). The same person can be a customer
          // of several catering companies, so for client profiles we
          // resolve the tenant from their own clients rows FIRST,
          // preferring the slug they signed in through
          // (user_metadata.last_company_slug, written by the auth
          // callback). Without this, a client of company A clicking
          // company B's magic link got company A's portal context and
          // saw none of B's orders. Falls through to the plain
          // company_id branch when nothing resolves.
          const isClientProfile = String(userProfile.role) === "client";
          if (isClientProfile) {
            try {
              const { data: clientRows } = await supabase
                .from("clients")
                .select("company_id")
                .eq("user_id", session.user.id);
              const companyIds = Array.from(
                new Set((clientRows || []).map((r: any) => r.company_id).filter(Boolean)),
              ) as string[];
              if (companyIds.length > 0) {
                const wantSlug = String(
                  (session.user.user_metadata as any)?.last_company_slug || "",
                );
                // Try the real rows first (works for staff-visible
                // tenants and once the companies client-read policy
                // lands in prod).
                const { data: companyRows } = await supabase
                  .from("companies")
                  .select("*")
                  .in("id", companyIds);
                let chosen: any =
                  (wantSlug &&
                    (companyRows || []).find((c: any) => c.slug === wantSlug)) ||
                  null;
                // The sign-in slug didn't resolve to a readable row.
                // Map slug -> id via the SECURITY DEFINER branding RPC
                // and verify membership, so the portal scopes to the
                // right tenant even while clients can't SELECT
                // companies under RLS - and never picks an arbitrary
                // company when the client belongs to several.
                if (!chosen && wantSlug) {
                  const { data: brandData } = await (supabase.rpc as any)(
                    "get_company_branding",
                    { p_slug: wantSlug },
                  );
                  const brand = Array.isArray(brandData) ? brandData[0] : brandData;
                  if (brand?.id && companyIds.includes(brand.id)) {
                    chosen = {
                      id: brand.id,
                      slug: brand.slug || wantSlug,
                      company_name: brand.company_name,
                      logo_url: brand.logo_url,
                      primary_color: brand.primary_color,
                      secondary_color: brand.secondary_color,
                    } as unknown as Company;
                  }
                }
                // No sign-in slug to honour (or it isn't one of their
                // memberships): prefer the profile's own company when
                // it is a membership, then any readable row.
                if (!chosen) {
                  chosen =
                    (userProfile.company_id &&
                      (companyRows || []).find(
                        (c: any) => c.id === userProfile.company_id,
                      )) ||
                    (companyRows || [])[0] ||
                    null;
                }
                // Last resort: minimal context - `id` is all the portal
                // needs to scope orders. Only pair the sign-in slug
                // with the id when the client has exactly one tenant
                // (otherwise the slug/id pairing could be wrong).
                if (!chosen) {
                  const fallbackId =
                    userProfile.company_id && companyIds.includes(userProfile.company_id)
                      ? userProfile.company_id
                      : companyIds[0];
                  chosen = {
                    id: fallbackId,
                    slug: companyIds.length === 1 && wantSlug ? wantSlug : undefined,
                    company_name: undefined,
                  } as unknown as Company;
                }
                userCompany = chosen;
              }
            } catch (clientCompanyErr) {
              console.error(
                "[AuthContext] client tenant resolve failed:",
                clientCompanyErr,
              );
            }
          }

          if (!userCompany && userProfile.company_id) {
            const { data: companyData, error: companyError } = await supabase
              .from("companies")
              .select("*")
              .eq("id", userProfile.company_id)
              .maybeSingle();
            if (companyError) {
              console.error("[AuthContext] companies fetch failed:", companyError);
            }

            if (companyData) {
              userCompany = companyData;
            }
            // Prewarm the messaging-template cache so customisations
            // saved on /admin/messaging-templates show up the first
            // time the operator opens a compose drawer in this
            // session, not on the second open. Fire-and-forget --
            // failures are non-fatal (the renderers fall back to
            // hardcoded defaults).
            prewarmCompanyTemplates(userProfile.company_id).catch(() => {});
          } else if (!userCompany) {
            // Company-less profiles that didn't take the client branch
            // above (e.g. role drift where the profile row isn't marked
            // client but the person only exists as a customer). Same
            // clients-table resolution, kept as a safety net so the
            // portal never gates out on `company?.id` when RLS would
            // return their orders.
            try {
              const { data: clientRows } = await supabase
                .from("clients")
                .select("company_id")
                .eq("user_id", session.user.id);
              const companyIds = Array.from(
                new Set((clientRows || []).map((r: any) => r.company_id).filter(Boolean)),
              ) as string[];
              if (companyIds.length > 0) {
                const wantSlug = String(
                  (session.user.user_metadata as any)?.last_company_slug || "",
                );
                // Try the real rows first (works for staff-visible tenants
                // and once the companies client-read policy lands).
                const { data: companyRows } = await supabase
                  .from("companies")
                  .select("*")
                  .in("id", companyIds);
                let chosen: any = null;
                if (companyRows && companyRows.length > 0) {
                  chosen =
                    (wantSlug && companyRows.find((c: any) => c.slug === wantSlug)) ||
                    companyRows[0];
                }
                if (!chosen) {
                  chosen = {
                    id: companyIds[0],
                    slug: wantSlug || undefined,
                    company_name: undefined,
                  } as unknown as Company;
                }
                userCompany = chosen;
              }
            } catch (clientCompanyErr) {
              console.error(
                "[AuthContext] client tenant resolve failed:",
                clientCompanyErr,
              );
            }
          }

          const { data: departmentRows, error: departmentError } = await supabase
            .from("user_departments")
            .select("department, is_primary")
            .eq("user_id", session.user.id)
            .order("is_primary", { ascending: false });
          if (departmentError) {
            console.error("[AuthContext] user_departments fetch failed:", departmentError);
          }

          const derivedRoles = deriveUserRoles({
            profileRole: userProfile.role,
            activeRole: userProfile.active_role,
            departments: departmentRows || [],
          });
          const roleValue = derivedRoles.roles[0] || UserRole.CLIENT;

          const authenticatedUser: AuthenticatedUser = {
            id: session.user.id,
            email: session.user.email || "",
            full_name: userProfile.full_name || "",
            role: roleValue,
            active_role: derivedRoles.activeRole,
            avatar_url: userProfile.avatar_url || "",
            currency: userProfile.currency || "ZAR",
            company_id: userProfile.company_id || undefined,
            company_name: userCompany?.company_name || undefined,
            company_slug: userCompany?.slug || undefined,
            phone_number: userProfile.phone_number || undefined,
            user_metadata: session.user.user_metadata,
            app_metadata: session.user.app_metadata,
            created_at: session.user.created_at,
          };

          setUser(authenticatedUser);
          setProfile(userProfile as DbProfile);
          setCompany(userCompany);
          setUserRoles(derivedRoles.roles);
          setActiveRole(derivedRoles.activeRole);

          // Phase 6 follow-up: bind tenant tags to the observability
          // scope so every subsequent captureException carries company
          // + user + role context. No-op when Sentry isn't wired in;
          // becomes live the moment SENTRY_DSN lands. See
          // src/lib/observability.ts.
          try {
            const { setGlobalTags } = await import("@/lib/observability");
            setGlobalTags({
              companyId: userProfile.company_id || null,
              userId: session.user.id,
              role: derivedRoles.activeRole,
            });
          } catch { /* non-fatal */ }
        }
      } else {
        setUser(null);
        setProfile(null);
        setCompany(null);
        setUserRoles([]);
        setActiveRole(UserRole.CLIENT);

        try {
          const { setGlobalTags } = await import("@/lib/observability");
          setGlobalTags({ companyId: null, userId: null, role: null });
        } catch { /* non-fatal */ }
      }
    } catch (err) {
      console.error("Auth error:", err);
      setError(err instanceof Error ? err.message : "Authentication error");
    } finally {
      setLoading(false);
    }
  };

  const switchRole = async (newRole: UserRole) => {
    if (user) {
      setActiveRole(newRole);
      setUser({ ...user, active_role: newRole });
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    }

    return { user: data.user, error };
  };

  const signUp = async (email: string, password: string, metadata: Record<string, unknown>) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    });

    if (error) {
      setError(error.message);
    }

    return { user: data.user, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setCompany(null);
    setUserRoles([]);
  };

  const updateProfile = async (updates: Partial<DbProfile>) => {
    if (user && profile) {
      await profileService.updateProfile(user.id, updates);
      setProfile({ ...profile, ...updates });
    }
  };

  const contextValue: AuthContextType = {
    user,
    profile,
    company,
    companySlug: company?.slug || null,
    loading,
    error,
    userRoles,
    activeRole,
    switchRole,
    signIn,
    signUp,
    signOut,
    updateProfile,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
