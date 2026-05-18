/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RefObject } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Mail, Phone, Building2, Save, Camera, Briefcase, Globe } from "lucide-react";
import { ROLE_NAMES } from "@/lib/authGuards";
import type { AccountPreferences, ProfileFormData } from "./types";

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
  preferences: AccountPreferences;
  onPreferencesChange: (next: AccountPreferences) => void;
  onPreferencesSave: () => void | Promise<void>;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Profile tab for /account/settings. Three cards: profile overview
 * (avatar + role + created date), personal information (editable
 * fields), and display / regional preferences.
 *
 * Parent retains ownership of formData / preferences / avatar
 * upload state so the parent-level Save bar and the data fetched
 * from useAuth stay the source of truth. The tab is pure
 * presentation.
 *
 * Extracted from inline in src/pages/account/settings.tsx (P2-13
 * account/settings split).
 */
export function ProfileTab({
  profile,
  company,
  formData,
  onFormChange,
  onSave,
  saving,
  uploadingAvatar,
  fileInputRef,
  onAvatarPick,
  onAvatarChange,
  preferences,
  onPreferencesChange,
  onPreferencesSave,
}: Props) {
  const role = profile?.role as string | undefined;
  const canEditCompanyName = role === "owner" || role === "admin" || role === "super_admin";

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-lg dark:bg-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <User className="w-5 h-5" />
            Profile Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <div className="flex flex-col items-center gap-3">
              <Avatar className="w-24 h-24">
                <AvatarImage src={formData.avatar_url} />
                <AvatarFallback className="text-2xl bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300">
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
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={onAvatarPick}
                disabled={uploadingAvatar}
              >
                <Camera className="w-4 h-4 mr-2" />
                {uploadingAvatar ? "Uploading..." : "Change Photo"}
              </Button>
              <p className="text-[10px] text-slate-500 text-center">JPG, PNG or WebP. Max 5 MB.</p>
            </div>

            <div className="flex-1 space-y-4">
              <div>
                <Label className="text-sm text-slate-600 dark:text-slate-400">Role</Label>
                <div className="mt-1">
                  <Badge variant="secondary" className="text-sm">
                    <Briefcase className="w-3 h-3 mr-1" />
                    {ROLE_NAMES[role as keyof typeof ROLE_NAMES] || role}
                  </Badge>
                </div>
              </div>

              <div>
                <Label className="text-sm text-slate-600 dark:text-slate-400">Account Created</Label>
                <p className="text-slate-900 dark:text-slate-100">
                  {new Date(profile?.created_at || "").toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>

              {(company?.company_name || profile?.company_name) && (
                <div>
                  <Label className="text-sm text-slate-600 dark:text-slate-400">Company</Label>
                  <p className="text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    {company?.company_name || profile?.company_name}
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg dark:bg-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <User className="w-5 h-5" />
            Personal Information
          </CardTitle>
          <CardDescription className="dark:text-slate-400">
            Update your personal details and contact information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="dark:text-slate-200">Full Name</Label>
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
              <Label className="dark:text-slate-200">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-10 dark:bg-slate-700 dark:text-white dark:border-slate-600"
                  type="email"
                  value={formData.email}
                  onChange={(e) => onFormChange("email", e.target.value)}
                  placeholder="john@example.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-200">Phone Number</Label>
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
              <Label className="dark:text-slate-200">Company Name</Label>
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
              className="bg-orange-600 hover:bg-orange-700"
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

      <Card className="border-0 shadow-lg dark:bg-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Globe className="w-5 h-5" />
            Display & Regional Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="dark:text-slate-200">Language</Label>
              <Select
                value={preferences.language}
                onValueChange={(value) => onPreferencesChange({ ...preferences, language: value })}
              >
                <SelectTrigger className="dark:bg-slate-700 dark:text-white dark:border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="af">Afrikaans</SelectItem>
                  <SelectItem value="zu">Zulu</SelectItem>
                  <SelectItem value="xh">Xhosa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-200">Timezone</Label>
              <Select
                value={preferences.timezone}
                onValueChange={(value) => onPreferencesChange({ ...preferences, timezone: value })}
              >
                <SelectTrigger className="dark:bg-slate-700 dark:text-white dark:border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Africa/Johannesburg">Johannesburg (CAT)</SelectItem>
                  <SelectItem value="Africa/Cairo">Cairo (EET)</SelectItem>
                  <SelectItem value="Europe/London">London (GMT)</SelectItem>
                  <SelectItem value="America/New_York">New York (EST)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-200">Date Format</Label>
              <Select
                value={preferences.date_format}
                onValueChange={(value) => onPreferencesChange({ ...preferences, date_format: value })}
              >
                <SelectTrigger className="dark:bg-slate-700 dark:text-white dark:border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-slate-200">Currency Display</Label>
              <Select
                value={preferences.currency_display}
                onValueChange={(value) =>
                  onPreferencesChange({ ...preferences, currency_display: value })
                }
              >
                <SelectTrigger className="dark:bg-slate-700 dark:text-white dark:border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="symbol">Symbol (R, $, £)</SelectItem>
                  <SelectItem value="code">Code (ZAR, USD, GBP)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={onPreferencesSave} className="bg-orange-600 hover:bg-orange-700">
              <Save className="w-4 h-4 mr-2" />
              Save Preferences
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
