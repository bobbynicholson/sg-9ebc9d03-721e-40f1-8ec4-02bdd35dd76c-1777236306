import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type DemoRole = "admin" | "driver" | "client" | "kitchen" | "shopping" | "cleaning" | null;

interface DemoUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  avatar_url?: string;
}

interface DemoModeContextType {
  isDemoMode: boolean;
  demoRole: DemoRole;
  setDemoMode: (enabled: boolean) => void;
  setDemoRole: (role: DemoRole) => void;
  getDemoUser: () => DemoUser | null;
}

const DemoModeContext = createContext<DemoModeContextType | undefined>(undefined);

export const DEMO_USERS = {
  admin: {
    id: "demo-admin",
    email: "admin@bobscatering.co.za",
    role: "admin" as const,
    full_name: "Bob Thompson",
    company_name: "Bob's Catering",
    company_slug: "bobs-catering"
  },
  driver: {
    id: "demo-driver",
    email: "driver@bobscatering.co.za",
    role: "driver" as const,
    full_name: "James Wilson",
    company_name: "Bob's Catering",
    company_slug: "bobs-catering"
  },
  client: {
    id: "demo-client",
    email: "sarah.johnson@gmail.com",
    role: "client" as const,
    full_name: "Sarah Johnson",
    company_name: "Bob's Catering",
    company_slug: "bobs-catering"
  },
  kitchen: {
    id: "demo-kitchen",
    email: "kitchen@bobscatering.co.za",
    role: "kitchen" as const,
    full_name: "Chef Marcus",
    company_name: "Bob's Catering",
    company_slug: "bobs-catering"
  },
  shopping: {
    id: "demo-shopping",
    email: "shopping@bobscatering.co.za",
    role: "shopping" as const,
    full_name: "Linda Martinez",
    company_name: "Bob's Catering",
    company_slug: "bobs-catering"
  },
  cleaning: {
    id: "demo-cleaning",
    email: "cleaning@bobscatering.co.za",
    role: "cleaning" as const,
    full_name: "David Chen",
    company_name: "Bob's Catering",
    company_slug: "bobs-catering"
  }
};

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoRole, setDemoRoleState] = useState<DemoRole>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedDemoMode = localStorage.getItem("cateringms-demo-mode");
    const savedDemoRole = localStorage.getItem("cateringms-demo-role") as DemoRole;
    
    if (savedDemoMode === "true") {
      setIsDemoMode(true);
      setDemoRoleState(savedDemoRole || "admin");
    }
  }, []);

  const setDemoMode = (enabled: boolean) => {
    if (!mounted) return;
    
    setIsDemoMode(enabled);
    localStorage.setItem("cateringms-demo-mode", enabled.toString());
    
    if (enabled && !demoRole) {
      setDemoRoleState("admin");
      localStorage.setItem("cateringms-demo-role", "admin");
    } else if (!enabled) {
      setDemoRoleState(null);
      localStorage.removeItem("cateringms-demo-role");
    }
  };

  const setDemoRole = (role: DemoRole) => {
    if (!mounted) return;
    
    setDemoRoleState(role);
    if (role) {
      localStorage.setItem("cateringms-demo-role", role);
    } else {
      localStorage.removeItem("cateringms-demo-role");
    }
  };

  const getDemoUser = (): DemoUser | null => {
    if (!isDemoMode || !demoRole) return null;
    return DEMO_USERS[demoRole];
  };

  return (
    <DemoModeContext.Provider
      value={{
        isDemoMode,
        demoRole,
        setDemoMode,
        setDemoRole,
        getDemoUser
      }}
    >
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  const context = useContext(DemoModeContext);
  if (context === undefined) {
    // Return safe default values instead of throwing during SSR
    if (typeof window === "undefined") {
      return {
        isDemoMode: false,
        demoRole: null,
        setDemoMode: () => {},
        setDemoRole: () => {},
        getDemoUser: () => null
      };
    }
    throw new Error("useDemoMode must be used within a DemoModeProvider");
  }
  return context;
}
