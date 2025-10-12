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

const DEMO_USERS: Record<Exclude<DemoRole, null>, DemoUser> = {
  admin: {
    id: "demo-admin-001",
    email: "admin@cateros-demo.com",
    full_name: "Sarah Admin",
    role: "admin",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah"
  },
  driver: {
    id: "demo-driver-001",
    email: "driver@cateros-demo.com",
    full_name: "Mike Driver",
    role: "driver",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Mike"
  },
  client: {
    id: "demo-client-001",
    email: "client@cateros-demo.com",
    full_name: "Lisa Client",
    role: "client",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Lisa"
  },
  kitchen: {
    id: "demo-kitchen-001",
    email: "kitchen@cateros-demo.com",
    full_name: "Chef Antonio",
    role: "kitchen",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Antonio"
  },
  shopping: {
    id: "demo-shopping-001",
    email: "shopping@cateros-demo.com",
    full_name: "Emma Shopping",
    role: "shopping",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Emma"
  },
  cleaning: {
    id: "demo-cleaning-001",
    email: "cleaning@cateros-demo.com",
    full_name: "James Cleaning",
    role: "cleaning",
    avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=James"
  }
};

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoRole, setDemoRoleState] = useState<DemoRole>(null);

  useEffect(() => {
    const savedDemoMode = localStorage.getItem("cateros-demo-mode");
    const savedDemoRole = localStorage.getItem("cateros-demo-role") as DemoRole;
    
    if (savedDemoMode === "true") {
      setIsDemoMode(true);
      setDemoRoleState(savedDemoRole || "admin");
    }
  }, []);

  const setDemoMode = (enabled: boolean) => {
    setIsDemoMode(enabled);
    localStorage.setItem("cateros-demo-mode", enabled.toString());
    
    if (enabled && !demoRole) {
      setDemoRoleState("admin");
      localStorage.setItem("cateros-demo-role", "admin");
    } else if (!enabled) {
      setDemoRoleState(null);
      localStorage.removeItem("cateros-demo-role");
    }
  };

  const setDemoRole = (role: DemoRole) => {
    setDemoRoleState(role);
    if (role) {
      localStorage.setItem("cateros-demo-role", role);
    } else {
      localStorage.removeItem("cateros-demo-role");
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