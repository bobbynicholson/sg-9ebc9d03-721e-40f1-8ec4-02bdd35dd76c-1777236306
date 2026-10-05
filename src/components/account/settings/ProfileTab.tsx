/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RefObject } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Phone, Building2, Save, Camera, Briefcase } from "lucide-react";
import { ROLE_NAMES } from "@/lib/authGuards";
import type { ProfileFormData } from "./types";

interface Props {
  /** Authed profile row from useAuth(). */
  profile: any;
  /** Authed company row from useAuth(); may be null on tenants without a row yet. */
  company: { company_name?: string | null } | null;
  formData: ProfileFormData;
  onFormChange: (field: keyof ProfileFormData, value: string) => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
  uploadingAvatar: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  onAvatarPick: () => void;
  onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

type SummaryProps = Pick<Props, "profile" | "company" | "formData" | "uploadingAvatar" | "fileInputRef" | "onAvatarPick" | "onAvatarChange">;

/**
 * Identity card for the left column of /account/settings: photo, name,
 * login email, role, company and member-since, with the photo upload.
 * Same handlers as before - the parent owns the upload state.
 */
export function ProfileSummaryCard({
  profile,
  company,
  formData,
  uploadingAvatar,
  fileInputRef,
  onAvatarPick,
  onAvatarChange,
}: SummaryProps) {
  const role = profile?.role as string | undefined;
  const companyName = company?.company_name || profile?.company_name;
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <Card className="overflow-hidden border border-slate-200/90 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="h-20 bg-gradient-to-r from-brand-primary via-brand-primary/80 to-brand-secondary" aria-hidden="true" />
      <CardContent className="-mt-12 flex flex-col items-center px-5 pb-5 text-center">
        <div className="relative">
          <Avatar className="h-24 w-24 bg-white ring-4 ring-white shadow-md dark:ring-slate-900">
            <AvatarImage src={formData.avatar_url} className="object-contain" />
            <AvatarFallback className="bg-brand-primary/10 text-2xl font-semibold text-brand-primary">
              {getInitials(formData.full_name || "User")}
            </AvatarFallback>
          </Avatar>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={onAvatarChange}
          />
          <button
            type="button"
            onClick={onAvatarPick}
            disabled={uploadingAvatar}
            aria-label="Change photo"
            title="Change photo (JPG, PNG or WebP, max 5 MB)"
            className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white shadow transition hover:bg-slate-700 disabled:opacity-60 dark:border-slate-900"
          >
            <Camera className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-lg font-semibold leading-tight text-slate-950 dark:text-white">
          {formData.full_name || "Your name"}
        </p>
        {formData.email && (
          <p className="mt-0.5 flex max-w-full items-center gap-1.5 truncate text-sm text-slate-500 dark:text-slate-400">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{formData.email}</span>
          </p>
        )}
        {role && (
          <Badge variant="secondary" className="mt-3 gap-1 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/10">
            <Briefcase className="h-3 w-3" />
            {ROLE_NAMES[role as keyof typeof ROLE_NAMES] || role}
          </Badge>
        )}
        <dl className="mt-4 w-full space-y-2 border-t border-slate-100 pt-4 text-left text-sm dark:border-slate-800">
          {companyName && (
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-1.5 text-slate-500"><Building2 className="h-3.5 w-3.5" /> Company</dt>
              <dd className="truncate font-medium text-slate-900 dark:text-slate-100">{companyName}</dd>
            </div>
          )}
          {memberSince && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Member since</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">{memberSince}</dd>
            </div>
          )}
        </dl>
        <p className="mt-3 text-[11px] text-slate-400">
          {uploadingAvatar ? "Uploading photo..." : "Tap the camera to change your photo"}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Profile tab for /account/settings: the editable personal information.
 * The identity card (photo, role, company) lives in ProfileSummaryCard,
 * shown in the page's left column.
 */
export function ProfileTab({
  profile,
  formData,
  onFormChange,
  onSave,
  saving,
}: Props) {
  const role = profile?.role as string | undefined;
  const canEditCompanyName = role === "owner" || role === "admin" || role === "super_admin";

  return (
    <div className="space-y-5">
      <Card className="border border-slate-200/90 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg dark:text-white">
            <User className="h-5 w-5 text-brand-primary" />
            Personal information
          </CardTitle>
          <CardDescription className="dark:text-slate-400">
            Keep your name and contact details up to date.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="dark:text-slate-200">Full name</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-10 dark:bg-slate-700 dark:text-white dark:border-slate-600"
                  value={formData.full_name}
                  onChange={(e) => onFormChange("full_name", e.target.value)}
                  placeholder="John Doe"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-200">Login email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                {/* Read-only: this is the login identity. Editing it here only
                    wrote profiles.email and never touched the auth email, so a
                    "change" silently desynced the two (you'd still sign in with
                    the old address while notifications went to the new one).
                    Changing a login email needs a verified auth flow, not a
                    profile field. */}
                <Input
                  className="pl-10 bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600"
                  type="email"
                  value={formData.email}
                  disabled
                  readOnly
                  placeholder="john@example.com"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                This is your login email. To change it, contact your administrator.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-200">Phone number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-10 dark:bg-slate-700 dark:text-white dark:border-slate-600"
                  value={formData.phone_number}
                  onChange={(e) => onFormChange("phone_number", e.target.value)}
                  placeholder="+27 12 345 6789"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-200">Company name</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-10 dark:bg-slate-700 dark:text-white dark:border-slate-600"
                  value={formData.company_name}
                  onChange={(e) => onFormChange("company_name", e.target.value)}
                  placeholder="Your Company Ltd"
                  disabled={!canEditCompanyName}
                />
              </div>
              {canEditCompanyName && (
                <p className="text-[11px] text-slate-500">
                  Renames your company everywhere, invoices, emails, dashboard.
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button
              onClick={onSave}
              disabled={saving}
                className="bg-brand-primary text-white hover:bg-brand-primary/90"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
