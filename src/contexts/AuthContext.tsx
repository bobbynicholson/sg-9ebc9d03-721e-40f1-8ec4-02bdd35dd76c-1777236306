import { createContext, useContext, ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import type { Tables } from "@/integrations/supabase/types";
import { UserRole } from "@/types/app";
import { profileService } from "@/services/profileService";

type Company = Tables<"companies">;

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
  user_metadata?: any;
  app_metadata?: any;
  aud?: string;
  created_at?: string;
  updated_at?: string;
};

type Profile = Partial<AuthenticatedUser>;

interface AuthContextType {
  user: AuthenticatedUser | null;
  profile: Profile | null;
  company: Company | null;
  companySlug: string | null;
  loading: boolean;
  error: string | null;
  userRoles: any[];
  activeRole: string;
  switchRole: (newRole: UserRole) => Promise<void>;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string, metadata: any, isOwner?: boolean) => Promise<any>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<any[]>([]);
  const [activeRole, setActiveRole] = useState<string>("admin");

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSessionChange(session);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSessionChange(session);
    });

    return () => subscription.unsubscribe();
  }, []);

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
          }

          // Fetch user roles
          const { data: rolesData } = await supabase
            .from("user_roles")
            .select("*")
            .eq("user_id", session.user.id);

          const roles = rolesData || [];
          const primaryRole = roles.find((r) => r.is_primary);

          const authenticatedUser: AuthenticatedUser = {
            id: session.user.id,
            email: session.user.email || "",
            full_name: userProfile.full_name || "",
            role: (primaryRole?.department as UserRole) || "client",
            active_role: (primaryRole?.department as UserRole) || "client",
            avatar_url: userProfile.avatar_url || "",
            currency: userProfile.currency || "ZAR",
            company_id: userProfile.company_id || undefined,
            company_name: userCompany?.name || undefined,
            company_slug: userCompany?.slug || undefined,
            phone_number: userProfile.phone_number || undefined,
            user_metadata: session.user.user_metadata,
            app_metadata: session.user.app_metadata,
            created_at: session.user.created_at,
          };

          setUser(authenticatedUser);
          setProfile(userProfile);
          setCompany(userCompany);
          setUserRoles(roles);
          setActiveRole(authenticatedUser.role);
        }
      } else {
        setUser(null);
        setProfile(null);
        setCompany(null);
        setUserRoles([]);
        setActiveRole("client");
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

  const signUp = async (email: string, password: string, metadata: any, isOwner = false) => {
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

  const updateProfile = async (updates: Partial<Profile>) => {
    if (user) {
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