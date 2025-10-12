export interface WhiteLabelBranding {
  id: string;
  organizationName: string;
  logo?: string;
  logoUrl?: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  contactInfo?: {
    email?: string;
    phone?: string;
    website?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface BrandingContextType {
  branding: WhiteLabelBranding | null;
  updateBranding: (branding: Partial<WhiteLabelBranding>) => void;
  resetBranding: () => void;
  isWhiteLabeled: boolean;
}