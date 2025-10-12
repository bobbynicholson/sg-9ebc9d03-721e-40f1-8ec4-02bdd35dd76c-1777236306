import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { WhiteLabelBranding, BrandingContextType } from "@/types/whitelabel";

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

const DEFAULT_BRANDING: WhiteLabelBranding = {
  id: "default",
  organizationName: "CaterOS",
  colors: {
    primary: "#2563eb",
    secondary: "#7c3aed",
    accent: "#f59e0b",
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<WhiteLabelBranding | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("white_label_branding");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setBranding(parsed);
        applyBrandingToDOM(parsed);
      } catch (e) {
        console.error("Error loading branding:", e);
        setBranding(DEFAULT_BRANDING);
      }
    } else {
      setBranding(DEFAULT_BRANDING);
    }
  }, []);

  const applyBrandingToDOM = (brandingData: WhiteLabelBranding) => {
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.style.setProperty("--brand-primary", brandingData.colors.primary);
      root.style.setProperty("--brand-secondary", brandingData.colors.secondary);
      root.style.setProperty("--brand-accent", brandingData.colors.accent);
    }
  };

  const updateBranding = (updates: Partial<WhiteLabelBranding>) => {
    const updated = {
      ...branding,
      ...updates,
      updatedAt: new Date().toISOString(),
    } as WhiteLabelBranding;
    
    setBranding(updated);
    localStorage.setItem("white_label_branding", JSON.stringify(updated));
    applyBrandingToDOM(updated);
  };

  const resetBranding = () => {
    setBranding(DEFAULT_BRANDING);
    localStorage.removeItem("white_label_branding");
    applyBrandingToDOM(DEFAULT_BRANDING);
  };

  const isWhiteLabeled = branding?.id !== "default" && branding?.organizationName !== "CaterOS";

  return (
    <BrandingContext.Provider
      value={{
        branding,
        updateBranding,
        resetBranding,
        isWhiteLabeled,
      }}
    >
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error("useBranding must be used within a BrandingProvider");
  }
  return context;
}