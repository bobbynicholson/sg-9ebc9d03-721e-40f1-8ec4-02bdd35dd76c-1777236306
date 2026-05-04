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
  /** True while the initial fetch from the database is in flight. */
  loading: boolean;
  /** True while a save round-trip is in flight. */
  saving: boolean;
  /** Persists changes to the tenant's row in the companies table. */
  updateBranding: (branding: Partial<WhiteLabelBranding>) => Promise<void>;
  resetBranding: () => Promise<void>;
  isWhiteLabeled: boolean;
}
