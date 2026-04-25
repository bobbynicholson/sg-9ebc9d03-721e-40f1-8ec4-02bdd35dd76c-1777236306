/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

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
  
  if (!url) {
    url = 'http://localhost:3000';
  }
  
  url = url.startsWith('http') ? url : `https://${url}`
  url = url.endsWith('/') ? url : `${url}/`
  
  return url
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
  async signUp(email: string, password: string, metadata?: Record<string, any>): Promise<{ user: AuthUser | null; error: AuthError | null }> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${getURL()}auth/callback`,
          data: metadata || {}
        }
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
    } catch (error: any) {
      return { 
        user: null, 
        error: { message: error?.message || "An unexpected error occurred during sign up" } 
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
    } catch (error: any) {
      return { 
        user: null, 
        error: { message: error?.message || "An unexpected error occurred during sign in" } 
      };
    }
  },

  // Sign in with Google OAuth
  async signInWithGoogle(): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${getURL()}auth/callback`,
        }
      });
      
      if (error) {
        return { error: { message: error.message } };
      }

      return { error: null };
    } catch (error: any) {
      return { 
        error: { message: error?.message || "An unexpected error occurred during Google sign in" } 
      };
    }
  },

  // Handle OAuth callback
  async handleOAuthCallback(): Promise<{ user: AuthUser | null; error: AuthError | null }> {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) {
        return { user: null, error: { message: error.message } };
      }

      const authUser = user ? {
        id: user.id,
        email: user.email || "",
        user_metadata: user.user_metadata,
        created_at: user.created_at
      } : null;

      return { user: authUser, error: null };
    } catch (error: any) {
      return { 
        user: null, 
        error: { message: error?.message || "An unexpected error occurred during OAuth callback" } 
      };
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
    } catch (error: any) {
      return { 
        error: { message: error?.message || "An unexpected error occurred during sign out" } 
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
      return { 
        error: { message: error?.message || "An unexpected error occurred during password reset" } 
      };
    }
  },

  // Listen to auth state changes
  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange(callback);
  }
};