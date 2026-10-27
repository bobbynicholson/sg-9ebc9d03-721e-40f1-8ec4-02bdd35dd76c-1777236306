import { createContext, useContext } from "react";
import type { Tables } from "@/integrations/supabase/types";
import type { UserRole } from "@/types/app";

/**
 * The auth context object, its types and `useAuth`, with no Supabase client
 * attached. `AuthContext.tsx` (the real provider) and the light provider used
 * on public marketing pages (`components/app/MarketingAuthProvider`) both
 * provide THIS context, so any component can call `useAuth()` from here
 * without pulling the Supabase client into its bundle.
 *
 * `@/contexts/AuthContext` re-exports `useAuth`, so existing imports keep
 * working unchanged.
 */

type Company = Tables<"companies">;
type DbProfile = Tables<"profiles">;

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
  user_metadata?: {
    company_id?: string;
    company_slug?: string;
    full_name?: string;
    avatar_url?: string;
    [key: string]: unknown;
  };
  app_metadata?: {
    provider?: string;
    [key: string]: unknown;
  };
  aud?: string;
  created_at?: string;
  updated_at?: string;
};

export interface AuthContextType {
  user: AuthenticatedUser | null;
  profile: DbProfile | null;
  company: Company | null;
  companySlug: string | null;
  loading: boolean;
  error: string | null;
  userRoles: UserRole[];
  activeRole: string;
  switchRole: (newRole: UserRole) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ user: unknown; error: { message: string } | null }>;
  signUp: (email: string, password: string, metadata: Record<string, unknown>) => Promise<{ user: unknown; error: { message: string } | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<DbProfile>) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
