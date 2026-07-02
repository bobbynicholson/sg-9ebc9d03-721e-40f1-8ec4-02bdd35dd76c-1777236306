import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalLayout } from "@/components/Layout";
import { PageWorkbench, PortalHeader } from "@/components/portal/ui";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { User, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { NotificationsTab } from "@/components/account/settings/NotificationsTab";
import { PrivacyTab } from "@/components/account/settings/PrivacyTab";
import { ProfileTab } from "@/components/account/settings/ProfileTab";
import { SecurityTab } from "@/components/account/settings/SecurityTab";
import type {
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
    }
  }, [profile, company]);

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
        description: dbErrorMessage(error, { entity: "password" }),
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
            description: dbErrorMessage(companyErr, { entity: "company" }),
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
        description: dbErrorMessage(err, { entity: "photo" }),
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
      // Reset the input so re-picking the same file fires onChange again
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!user || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-slate-200 border-t-brand-primary dark:border-slate-700"></div>
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

      <PortalLayout maxWidth="full" showWorkbench={false}>
        <div className="space-y-6">
          <PortalHeader
            variant="hero"
            title="Account settings"
            subtitle="Manage your personal information and preferences."
            icon={User}
          />
          <PageWorkbench />

          {saved && (
            <div
              role="status"
              className="flex items-center gap-3 rounded-lg border border-brand-primary/20 bg-white/90 px-4 py-3 text-sm shadow-sm dark:bg-slate-900/90"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                <CheckCircle className="h-4 w-4" />
              </span>
              <p className="font-semibold text-slate-900 dark:text-white">Profile updated successfully.</p>
            </div>
          )}

          {passwordSaved && (
            <div
              role="status"
              className="flex items-center gap-3 rounded-lg border border-brand-primary/20 bg-white/90 px-4 py-3 text-sm shadow-sm dark:bg-slate-900/90"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                <CheckCircle className="h-4 w-4" />
              </span>
              <p className="font-semibold text-slate-900 dark:text-white">Password changed successfully.</p>
            </div>
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

            {/* Notifications Tab - self-contained, persists to the
                email_notification_preferences row the DB mailers read */}
            <TabsContent value="notifications" className="space-y-6">
              <NotificationsTab
                userId={user.id}
                companyId={((profile as any)?.company_id as string | undefined) || null}
              />
            </TabsContent>

            {/* Privacy Tab - self-contained, persists to
                profiles.notification_preferences jsonb */}
            <TabsContent value="privacy" className="space-y-6">
              <PrivacyTab userId={user.id} />
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
