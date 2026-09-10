import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Building2, UserPlus } from "lucide-react";
import type { Company, CompanyFormData } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** non-null = "Edit Company" mode; null = "Add New Company". */
  editingCompany: Company | null;
  formData: CompanyFormData;
  setFormData: (data: CompanyFormData) => void;
  /** Fired by the trigger button before opening (resets form + clears editingCompany). */
  onTriggerNew: () => void;
  onCancel: () => void;
  onSave: () => void;
}

/**
 * Add or edit a catering company. Super-admin scoped (the parent
 * route gates on profile.active_role === 'super_admin'). One Dialog
 * + two modes - new-company mode shows an extra "Company Admin User"
 * section; edit mode hides it because admins are managed elsewhere.
 *
 * Extracted from /admin/platform/company-database as part of the
 * P2-13 audit split. Pure presentation; parent owns formData, the
 * editingCompany state, and the save/cancel handlers.
 */
export function AddEditCompanyDialog({
  open,
  onOpenChange,
  editingCompany,
  formData,
  setFormData,
  onTriggerNew,
  onCancel,
  onSave,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button onClick={onTriggerNew}>
          <Plus className="w-4 h-4 mr-2" />
          Add Company
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingCompany ? "Edit Company" : "Add New Company"}
          </DialogTitle>
          <DialogDescription>
            {editingCompany
              ? "Update company information"
              : "Create a new catering company and admin user"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Company Information
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Company Name *</Label>
                <Input
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  placeholder="e.g., Spit Braai Delivery"
                />
              </div>

              <div className="col-span-2">
                <Label>Company Slug *</Label>
                <Input
                  value={formData.company_slug}
                  onChange={(e) => setFormData({ ...formData, company_slug: e.target.value })}
                  placeholder="e.g., spit-braai-delivery"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Used in URLs: yoursite.com/{formData.company_slug}/login
                </p>
              </div>

              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contact@company.com"
                />
              </div>

              <div>
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+27 XX XXX XXXX"
                />
              </div>

              <div className="col-span-2">
                <Label>Address Line 1</Label>
                <Input
                  value={formData.address_line1}
                  onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                  placeholder="Street address"
                />
              </div>

              <div className="col-span-2">
                <Label>Address Line 2</Label>
                <Input
                  value={formData.address_line2}
                  onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                  placeholder="Unit, suite, etc. (optional)"
                />
              </div>

              <div>
                <Label>City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="City"
                />
              </div>

              <div>
                <Label>State/Province</Label>
                <Input
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="State"
                />
              </div>

              <div>
                <Label>Postal Code</Label>
                <Input
                  value={formData.postal_code}
                  onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                  placeholder="Postal code"
                />
              </div>

              <div>
                <Label>Country</Label>
                <Select
                  value={formData.country}
                  onValueChange={(value) => setFormData({ ...formData, country: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="South Africa">South Africa</SelectItem>
                    <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                    <SelectItem value="United States">United States</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Billing Currency</Label>
                <Select
                  value={formData.billing_currency}
                  onValueChange={(value) => setFormData({ ...formData, billing_currency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ZAR">ZAR (South Africa)</SelectItem>
                    <SelectItem value="GBP">GBP (UK)</SelectItem>
                    <SelectItem value="USD">USD (US)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {!editingCompany && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Company Admin User
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Admin Name</Label>
                  <Input
                    value={formData.admin_name}
                    onChange={(e) => setFormData({ ...formData, admin_name: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <Label>Admin Email *</Label>
                  <Input
                    type="email"
                    value={formData.admin_email}
                    onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
                    placeholder="admin@company.com"
                  />
                </div>

                <div className="col-span-2">
                  <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded p-2">
                    A unique temporary password is generated on save and shown once. Copy it and pass it to the new owner via a secure channel; they must change it on first login.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSave}>
            {editingCompany ? "Update Company" : "Create Company"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
