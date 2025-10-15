import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { profileService } from "@/services/profileService";
import { onboardingService } from "@/services/onboardingService";

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: any;
  created_at?: string;
}

export interface AuthError {
  message: string;
  code?: string;
}

// Dynamic URL Helper
const getURL = () => {
  let url = process?.env?.NEXT_PUBLIC_VERCEL_URL ?? 
           process?.env?.NEXT_PUBLIC_SITE_URL ?? 
           'http://localhost:3000'
  
  // Handle undefined or null url
  if (!url) {
    url = 'http://localhost:3000';
  }
  
  // Ensure url has protocol
  url = url.startsWith('http') ? url : `https://${url}`
  
  // Ensure url ends with slash
  url = url.endsWith('/') ? url : `${url}/`
  
  return url
}

// Helper to wait for profile creation by database trigger
async function waitForProfile(userId: string, maxAttempts = 5): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const profile = await profileService.getProfile(userId);
    if (profile) {
      return true;
    }
    // Wait 500ms before next attempt
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

export const authService = {
  // Get current user
  async getCurrentUser(): Promise<AuthUser | null> {
    const { data: { user } } = await supabase.auth.getUser();
    return user ? {
      id: user.id,
      email: user.email || "",
      user_metadata: user.user_metadata,
      created_at: user.created_at
    } : null;
  },

  // Get current session
  async getCurrentSession(): Promise<Session | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  // Sign up with email and password
  async signUp(
    email: string, 
    password: string, 
    fullName: string, 
    role: string, 
    currency: string,
    phone?: string // BUG FIX #4: Add phone parameter
  ): Promise<{ user: AuthUser | null; error: AuthError | null }> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: role,
            currency: currency,
            phone: phone || null // BUG FIX #4: Include phone in user metadata
          }
        }
      });

      if (error) {
        return { user: null, error: { message: error.message, code: error.status?.toString() } };
      }

      if (!data.user) {
        return { user: null, error: { message: "User creation failed" } };
      }

      // BUG FIX #1: Wait for database trigger to create profile
      const profileCreated = await waitForProfile(data.user.id);
      
      if (!profileCreated) {
        console.error("Profile was not created by database trigger");
        return { 
          user: null, 
          error: { message: "Profile creation failed. Please try again or contact support." } 
        };
      }

      // BUG FIX #5: Ensure profile has valid subscription_status
      // Update profile with phone and ensure subscription fields are set
      try {
        const profile = await profileService.getProfile(data.user.id);
        if (profile && (!profile.phone || !profile.subscription_status)) {
          await profileService.updateProfile(data.user.id, {
            phone: phone || null,
            phone_number: phone || null,
            subscription_status: profile.subscription_status || "trial", // BUG FIX #5: Ensure valid status
            subscription_plan: profile.subscription_plan || "free",
            trial_ends_at: profile.trial_ends_at || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
          });
        }
      } catch (updateError) {
        console.error("Error updating profile after creation:", updateError);
        // Don't fail registration if profile update fails
      }

      // Now safely initialize onboarding data
      try {
        await onboardingService.initializeUserData({
          userId: data.user.id,
          companyName: fullName,
          email: email,
          fullName: fullName,
          currency: currency
        });
      } catch (onboardingError) {
        console.error("Error initializing onboarding data:", onboardingError);
        // Don't fail registration if onboarding initialization fails
      }

      const authUser = {
        id: data.user.id,
        email: data.user.email || "",
        user_metadata: data.user.user_metadata,
        created_at: data.user.created_at
      };

      return { user: authUser, error: null };
    } catch (error) {
      console.error("Unexpected signup error:", error);
      return { 
        user: null, 
        error: { message: "An unexpected error occurred during sign up" } 
      };
    }
  },

  // Sign in with email and password
  async signIn(email: string, password: string): Promise<{ user: AuthUser | null; error: AuthError | null }> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { user: null, error: { message: error.message, code: error.status?.toString() } };
      }

      const authUser = data.user ? {
        id: data.user.id,
        email: data.user.email || "",
        user_metadata: data.user.user_metadata,
        created_at: data.user.created_at
      } : null;

      return { user: authUser, error: null };
    } catch (error) {
      console.error("Unexpected signin error:", error);
      return { 
        user: null, 
        error: { message: "An unexpected error occurred during sign in" } 
      };
    }
  },

  // Sign in with Google OAuth
  async signInWithGoogle(): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${getURL()}auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          }
        }
      });

      if (error) {
        return { error: { message: error.message } };
      }

      return { error: null };
    } catch (error) {
      console.error("Unexpected Google signin error:", error);
      return { 
        error: { message: "An unexpected error occurred during Google sign in" } 
      };
    }
  },

  // Handle OAuth callback and create profile if needed
  async handleOAuthCallback(userId: string, email: string, fullName: string): Promise<void> {
    try {
      // BUG FIX #2: Check if profile exists first, wait for database trigger
      const profileCreated = await waitForProfile(userId);
      
      if (!profileCreated) {
        console.error("OAuth profile was not created by database trigger");
        throw new Error("Profile creation failed during OAuth");
      }

      // Verify profile exists before initializing onboarding
      const profile = await profileService.getProfile(userId);
      if (!profile) {
        throw new Error("Profile not found after OAuth signup");
      }

      // Now safely initialize onboarding for OAuth users
      try {
        await onboardingService.initializeUserData({
          userId: userId,
          companyName: fullName || email.split("@")[0],
          email: email,
          fullName: fullName || email.split("@")[0],
          currency: "ZAR"
        });
      } catch (onboardingError) {
        console.error("Error initializing onboarding data:", onboardingError);
        // Don't fail OAuth if onboarding initialization fails
      }
    } catch (error) {
      console.error("Error handling OAuth callback:", error);
      throw error;
    }
  },

  // Sign out
  async signOut(): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        return { error: { message: error.message } };
      }

      return { error: null };
    } catch (error) {
      console.error("Unexpected signout error:", error);
      return { 
        error: { message: "An unexpected error occurred during sign out" } 
      };
    }
  },

  // Reset password
  async resetPassword(email: string): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${getURL()}auth/reset-password`,
      });

      if (error) {
        return { error: { message: error.message } };
      }

      return { error: null };
    } catch (error) {
      console.error("Unexpected password reset error:", error);
      return { 
        error: { message: "An unexpected error occurred during password reset" } 
      };
    }
  },

  // Confirm email (REQUIRED)
  async confirmEmail(token: string, type: 'signup' | 'recovery' | 'email_change' = 'signup'): Promise<{ user: AuthUser | null; error: AuthError | null }> {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: type
      });

      if (error) {
        return { user: null, error: { message: error.message, code: error.status?.toString() } };
      }

      const authUser = data.user ? {
        id: data.user.id,
        email: data.user.email || "",
        user_metadata: data.user.user_metadata,
        created_at: data.user.created_at
      } : null;

      return { user: authUser, error: null };
    } catch (error) {
      console.error("Unexpected email confirmation error:", error);
      return { 
        user: null, 
        error: { message: "An unexpected error occurred during email confirmation" } 
      };
    }
  },

  // Listen to auth state changes
  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange(callback);
  }
};
