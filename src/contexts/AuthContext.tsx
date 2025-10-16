import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { authService, AuthUser, AuthError } from "@/services/authService";
import { profileService, Profile } from "@/services/profileService";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { useRouter } from "next/router";
import { roleService, RoleAssignment } from "@/services/roleService";

interface AuthContextType {
  user: SupabaseUser | null;
  profile: Profile | null;
  loading: boolean;
  userRoles: RoleAssignment[]; // NEW: All assigned roles
  activeRole: string; // NEW: Currently active role
  switchRole: (newRole: string) => Promise<void>; // NEW: Switch active role
  signIn: (email: string, password: string) => Promise<{ user: AuthUser | null; error: AuthError | null }>;
  signUp: (email: string, password: string, fullName: string, role: string, currency: string, phone: string) => Promise<{ user: AuthUser | null; error: AuthError | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function AuthProviderInner({ children }: { children: ReactNode }) {
  const { isDemoMode, getDemoUser } = useDemoMode();
  const router = useRouter();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRoles, setUserRoles] = useState<RoleAssignment[]>([]); // NEW
  const [activeRole, setActiveRole] = useState<string>("client"); // NEW

  useEffect(() => {
    if (isDemoMode) {
      const demoUser = getDemoUser();
      if (demoUser) {
        setUser({
          id: demoUser.id,
          email: demoUser.email,
          user_metadata: { full_name: demoUser.full_name },
          app_metadata: {},
          aud: "authenticated",
          created_at: new Date().toISOString()
        } as unknown as SupabaseUser);
        
        setProfile({
          id: demoUser.id,
          email: demoUser.email,
          full_name: demoUser.full_name,
          role: demoUser.role,
          avatar_url: demoUser.avatar_url || "",
          currency: "ZAR",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
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
        });
        
        // Set demo user roles
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

    // Handle initial session load with error handling
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("Session error:", error);
        handleInvalidSession();
        return;
      }
      
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
        loadUserRoles(session.user.id); // NEW: Load roles
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes with error handling
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed:", event);
      
      if (event === "TOKEN_REFRESHED") {
        console.log("Token refreshed successfully");
      }
      
      if (event === "SIGNED_OUT" || !session) {
        setUser(null);
        setProfile(null);
        setUserRoles([]); // NEW: Clear roles
        setActiveRole("client"); // NEW: Reset active role
        setLoading(false);
        return;
      }
      
      setUser(session.user);
      if (session.user) {
        await loadProfile(session.user.id);
        await loadUserRoles(session.user.id); // NEW: Load roles
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [isDemoMode, getDemoUser, router]);

  const handleInvalidSession = async () => {
    console.log("Handling invalid session - clearing and redirecting to login");
    
    // Clear all auth data
    setUser(null);
    setProfile(null);
    setLoading(false);
    
    // Sign out to clear any corrupted session data
    await supabase.auth.signOut();
    
    // Redirect to login if not already there
    if (!router.pathname.includes("/auth/")) {
      router.push("/auth/login?message=session_expired");
    }
  };

  const loadProfile = async (userId: string) => {
    try {
      const profileData = await profileService.getProfile(userId);
      setProfile(profileData);
    } catch (error) {
      console.error("Error loading profile:", error);
      // If profile loading fails due to auth error, handle invalid session
      if (error && typeof error === "object" && "code" in error && 
          (error as any).code === "PGRST301") {
        handleInvalidSession();
      }
    } finally {
      setLoading(false);
    }
  };

  // NEW: Load user roles and active role
  const loadUserRoles = async (userId: string) => {
    try {
      const [roles, active] = await Promise.all([
        roleService.getUserRoles(userId),
        roleService.getActiveRole(userId),
      ]);
      
      setUserRoles(roles);
      setActiveRole(active);
      
      // If no roles assigned, assign client role by default
      if (roles.length === 0) {
        await roleService.assignRole(userId, "client" as any, userId, true);
        setUserRoles([{
          id: "default-client",
          userId,
          department: "client" as any,
          isPrimary: true,
          assignedAt: new Date().toISOString(),
          assignedBy: userId,
        }]);
        setActiveRole("client");
      }
    } catch (error) {
      console.error("Error loading user roles:", error);
      // Fallback to client role
      setActiveRole("client");
      setUserRoles([]);
    }
  };

  // NEW: Switch active role
  const switchRole = async (newRole: string) => {
    if (isDemoMode) return;
    if (!user) return;

    try {
      await roleService.switchRole(user.id, newRole as any);
      setActiveRole(newRole);
      
      // Navigate to the new role's dashboard
      const dashboardUrl = roleService.getRoleDashboardUrl(
        newRole as any, 
        profile?.company_slug || undefined
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
    if (isDemoMode) {
      return;
    }
    await authService.signOut();
    setUser(null);
    setProfile(null);
    setUserRoles([]); // NEW: Clear roles
    setActiveRole("client"); // NEW: Reset active role
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (isDemoMode) {
      return;
    }
    if (!user) return;
    const updatedProfile = await profileService.updateProfile(user.id, updates);
    if (updatedProfile) {
      setProfile(updatedProfile);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      userRoles, // NEW
      activeRole, // NEW
      switchRole, // NEW
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
