import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { authService, AuthUser, AuthError } from "@/services/authService";
import { profileService, Profile } from "@/services/profileService";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { useRouter } from "next/router";
import { roleService, RoleAssignment } from "@/services/roleService";
import { companyService } from "@/services/companyService";
import type { Tables } from "@/integrations/supabase/types";
import { UserRole } from "@/types/app";

type Company = Tables<"companies">;

export type AuthenticatedUser = SupabaseUser & Profile;

interface AuthContextType {
  user: AuthenticatedUser | null;
  profile: Profile | null;
  company: Company | null;
  companySlug: string | null;
  loading: boolean;
  error: string | null;
  userRoles: RoleAssignment[];
  activeRole: string;
  switchRole: (newRole: UserRole) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ user: AuthUser | null; error: AuthError | null }>;
  signUp: (email: string, password: string, metadata: { full_name: string; role?: string; currency?: string; phone_number?: string; company_name?: string; company_slug?: string; }, isOwner?: boolean) => Promise<{ user: AuthUser | null; error: AuthError | null, companySlug?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * BUG FIX #2: Retry profile loading with exponential backoff
 * When a new user signs up, the database trigger creates the profile asynchronously.
 * This can cause a race condition where we try to load the profile before it exists.
 * Solution: Retry with increasing delays (100ms, 200ms, 400ms, 800ms, 1600ms)
 */
async function loadProfileWithRetry(userId: string, maxRetries: number = 5): Promise<Profile | null> {
  let lastError: any = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const profile = await profileService.getProfile(userId);
      
      if (profile) {
        console.log(`Profile loaded successfully on attempt ${attempt + 1}`);
        return profile;
      }
      
      // Profile doesn't exist yet, wait before retrying
      if (attempt < maxRetries - 1) {
        const delay = Math.min(100 * Math.pow(2, attempt), 2000); // Max 2 seconds
        console.log(`Profile not found, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      lastError = error;
      console.error(`Error loading profile (attempt ${attempt + 1}/${maxRetries}):`, error);
      
      // If it's a network error or temporary issue, retry
      if (attempt < maxRetries - 1) {
        const delay = Math.min(100 * Math.pow(2, attempt), 2000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // After all retries, return null
  console.error(`Failed to load profile after ${maxRetries} attempts:`, lastError);
  return null;
}

function AuthProviderInner({ children }: { children: ReactNode }) {
  const { isDemoMode, getDemoUser } = useDemoMode();
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<RoleAssignment[]>([]);
  const [activeRole, setActiveRole] = useState<string>("client");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [companySlug, setCompanySlug] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      const demoUser = getDemoUser();
      if (demoUser) {
        const fullDemoUser = {
          id: demoUser.id,
          email: demoUser.email,
          user_metadata: { full_name: demoUser.full_name },
          app_metadata: {},
          aud: "authenticated",
          created_at: new Date().toISOString(),
          full_name: demoUser.full_name,
          role: demoUser.role,
          active_role: demoUser.role,
          avatar_url: demoUser.avatar_url || "",
          currency: "ZAR",
          updated_at: new Date().toISOString(),
          company_id: "demo-company-id",
          company_name: "Bob's Catering",
          company_slug: "bobs-catering",
          phone: "+27 21 555 1234",
          phone_number: "+27 21 555 1234",
          is_active: true,
          subscription_plan: "professional",
          subscription_status: "active",
          trial_ends_at: new Date(
            Date.now() + 14 * 24 * 60 * 60 * 1000
          ).toISOString(),
          drive_time_to_kitchen_minutes: 25,
          vehicle_details: "White Toyota Hilux",
          region: "Gauteng",
        } as AuthenticatedUser;
        
        setUser(fullDemoUser);
        setProfile(fullDemoUser);
        setCompanySlug("bobs-catering");
        
        setUserRoles([{ 
          id: "demo-role", 
          user_id: demoUser.id, 
          department: demoUser.role as any,
          is_primary: true,
          assigned_at: new Date().toISOString(),
          assigned_by: "system",
          created_at: new Date().toISOString()
        }]);
        setActiveRole(demoUser.role);
      }
      setLoading(false);
      return;
    }

    const loadUserSession = async (session: any) => {
      if (!session?.user) {
        setUser(null);
        setProfile(null);
        setCompany(null);
        setCompanySlug(null);
        setUserRoles([]);
        setActiveRole("client");
        setLoading(false);
        return;
      }

      try {
        // BUG FIX #2: Use retry logic to handle profile creation race condition
        const profileData = await loadProfileWithRetry(session.user.id);

        if (!profileData) {
          console.error("Profile data is null after retries for user:", session.user.id);
          // Only redirect if we're not on an auth page (to avoid loops)
          if (typeof window !== "undefined" && !window.location.pathname.includes("/auth/")) {
            await handleInvalidSession();
          } else {
            // On auth pages, just clear state but don't redirect
            setUser(null);
            setProfile(null);
            setCompany(null);
            setCompanySlug(null);
            setUserRoles([]);
            setActiveRole("client");
            setLoading(false);
          }
          return;
        }

        const mergedUser = { ...session.user, ...profileData } as AuthenticatedUser;
        setUser(mergedUser);
        setProfile(profileData);
        setCompanySlug(profileData.company_slug || null);

        if (profileData.company_id) {
            const companyData = await companyService.getCompanyById(profileData.company_id);
            setCompany(companyData);
        }

        // Load user roles (with error handling)
        let roles: RoleAssignment[] = [];
        try {
          roles = await roleService.getUserRoles(session.user.id);
          setUserRoles(roles);
        } catch (rolesError) {
          console.error("Error loading user roles:", rolesError);
          setUserRoles([]);
        }

        // Load active role (with error handling)
        let active = "client";
        try {
          active = await roleService.getActiveRole(session.user.id);
          setActiveRole(active);
        } catch (activeRoleError) {
          console.error("Error loading active role:", activeRoleError);
          setActiveRole("client");
        }

      } catch (error) {
        console.error("Error loading user session data:", error);
        await handleInvalidSession();
      } finally {
        setLoading(false);
      }
    };
    
    const handleInvalidSession = async () => {
      console.log("Handling invalid session - clearing and redirecting to login");
      
      setUser(null);
      setProfile(null);
      setCompany(null);
      setCompanySlug(null);
      setUserRoles([]);
      setActiveRole("client");
      setLoading(false);
      
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.error("Error during cleanup signout:", signOutError);
      }
      
      if (typeof window !== "undefined" && !window.location.pathname.includes("/auth/")) {
        router.push("/auth/login?message=session_expired");
      }
    };
    
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error("Error getting session:", error);
          await handleInvalidSession();
          return;
        }
        
        await loadUserSession(session);
      } catch (error) {
        console.error("Fatal error initializing auth:", error);
        await handleInvalidSession();
      }
    };

    initializeAuth();

    let subscription: any;
    try {
      const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
        try {
          await loadUserSession(session);
        } catch (error) {
          console.error("Error in auth state change handler:", error);
          await handleInvalidSession();
        }
      });
      subscription = data.subscription;
    } catch (error) {
      console.error("Error setting up auth state change listener:", error);
    }

    return () => {
      if (subscription) {
        try {
          subscription.unsubscribe();
        } catch (error) {
          console.error("Error unsubscribing:", error);
        }
      }
    };
  }, [isDemoMode, getDemoUser, router]);

  const switchRole = async (newRole: UserRole) => {
    if (isDemoMode || !user) return;

    try {
      await roleService.switchRole(user.id, newRole);
      setActiveRole(newRole);
      
      const dashboardUrl = roleService.getRoleDashboardUrl(
        newRole as any, 
        companySlug || undefined
      );
      router.push(dashboardUrl);
    } catch (error) {
      console.error("Error switching role:", error);
      throw error;
    }
  };

  const signIn = async (email: string, password: string) => {
    if (isDemoMode) {
      return { user: null, error: { message: "Cannot sign in while in demo mode" } as AuthError };
    }
    return await authService.signIn(email, password);
  };

  const signUp = async (email: string, password: string, metadata: { full_name: string; role?: string; currency?: string; phone_number?: string; company_name?: string; company_slug?: string; }, isOwner: boolean = false) => {
    if (isDemoMode) {
      return { user: null, error: { message: "Cannot sign up while in demo mode" } as AuthError };
    }
    // FIX: Pass all arguments to the service
    return await authService.signUp(email, password, metadata, isOwner, metadata.company_name);
  };

  const signOut = async () => {
    if (isDemoMode) return;
    await authService.signOut();
    setUser(null);
    setProfile(null);
    setCompany(null);
    setCompanySlug(null);
    setUserRoles([]);
    setActiveRole("client");
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (isDemoMode || !user) return;
    const updatedProfile = await profileService.updateProfile(user.id, updates);
    if (updatedProfile) {
      setUser({ ...user, ...updatedProfile });
      setProfile({ ...profile, ...updatedProfile } as Profile);
      if (updates.company_slug !== undefined) {
        setCompanySlug(updates.company_slug || null);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile,
      company,
      companySlug,
      loading, 
      error,
      userRoles,
      activeRole,
      switchRole,
      signIn, 
      signUp, 
      signOut, 
      updateProfile 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthProviderInner>{children}</AuthProviderInner>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
