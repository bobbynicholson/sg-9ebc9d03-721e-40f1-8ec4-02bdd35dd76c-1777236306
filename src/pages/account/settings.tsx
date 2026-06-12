import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalLayout } from "@/components/Layout";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { User, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { NotificationsTab } from "@/components/account/settings/NotificationsTab";
import { PrivacyTab } from "@/components/account/settings/PrivacyTab";
import { ProfileTab } from "@/components/account/settings/ProfileTab";
import { SecurityTab } from "@/components/account/settings/SecurityTab";
import type {
  NotificationPreferences,
  PrivacySettings,
  AccountPreferences,
  ProfileFormData,
  PasswordFormData,
} from "@/components/account/settings/types";

function ProfileSettingsPage() {
  // Pull `company` alongside `profile` so we can show the canonical
  // company name even when profiles.company_name (a denormalised cache)
  // is out of date or never populated. Without this fallback, every
  // tenant whose cache is stale sees a blank Company Name field.
  const { user, profile, company, updateProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  
  const [formData, setFormData] = useState<ProfileFormData>({
    full_name: "",
    email: "",
    phone_number: "",
    company_name: "",
    avatar_url: "",
  });

  const [passwordData, setPasswordData] = useState<PasswordFormData>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>({
    email_notifications: true,
    sms_notifications: false,
    push_notifications: true,
    order_updates: true,
    delivery_updates: true,
    marketing_emails: false,
    weekly_summary: true,
  });

  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>({
    profile_visibility: "team",
    show_email: false,
    show_phone: false,
    allow_analytics: true,
  });

  const [preferences, setPreferences] = useState<AccountPreferences>({
    language: "en",
    timezone: "Africa/Johannesburg",
    date_format: "DD/MM/YYYY",
    currency_display: "symbol",
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || "",
        email: profile.email || "",
        phone_number: profile.phone_number || "",
        // Canonical companies.company_name wins - profiles.company_name
        // is just a denormalised cache and historically wasn't populated
        // on every tenant.
        company_name: company?.company_name || profile.company_name || "",
        avatar_url: profile.avatar_url || "",
      });

      // Load preferences from profile metadata or localStorage
      loadUserPreferences();
    }
  }, [profile, company]);

  const loadUserPreferences = () => {
    // Load from localStorage or profile metadata
    const savedNotificationPrefs = localStorage.getItem("notification_preferences");
    const savedPrivacySettings = localStorage.getItem("privacy_settings");
    const savedPreferences = localStorage.getItem("user_preferences");

    if (savedNotificationPrefs) {
      setNotificationPrefs(JSON.parse(savedNotificationPrefs));
    }
    if (savedPrivacySettings) {
      setPrivacySettings(JSON.parse(savedPrivacySettings));
    }
    if (savedPreferences) {
      setPreferences(JSON.parse(savedPreferences));
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePasswordChange = (field: string, value: string) => {
    setPasswordData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const validatePassword = (password: string): { valid: boolean; message: string } => {
    if (password.length < 8) {
      return { valid: false, message: "Password must be at least 8 characters long" };
    }
    if (!/[A-Z]/.test(password)) {
      return { valid: false, message: "Password must contain at least one uppercase letter" };
    }
    if (!/[a-z]/.test(password)) {
      return { valid: false, message: "Password must contain at least one lowercase letter" };
    }
    if (!/[0-9]/.test(password)) {
      return { valid: false, message: "Password must contain at least one number" };
    }
    return { valid: true, message: "" };
  };

  const handlePasswordUpdate = async () => {
    if (!user?.id) return;

    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      toast({
        title: "Missing Information",
        description: "Please fill in all password fields",
        variant: "destructive",
      });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "New password and confirmation password must match",
        variant: "destructive",
      });
      return;
    }

    const validation = validatePassword(passwordData.newPassword);
    if (!validation.valid) {
      toast({
        title: "Weak Password",
        description: validation.message,
        variant: "destructive",
      });
      return;
    }

    setPasswordLoading(true);
    setPasswordSaved(false);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passwordData.currentPassword,
      });

      if (signInError) {
        throw new Error("Current password is incorrect");
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordData.newPassword,
      });

      if (updateError) throw updateError;

      setPasswordSaved(true);
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      toast({
        title: "Password Updated",
        description: "Your password has been changed successfully",
      });

      setTimeout(() => setPasswordSaved(false), 3000);
    } catch (error: any) {
      console.error("Error updating password:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;

    setLoading(true);
    setSaved(false);

    try {
      await updateProfile(formData);

      // Owners + super_admins are allowed to rename the company itself.
      // We update the canonical companies row (which every other surface
      // reads from), then refresh the denormalised profiles.company_name
      // cache for everyone in the company so legacy code paths that
      // still read the cache stay in sync.
      const role = (profile as any)?.role as string | undefined;
      const canRenameCompany = role === "owner" || role === "super_admin" || role === "admin";
      const companyId = (profile as any)?.company_id as string | undefined;
      const canonicalName = company?.company_name || profile?.company_name || "";
      if (canRenameCompany && companyId && formData.company_name && formData.company_name !== canonicalName) {
        const { error: companyErr } = await supabase
          .from("companies")
          .update({ company_name: formData.company_name })
          .eq("id", companyId);
        if (companyErr) {
          console.error("Company rename failed:", companyErr);
          toast({
            title: "Profile saved, but company rename failed",
            description: companyErr.message,
            variant: "destructive",
          });
        } else {
          // Mirror the new name onto every profile in the company so
          // any UI still pulling from the cache shows the rename
          // immediately. Failure here is non-fatal - the canonical
          // row already changed.
          const { error: cacheErr } = await supabase
            .from("profiles")
            .update({ company_name: formData.company_name })
            .eq("company_id", companyId);
          if (cacheErr) {
            console.warn("Profile company_name cache refresh failed:", cacheErr.message);
          }
        }
      }

      setSaved(true);
      toast({
        title: "Profile Updated",
        description: "Your profile information has been saved successfully.",
      });

      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Avatar upload: pick a file, push it into the avatars bucket under the
  // user's own folder, then save the public URL on the profile so it shows
  // up everywhere we render the Avatar component.
  const handleAvatarPick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Photos must be under 5 MB.",
        variant: "destructive",
      });
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;

      setFormData((prev) => ({ ...prev, avatar_url: url }));
      await updateProfile({ avatar_url: url });

      toast({ title: "Photo updated", description: "Your profile photo has been saved." });
    } catch (err: any) {
      console.error("Avatar upload failed:", err);
      toast({
        title: "Could not upload photo",
        description: err?.message || "Try a smaller image or a different file.",
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
      // Reset the input so re-picking the same file fires onChange again
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleNotificationPrefsUpdate = async () => {
    try {
      localStorage.setItem("notification_preferences", JSON.stringify(notificationPrefs));
      toast({
        title: "Preferences Updated",
        description: "Your notification preferences have been saved.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save notification preferences.",
        variant: "destructive",
      });
    }
  };

  const handlePrivacySettingsUpdate = async () => {
    try {
      localStorage.setItem("privacy_settings", JSON.stringify(privacySettings));
      toast({
        title: "Privacy Settings Updated",
        description: "Your privacy settings have been saved.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save privacy settings.",
        variant: "destructive",
      });
    }
  };

  const handlePreferencesUpdate = async () => {
    try {
      localStorage.setItem("user_preferences", JSON.stringify(preferences));
      toast({
        title: "Preferences Updated",
        description: "Your preferences have been saved.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save preferences.",
        variant: "destructive",
      });
    }
  };

  if (!user || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Account settings - CateringMS</title>
      </Head>

      <PortalLayout maxWidth="6xl">
        <div className="space-y-6">
          {/* Header - matches the admin page convention: icon in a
              brand-coloured rounded square sat next to the title +
              subtitle. Uses the standard admin orange so it sits in
              the same family as Staff & Rates, Calendar, Inventory
              etc. without bringing in tenant-brand colours (which
              live on the company profile page itself, not in the
              user's own account-level settings). */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center shadow-lg flex-shrink-0">
                <User className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
                  Account settings
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-1">
                  Manage your personal information and preferences.
                </p>
              </div>
            </div>
          </div>

          {saved && (
            <Card className="border-0 shadow-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-l-4 border-l-green-500">
              <CardContent className="py-4 px-6">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <p className="font-semibold text-green-900 dark:text-green-100">Profile updated successfully!</p>
                </div>
              </CardContent>
            </Card>
          )}

          {passwordSaved && (
            <Card className="border-0 shadow-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-l-4 border-l-green-500">
              <CardContent className="py-4 px-6">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <p className="font-semibold text-green-900 dark:text-green-100">Password changed successfully!</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabs for different sections */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="privacy">Privacy</TabsTrigger>
            </TabsList>

            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-6">
              <ProfileTab
                profile={profile}
                company={company}
                formData={formData}
                onFormChange={handleInputChange}
                onSave={handleSave}
                saving={loading}
                uploadingAvatar={uploadingAvatar}
                fileInputRef={fileInputRef}
                onAvatarPick={handleAvatarPick}
                onAvatarChange={handleAvatarChange}
                preferences={preferences}
                onPreferencesChange={setPreferences}
                onPreferencesSave={handlePreferencesUpdate}
              />
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security" className="space-y-6">
              <SecurityTab
                passwordData={passwordData}
                onFieldChange={handlePasswordChange}
                onUpdate={handlePasswordUpdate}
                busy={passwordLoading}
              />
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="space-y-6">
              <NotificationsTab
                notificationPrefs={notificationPrefs}
                setNotificationPrefs={setNotificationPrefs}
                onSave={handleNotificationPrefsUpdate}
              />
            </TabsContent>

            {/* Privacy Tab */}
            <TabsContent value="privacy" className="space-y-6">
              <PrivacyTab
                privacySettings={privacySettings}
                setPrivacySettings={setPrivacySettings}
                onSave={handlePrivacySettingsUpdate}
              />
            </TabsContent>
          </Tabs>
        </div>
      </PortalLayout>
    </>
  );
}

export default function AccountSettings() {
  return (
    <ProtectedRoute requireAuth={true}>
      <ProfileSettingsPage />
    </ProtectedRoute>
  );
}