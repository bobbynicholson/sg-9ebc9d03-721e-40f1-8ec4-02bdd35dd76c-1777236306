import { useEffect, useState } from "react";
import { isWhiteLabelRow, type BrandingRow } from "./applyBranding";
import { getBrandingRow, subscribeBranding } from "./store";

/**
 * React reader for the active tenant's branding row. Subscribes to the
 * module-level store fed by `<TenantBrandingApplier />` in `_app.tsx`.
 */
export function useBrandingRow(): BrandingRow | null {
  const [row, setRow] = useState<BrandingRow | null>(getBrandingRow);
  useEffect(() => subscribeBranding(setRow), []);
  return row;
}

export function useIsWhiteLabeled(): boolean {
  const row = useBrandingRow();
  return isWhiteLabelRow(row);
}
