import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: { [key: string]: any };
  created_at?: string;
}

export interface AuthError {
  message: string;
  code?: string;
}

// Dynamic URL Helper
const getURL = () => {
  let url =
    process?.env?.NEXT_PUBLIC_VERCEL_URL ??
    process?.env?.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  // Ensure url has protocol
  url = url.startsWith("http") ? url : `https://${url}`;
  // Ensure url ends with slash
  url = url.endsWith("/") ? url : `${url}/`;

  return url;
};

export const authService = {
  // Get current user
  async getCurrentUser(): Promise<AuthUser | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user
      ? {
          id: user.id,
          email: user.email || "",
          user_metadata: user.user_metadata,
          created_at: user.created_at,
        }
      : null;
  },

  // Get current session
  async getCurrentSession(): Promise<Session | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session;
  },

  // Sign up with email and password
  async signUp(
    email: string,
    password: string,
    fullName: string,
    role: string,
    currency: string,
    phone: string
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
            phone_number: phone,
            company_name: fullName, // Use full_name as company_name for now
          },
        },
      });

      if (error) {
        // Provide a more user-friendly error message for common issues
        if (error.message.includes("User already registered")) {
            return { user: null, error: { message: "A user with this email address already exists." } };
        }
        return {
          user: null,
          error: { message: error.message, code: error.status?.toString() },
        };
      }

      if (!data.user) {
        return { user: null, error: { message: "Registration failed: no user returned." } };
      }
      
      // The database trigger 'on_auth_user_created' now handles profile creation automatically.
      // No manual profile creation or polling is needed here.

      const authUser = {
        id: data.user.id,
        email: data.user.email || "",
        user_metadata: data.user.user_metadata,
        created_at: data.user.created_at,
      };

      return { user: authUser, error: null };
    } catch (error: any) {
      console.error("Unexpected signup error:", error);
      return {
        user: null,
        error: {
          message: error.message || "An unexpected server error occurred during sign up.",
        },
      };
    }
  },

  // Sign in with email and password
  async signIn(
    email: string,
    password: string
  ): Promise<{ user: AuthUser | null; error: AuthError | null }> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return {
          user: null,
          error: { message: error.message, code: error.status?.toString() },
        };
      }

      const authUser = data.user
        ? {
            id: data.user.id,
            email: data.user.email || "",
            user_metadata: data.user.user_metadata,
            created_at: data.user.created_at,
          }
        : null;

      return { user: authUser, error: null };
    } catch (error: any) {
      console.error("Unexpected signin error:", error);
      return {
        user: null,
        error: {
          message: error.message || "An unexpected error occurred during sign in.",
        },
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
          },
        },
      });

      if (error) {
        return { error: { message: error.message } };
      }

      return { error: null };
    } catch (error: any) {
      console.error("Unexpected Google signin error:", error);
      return {
        error: { message: error.message || "An unexpected error occurred during Google sign in." },
      };
    }
  },

  // Handle OAuth callback - the trigger handles profile creation
  async handleOAuthCallback(): Promise<void> {
    // The on_auth_user_created trigger handles profile creation automatically.
    // We can add logic here if we need to perform actions AFTER login,
    // like redirecting the user or fetching additional data.
    console.log("OAuth callback handled. Profile creation is managed by database trigger.");
  },

  // Sign out
  async signOut(): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        return { error: { message: error.message } };
      }

      return { error: null };
    } catch (error: any) {
      console.error("Unexpected signout error:", error);
      return {
        error: { message: error.message || "An unexpected error occurred during sign out." },
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
    } catch (error: any) {
      console.error("Unexpected password reset error:", error);
      return {
        error: { message: error.message || "An unexpected error occurred during password reset." },
      };
    }
  },

  // Listen to auth state changes
  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    const { data } = supabase.auth.onAuthStateChange(callback);
    return data.subscription;
  },
};