import { createContext, useContext, ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { createClient } from "@/lib/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import type { Tables } from "@/integrations/supabase/types";
import { UserRole } from "@/types/app";
import { profileService } from "@/services/profileService";
import { prewarmCompanyTemplates } from "@/services/messageTemplateService";

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
  const [userRoles, setUserRoles] = useState<any[]>([]);
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
      setProfile(null);
      setCompany(devCompany);
      setUserRoles([]);
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
          if (userProfile.company_id) {
            const { data: companyData } = await supabase
              .from("companies")
              .select("*")
              .eq("id", userProfile.company_id)
              .single();

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
          }

          const roleValue = (userProfile.role as UserRole) || UserRole.CLIENT;

          const authenticatedUser: AuthenticatedUser = {
            id: session.user.id,
            email: session.user.email || "",
            full_name: userProfile.full_name || "",
            role: roleValue,
            active_role: roleValue as string,
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
          setUserRoles([]);
          setActiveRole(roleValue);
        }
      } else {
        setUser(null);
        setProfile(null);
        setCompany(null);
        setUserRoles([]);
        setActiveRole(UserRole.CLIENT);
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