import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { CompanyStatusBadge } from "./CompanyStatusBadge";
import type { Company } from "./types";

interface CompanyUser {
  id: string;
  email: string;
  full_name?: string;
  active_role: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCompany: Company | null;
  companyUsers: CompanyUser[];
}

/**
 * Read-only "view this company" modal. Renders company info + the
 * list of profiles that belong to it. Opens via the eye-icon button
 * on the company table (which loads the users into the parent's
 * companyUsers state before flipping isOpen).
 *
 * Extracted from /admin/platform/company-database as part of the
 * P2-13 audit split. Behaviour identical.
 */
export function CompanyDetailsModal({
  open,
  onOpenChange,
  selectedCompany,
  companyUsers,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{selectedCompany?.company_name}</DialogTitle>
          <DialogDescription>Company details and users</DialogDescription>
        </DialogHeader>

        {selectedCompany && (
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-600">Company Slug</Label>
                <p className="font-semibold">/{selectedCompany.company_slug}</p>
              </div>
              <div>
                <Label className="text-slate-600">Status</Label>
                <div>
                  <CompanyStatusBadge status={selectedCompany.subscription_status} />
                </div>
              </div>
              <div>
                <Label className="text-slate-600">Email</Label>
                <p>{selectedCompany.email}</p>
              </div>
              <div>
                <Label className="text-slate-600">Phone</Label>
                <p>{selectedCompany.phone || "-"}</p>
              </div>
              <div className="col-span-2">
                <Label className="text-slate-600">Address</Label>
                <p>
                  {selectedCompany.address_line1}, {selectedCompany.city},{" "}
                  {selectedCompany.country}
                </p>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Company Users ({companyUsers.length})
              </h3>

              <div className="space-y-2">
                {companyUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <div>
                      <p className="font-semibold">{user.full_name || user.email}</p>
                      <p className="text-sm text-slate-600">{user.email}</p>
                    </div>
                    <Badge>{user.active_role}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
