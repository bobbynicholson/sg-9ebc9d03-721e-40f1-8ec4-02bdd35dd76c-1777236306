import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { authService, AuthUser, AuthError } from "@/services/authService";
import { profileService, Profile } from "@/services/profileService";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { useRouter } from "next/router";
import { roleService, RoleAssignment } from "@/services/roleService";

export type AuthenticatedUser = SupabaseUser & Profile;

interface AuthContextType {
  user: AuthenticatedUser | null;
  profile: Profile | null;
  loading: boolean;
  userRoles: RoleAssignment[];
  activeRole: string;
  switchRole: (newRole: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ user: AuthUser | null; error: AuthError | null }>;
  signUp: (email: string, password: string, fullName: string, role: string, currency: string, phone: string) => Promise<{ user: AuthUser | null; error: AuthError | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function AuthProviderInner({ children }: { children: ReactNode }) {
  const { isDemoMode, getDemoUser } = useDemoMode();
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRoles, setUserRoles] = useState<RoleAssignment[]>([]);
  const [activeRole, setActiveRole] = useState<string>("client");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionError, setSessionError] = useState(false);

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
        
        setUserRoles([{ 
          id: "demo-role", 
          userId: demoUser.id, 
          department: demoUser.role as any,
          isPrimary: true,
          assignedAt: new Date().toISOString(),
          assignedBy: null
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
        setUserRoles([]);
        setActiveRole("client");
        setLoading(false);
        setSessionError(false);
        return;
      }

      try {
        // Load profile first - this is the most critical
        let profileData = null;
        try {
          profileData = await profileService.getProfile(session.user.id);
        } catch (profileError) {
          console.error("Error loading profile:", profileError);
          // Profile is critical - if it fails, clear session and redirect
          await handleInvalidSession();
          return;
        }

        if (!profileData) {
          console.error("Profile data is null for user:", session.user.id);
          await handleInvalidSession();
          return;
        }

        // Merge user with profile data
        const mergedUser = { ...session.user, ...profileData } as AuthenticatedUser;
        setUser(mergedUser);
        setProfile(profileData);

        // Load roles - non-critical, use defaults if fails
        let roles: RoleAssignment[] = [];
        try {
          roles = await roleService.getUserRoles(session.user.id);
          setUserRoles(roles);
        } catch (rolesError) {
          console.error("Error loading user roles:", rolesError);
          setUserRoles([]);
        }

        // Load active role - non-critical, use default if fails
        let active = "client";
        try {
          active = await roleService.getActiveRole(session.user.id);
          setActiveRole(active);
        } catch (activeRoleError) {
          console.error("Error loading active role:", activeRoleError);
          setActiveRole("client");
        }

        setSessionError(false);
      } catch (error) {
        console.error("Error loading user session data:", error);
        // If something went very wrong, clear session
        await handleInvalidSession();
      } finally {
        setLoading(false);
      }
    };
    
    const handleInvalidSession = async () => {
      console.log("Handling invalid session - clearing and redirecting to login");
      
      setUser(null);
      setProfile(null);
      setUserRoles([]);
      setActiveRole("client");
      setSessionError(true);
      setLoading(false);
      
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.error("Error during cleanup signout:", signOutError);
      }
      
      // Only redirect if not already on auth page
      if (typeof window !== "undefined" && !window.location.pathname.includes("/auth/")) {
        router.push("/auth/login?message=session_expired");
      }
    };
    
    // Wrap in try-catch to handle Supabase internal errors
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

    // Wrap auth state change listener in try-catch as well
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

  const switchRole = async (newRole: string) => {
    if (isDemoMode || !user) return;

    try {
      await roleService.switchRole(user.id, newRole as any);
      setActiveRole(newRole);
      
      const dashboardUrl = roleService.getRoleDashboardUrl(
        newRole as any, 
        user?.company_slug || undefined
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

  const signUp = async (email: string, password: string, fullName: string, role: string, currency: string, phone: string) => {
    if (isDemoMode) {
      return { user: null, error: { message: "Cannot sign up while in demo mode" } as AuthError };
    }
    return await authService.signUp(email, password, fullName, role, currency, phone);
  };

  const signOut = async () => {
    if (isDemoMode) return;
    await authService.signOut();
    setUser(null);
    setProfile(null);
    setUserRoles([]);
    setActiveRole("client");
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (isDemoMode || !user) return;
    const updatedProfile = await profileService.updateProfile(user.id, updates);
    if (updatedProfile) {
      setUser({ ...user, ...updatedProfile });
      setProfile({ ...profile, ...updatedProfile } as Profile);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile,
      loading, 
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
