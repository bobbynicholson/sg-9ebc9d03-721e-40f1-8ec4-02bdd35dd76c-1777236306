import { createContext, useContext, ReactNode } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { UserRole } from "@/types/app";

type Company = Tables<"companies">;

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
  user_metadata?: any;
  app_metadata?: any;
  aud?: string;
  created_at?: string;
  updated_at?: string;
};

type Profile = Partial<AuthenticatedUser>;

interface AuthContextType {
  user: AuthenticatedUser | null;
  profile: Profile | null;
  company: Company | null;
  companySlug: string | null;
  loading: boolean;
  error: string | null;
  userRoles: any[];
  activeRole: string;
  switchRole: (newRole: UserRole) => Promise<void>;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string, metadata: any, isOwner?: boolean) => Promise<any>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock user for preview mode - allows viewing all pages
const mockUser: AuthenticatedUser = {
  id: "preview-user-id",
  email: "preview@cateringms.com",
  full_name: "Preview User",
  role: "admin" as UserRole,
  active_role: "admin",
  avatar_url: "",
  currency: "ZAR",
  company_id: "preview-company-id",
  company_name: "Preview Company",
  company_slug: "preview-company",
  phone_number: "+27 21 555 0000",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const contextValue: AuthContextType = {
    user: mockUser,
    profile: mockUser,
    company: null,
    companySlug: "preview-company",
    loading: false,
    error: null,
    userRoles: [{ 
      id: "preview-role", 
      user_id: mockUser.id, 
      department: "admin",
      is_primary: true,
      assigned_at: new Date().toISOString(),
      assigned_by: "system",
      created_at: new Date().toISOString()
    }],
    activeRole: "admin",
    switchRole: async () => {},
    signIn: async () => ({ user: mockUser, error: null }),
    signUp: async () => ({ user: mockUser, error: null }),
    signOut: async () => {},
    updateProfile: async () => {},
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}