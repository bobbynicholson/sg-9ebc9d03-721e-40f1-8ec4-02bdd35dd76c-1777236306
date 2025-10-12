import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { authService, AuthUser, AuthError } from "@/services/authService";
import { profileService, Profile } from "@/services/profileService";
import { useDemoMode } from "@/contexts/DemoModeContext";

interface AuthContextType {
  user: SupabaseUser | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ user: AuthUser | null; error: AuthError | null }>;
  signUp: (email: string, password: string, fullName: string, role: string, currency: string) => Promise<{ user: AuthUser | null; error: AuthError | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function AuthProviderInner({ children }: { children: ReactNode }) {
  const { isDemoMode, getDemoUser } = useDemoMode();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

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
        });
      }
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [isDemoMode, getDemoUser]);

  const loadProfile = async (userId: string) => {
    try {
      const profileData = await profileService.getProfile(userId);
      setProfile(profileData);
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    if (isDemoMode) {
      return { user: null, error: { message: "Cannot sign in while in demo mode" } as AuthError };
    }
    return await authService.signIn(email, password);
  };

  const signUp = async (email: string, password: string, fullName: string, role: string, currency: string) => {
    if (isDemoMode) {
      return { user: null, error: { message: "Cannot sign up while in demo mode" } as AuthError };
    }
    return await authService.signUp(email, password, fullName, role, currency);
  };

  const signOut = async () => {
    if (isDemoMode) {
      return;
    }
    await authService.signOut();
    setUser(null);
    setProfile(null);
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
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, updateProfile }}>
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
