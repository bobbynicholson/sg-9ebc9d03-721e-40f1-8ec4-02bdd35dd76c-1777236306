import { useRef } from "react";
import {
  Building2, Calendar, Globe, Hash, Landmark, List, MapPin, Palette, ReceiptText, Wallet,
} from "lucide-react";
import { PortalHeaderIconAction } from "@/components/portal/PortalHeaderIconAction";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const COMPANY_PROFILE_SECTIONS = [
  { id: "section-identity", label: "Identity", icon: Building2 },
  { id: "section-region", label: "Region", icon: Globe },
  { id: "section-peak", label: "Peak season", icon: Calendar },
  { id: "section-cash", label: "Cash", icon: Wallet },
  { id: "section-vat", label: "VAT", icon: ReceiptText },
  { id: "section-banking", label: "Banking", icon: Landmark },
  { id: "section-address", label: "Address", icon: MapPin },
  { id: "section-numbering", label: "Numbering", icon: Hash },
  { id: "section-brand", label: "Branding", icon: Palette },
] as const;

export function CompanyProfileShortcuts({ onSelect }: { onSelect: (id: string) => void }) {
  const selectedSection = useRef(false);
  return (
    <nav aria-label="Company profile sections">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <PortalHeaderIconAction icon={List} label="Jump to company profile section" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          collisionPadding={12}
          className="max-h-[min(70vh,24rem)] w-[min(calc(100vw-1.5rem),18rem)] overflow-y-auto"
          onCloseAutoFocus={(event) => {
            if (selectedSection.current) {
              event.preventDefault();
              selectedSection.current = false;
            }
          }}
        >
          <DropdownMenuLabel>Jump to section</DropdownMenuLabel>
          {COMPANY_PROFILE_SECTIONS.map(({ id, label, icon: Icon }) => (
            <DropdownMenuItem key={id} className="min-h-[44px] gap-3 text-sm" onSelect={() => {
              selectedSection.current = true;
              onSelect(id);
            }}>
              <Icon aria-hidden="true" className="h-4 w-4 text-slate-600" />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
