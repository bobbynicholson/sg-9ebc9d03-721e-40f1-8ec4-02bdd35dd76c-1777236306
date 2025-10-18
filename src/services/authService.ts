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
  try {
    // BROWSER: Most reliable source
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      // Validate origin is not null or empty
      if (origin && origin !== "null" && origin !== "undefined") {
        return origin.endsWith("/") ? origin : `${origin}/`;
      }
      // Fallback for edge cases
      console.warn("Invalid window.location.origin, using localhost fallback");
      return "http://localhost:3000/";
    }

    // SERVER: Build URL from environment with validation
    let rawUrl =
      process?.env?.NEXT_PUBLIC_VERCEL_URL ??
      process?.env?.NEXT_PUBLIC_SITE_URL ??
      "";

    // If no environment variables, use localhost
    if (!rawUrl || rawUrl.trim() === "") {
      return "http://localhost:3000/";
    }

    // Clean the URL
    rawUrl = rawUrl.trim();
    
    // Add protocol if missing
    if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
      rawUrl = `https://${rawUrl}`;
    }
    
    // Ensure trailing slash
    const finalUrl = rawUrl.endsWith("/") ? rawUrl : `${rawUrl}/`;

    // Validate URL is well-formed before returning
    try {
      const testUrl = new URL(finalUrl);
      // Additional validation: ensure hostname is not empty
      if (!testUrl.hostname || testUrl.hostname === "") {
        throw new Error("Invalid hostname");
      }
      return finalUrl;
    } catch (urlError) {
      console.error("Invalid URL constructed:", finalUrl, urlError);
      return "http://localhost:3000/";
    }
  } catch (error) {
    // Catch-all safety net
    console.error("Critical error in getURL():", error);
    return "http://localhost:3000/";
  }
};

export const authService = {
  async getCurrentUser(): Promise<AuthUser | null> {
    try {
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
    } catch (error) {
      console.error("Error getting current user:", error);
      return null;
    }
  },

  async getCurrentSession(): Promise<Session | null> {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session;
    } catch (error) {
      console.error("Error getting current session:", error);
      return null;
    }
  },

  async signUp(
    email: string,
    password: string,
    metadata: {
      full_name: string;
      role?: string;
      currency?: string;
      phone_number?: string;
      company_name?: string;
      company_slug?: string;
    },
    isOwner: boolean = false,
    companyName?: string,
    companyId?: string
  ): Promise<{ user: AuthUser | null; error: AuthError | null; companySlug?: string }> {
    try {
      const authMetadata: Record<string, any> = {
        full_name: metadata.full_name,
        role: metadata.role || (isOwner ? "owner" : "client"),
        currency: metadata.currency || "ZAR",
        phone_number: metadata.phone_number,
      };

      if (companyName || metadata.company_name) {
        authMetadata.company_name = companyName || metadata.company_name;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${getURL()}auth/callback`,
          data: authMetadata,
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

      let companySlug: string | undefined = metadata.company_slug;

      if ((isOwner || authMetadata.role === 'admin') && (companyName || metadata.company_name)) {
        try {
          const finalCompanyName = companyName || metadata.company_name!;
          const slug = await companyService.generateUniqueSlug(finalCompanyName);
          
          const companyResult = await companyService.createCompany({
            name: finalCompanyName,
            slug: slug,
            owner_id: data.user.id,
            email: email,
            phone: metadata.phone_number,
            currency: metadata.currency,
          });

          if (companyResult.success && companyResult.company) {
            companySlug = companyResult.company.slug;

            await supabase
              .from("profiles")
              .update({ 
                company_id: companyResult.company.id,
                company_slug: companyResult.company.slug
              })
              .eq("id", data.user.id);
          } else {
            console.error("Failed to create company during signup:", companyResult.error);
          }

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
