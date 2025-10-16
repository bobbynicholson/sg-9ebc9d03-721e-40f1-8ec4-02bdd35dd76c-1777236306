import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { companyService } from "./companyService";

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

const getURL = () => {
  // Check if we're in a browser environment
  if (typeof window !== "undefined") {
    // In browser, use window.location.origin
    return window.location.origin + "/";
  }

  // Server-side: try environment variables
  let url =
    process?.env?.NEXT_PUBLIC_VERCEL_URL ??
    process?.env?.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  // Ensure URL has protocol
  url = url.startsWith("http") ? url : `https://${url}`;
  // Ensure URL ends with slash
  url = url.endsWith("/") ? url : `${url}/`;

  return url;
};

export const authService = {
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

  async getCurrentSession(): Promise<Session | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session;
  },

  async signUp(
    email: string,
    password: string,
    fullName: string,
    role: string,
    currency: string,
    phone: string,
    companyName?: string
  ): Promise<{ user: AuthUser | null; error: AuthError | null; companySlug?: string }> {
    try {
      const metadata: Record<string, any> = {
        full_name: fullName,
        role: role,
        currency: currency,
        phone_number: phone,
      };

      if (companyName) {
        metadata.company_name = companyName;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${getURL()}auth/callback`,
          data: metadata,
        },
      });

      if (error) {
        if (error.message.includes("User already registered")) {
          return { user: null, error: { message: "A user with this email address already exists." } };
        }
        
        if (data.user && (
          error.message.includes("Email") || 
          error.message.includes("confirmation") ||
          error.message.includes("verify") ||
          error.message.includes("link is invalid")
        )) {
          const authUser = {
            id: data.user.id,
            email: data.user.email || "",
            user_metadata: data.user.user_metadata,
            created_at: data.user.created_at,
          };
          return { user: authUser, error: null };
        }
        
        return {
          user: null,
          error: { message: error.message, code: error.status?.toString() },
        };
      }

      if (!data.user) {
        return { user: null, error: { message: "Registration failed: no user returned." } };
      }

      const authUser = {
        id: data.user.id,
        email: data.user.email || "",
        user_metadata: data.user.user_metadata,
        created_at: data.user.created_at,
      };

      let companySlug: string | undefined;

      if (role === "admin" && companyName) {
        try {
          const slug = await companyService.generateUniqueSlug(companyName);
          
          const company = await companyService.createCompany({
            name: companyName,
            slug: slug,
            owner_id: data.user.id,
            email: email,
            phone: phone,
            currency: currency,
          });

          companySlug = company.slug;

          await supabase
            .from("profiles")
            .update({ company_id: company.id })
            .eq("id", data.user.id);
        } catch (companyError) {
          console.error("Error creating company:", companyError);
        }
      }

      return { user: authUser, error: null, companySlug };
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

  async handleOAuthCallback(): Promise<void> {
    console.log("OAuth callback handled. Profile creation is managed by database trigger.");
  },

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

  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    const { data } = supabase.auth.onAuthStateChange(callback);
    return data.subscription;
  },
};
