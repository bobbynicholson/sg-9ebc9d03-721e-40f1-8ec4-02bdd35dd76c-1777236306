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
    email: "admin@cateringms-demo.com",
    role: "admin" as const,
    fullName: "Demo Admin"
  },
  driver: {
    id: "demo-driver",
    email: "driver@cateringms-demo.com",
    role: "driver" as const,
    fullName: "Demo Driver"
  },
  client: {
    id: "demo-client",
    email: "client@cateringms-demo.com",
    role: "client" as const,
    fullName: "Demo Client"
  },
  kitchen: {
    id: "demo-kitchen",
    email: "kitchen@cateringms-demo.com",
    role: "kitchen" as const,
    fullName: "Demo Kitchen Staff"
  },
  shopping: {
    id: "demo-shopping",
    email: "shopping@cateringms-demo.com",
    role: "shopping" as const,
    fullName: "Demo Shopping Team"
  },
  cleaning: {
    id: "demo-cleaning",
    email: "cleaning@cateringms-demo.com",
    role: "cleaning" as const,
    fullName: "Demo Cleaning Team"
  }
};

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoRole, setDemoRoleState] = useState<DemoRole>(null);

  useEffect(() => {
    const savedDemoMode = localStorage.getItem("cateringms-demo-mode");
    const savedDemoRole = localStorage.getItem("cateringms-demo-role") as DemoRole;
    
    if (savedDemoMode === "true") {
      setIsDemoMode(true);
      setDemoRoleState(savedDemoRole || "admin");
    }
  }, []);

  const setDemoMode = (enabled: boolean) => {
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
    throw new Error("useDemoMode must be used within a DemoModeProvider");
  }
  return context;
}
