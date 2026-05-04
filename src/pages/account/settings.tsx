import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalLayout } from "@/components/Layout";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { 
  User, 
  Mail, 
  Phone, 
  Building2, 
  Save, 
  CheckCircle, 
  Camera, 
  Briefcase, 
  Lock, 
  Eye, 
  EyeOff, 
  Shield,
  Bell,
  Globe,
} from "lucide-react";
import { ROLE_NAMES } from "@/lib/authGuards";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface NotificationPreferences {
  email_notifications: boolean;
  sms_notifications: boolean;
  push_notifications: boolean;
  order_updates: boolean;
  delivery_updates: boolean;
  marketing_emails: boolean;
  weekly_summary: boolean;
}

interface PrivacySettings {
  profile_visibility: "public" | "private" | "team";
  show_email: boolean;
  show_phone: boolean;
  allow_analytics: boolean;
}

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
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone_number: "",
    company_name: "",
    avatar_url: "",
  });

  const [passwordData, setPasswordData] = useState({
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

  const [preferences, setPreferences] = useState({
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
        // Canonical companies.company_name wins -- profiles.company_name
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
          // immediately. Failure here is non-fatal -- the canonical
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

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getPasswordStrength = (password: string): { strength: number; label: string; color: string } => {
    if (!password) return { strength: 0, label: "", color: "" };
    
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    if (strength <= 2) return { strength, label: "Weak", color: "text-red-600" };
    if (strength <= 4) return { strength, label: "Medium", color: "text-yellow-600" };
    return { strength, label: "Strong", color: "text-green-600" };
  };

  const passwordStrength = getPasswordStrength(passwordData.newPassword);

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
        <title>Account Settings - CateringMS</title>
      </Head>

      <PortalLayout maxWidth="4xl">
        <div className="space-y-6">
          {/* Header -- matches the admin page convention: icon in a
              brand-coloured rounded square sat next to the title +
              subtitle. Uses the standard admin orange so it sits in
              the same family as Staff & Rates, Calendar, Inventory
              etc. without bringing in tenant-brand colours (which
              live on the company profile page itself, not in the
              user's own account-level settings). */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg flex-shrink-0">
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
              {/* Profile Overview */}
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
                        onChange={handleAvatarChange}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={handleAvatarPick}
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
                            {ROLE_NAMES[(profile.role as string) as keyof typeof ROLE_NAMES] || profile.role}
                          </Badge>
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm text-slate-600 dark:text-slate-400">Account Created</Label>
                        <p className="text-slate-900 dark:text-slate-100">
                          {new Date(profile.created_at || "").toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      </div>

                      {(company?.company_name || profile.company_name) && (
                        <div>
                          <Label className="text-sm text-slate-600 dark:text-slate-400">Company</Label>
                          <p className="text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            {company?.company_name || profile.company_name}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Personal Information */}
              <Card className="border-0 shadow-lg dark:bg-slate-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 dark:text-white">
                    <User className="w-5 h-5" />
                    Personal Information
                  </CardTitle>
                  <CardDescription className="dark:text-slate-400">Update your personal details and contact information</CardDescription>
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
                          onChange={(e) => handleInputChange("full_name", e.target.value)}
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
                          onChange={(e) => handleInputChange("email", e.target.value)}
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
                          onChange={(e) => handleInputChange("phone_number", e.target.value)}
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
                          onChange={(e) => handleInputChange("company_name", e.target.value)}
                          placeholder="Your Company Ltd"
                          disabled={
                            (profile.role as string) !== "owner"
                            && (profile.role as string) !== "admin"
                            && (profile.role as string) !== "super_admin"
                          }
                        />
                      </div>
                      {((profile.role as string) === "owner"
                        || (profile.role as string) === "admin"
                        || (profile.role as string) === "super_admin") && (
                        <p className="text-[11px] text-slate-500">Renames your company everywhere, invoices, emails, dashboard.</p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button
                      onClick={handleSave}
                      disabled={loading}
                      className="bg-orange-600 hover:bg-orange-700"
                    >
                      {loading ? (
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

              {/* Display Preferences */}
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
                      <Select value={preferences.language} onValueChange={(value) => setPreferences({...preferences, language: value})}>
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
                      <Select value={preferences.timezone} onValueChange={(value) => setPreferences({...preferences, timezone: value})}>
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
                      <Select value={preferences.date_format} onValueChange={(value) => setPreferences({...preferences, date_format: value})}>
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
                      <Select value={preferences.currency_display} onValueChange={(value) => setPreferences({...preferences, currency_display: value})}>
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
                    <Button onClick={handlePreferencesUpdate} className="bg-orange-600 hover:bg-orange-700">
                      <Save className="w-4 h-4 mr-2" />
                      Save Preferences
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security" className="space-y-6">
              <Card className="border-0 shadow-lg dark:bg-slate-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 dark:text-white">
                    <Shield className="w-5 h-5" />
                    Password & Security
                  </CardTitle>
                  <CardDescription className="dark:text-slate-400">Update your password to keep your account secure</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="dark:text-slate-200">Current Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          className="pl-10 pr-10 dark:bg-slate-700 dark:text-white dark:border-slate-600"
                          type={showCurrentPassword ? "text" : "password"}
                          value={passwordData.currentPassword}
                          onChange={(e) => handlePasswordChange("currentPassword", e.target.value)}
                          placeholder="Enter current password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="dark:text-slate-200">New Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          className="pl-10 pr-10 dark:bg-slate-700 dark:text-white dark:border-slate-600"
                          type={showNewPassword ? "text" : "password"}
                          value={passwordData.newPassword}
                          onChange={(e) => handlePasswordChange("newPassword", e.target.value)}
                          placeholder="Enter new password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {passwordData.newPassword && (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                passwordStrength.strength <= 2
                                  ? "bg-red-500 w-1/3"
                                  : passwordStrength.strength <= 4
                                  ? "bg-yellow-500 w-2/3"
                                  : "bg-green-500 w-full"
                              }`}
                            />
                          </div>
                          <span className={`text-xs font-medium ${passwordStrength.color}`}>
                            {passwordStrength.label}
                          </span>
                        </div>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Must be at least 8 characters with uppercase, lowercase, and numbers
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="dark:text-slate-200">Confirm New Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          className="pl-10 pr-10 dark:bg-slate-700 dark:text-white dark:border-slate-600"
                          type={showConfirmPassword ? "text" : "password"}
                          value={passwordData.confirmPassword}
                          onChange={(e) => handlePasswordChange("confirmPassword", e.target.value)}
                          placeholder="Confirm new password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
                        <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                          <span className="w-1 h-1 bg-red-600 rounded-full"></span>
                          Passwords do not match
                        </p>
                      )}
                    </div>
                  </div>

                  <Button
                    onClick={handlePasswordUpdate}
                    disabled={passwordLoading}
                    className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700"
                  >
                    {passwordLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Updating Password...
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 mr-2" />
                        Update Password
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="space-y-6">
              <Card className="border-0 shadow-lg dark:bg-slate-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 dark:text-white">
                    <Bell className="w-5 h-5" />
                    Notification Preferences
                  </CardTitle>
                  <CardDescription className="dark:text-slate-400">Choose how you want to be notified</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base dark:text-slate-200">Email Notifications</Label>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Receive notifications via email</p>
                      </div>
                      <Switch
                        checked={notificationPrefs.email_notifications}
                        onCheckedChange={(checked) => setNotificationPrefs({...notificationPrefs, email_notifications: checked})}
                      />
                    </div>

                    <Separator className="dark:bg-slate-700" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base dark:text-slate-200">SMS Notifications</Label>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Receive important updates via SMS</p>
                      </div>
                      <Switch
                        checked={notificationPrefs.sms_notifications}
                        onCheckedChange={(checked) => setNotificationPrefs({...notificationPrefs, sms_notifications: checked})}
                      />
                    </div>

                    <Separator className="dark:bg-slate-700" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base dark:text-slate-200">Push Notifications</Label>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Receive push notifications in your browser</p>
                      </div>
                      <Switch
                        checked={notificationPrefs.push_notifications}
                        onCheckedChange={(checked) => setNotificationPrefs({...notificationPrefs, push_notifications: checked})}
                      />
                    </div>

                    <Separator className="dark:bg-slate-700" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base dark:text-slate-200">Order Updates</Label>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Get notified about order status changes</p>
                      </div>
                      <Switch
                        checked={notificationPrefs.order_updates}
                        onCheckedChange={(checked) => setNotificationPrefs({...notificationPrefs, order_updates: checked})}
                      />
                    </div>

                    <Separator className="dark:bg-slate-700" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base dark:text-slate-200">Delivery Updates</Label>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Track delivery progress in real-time</p>
                      </div>
                      <Switch
                        checked={notificationPrefs.delivery_updates}
                        onCheckedChange={(checked) => setNotificationPrefs({...notificationPrefs, delivery_updates: checked})}
                      />
                    </div>

                    <Separator className="dark:bg-slate-700" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base dark:text-slate-200">Marketing Emails</Label>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Receive promotional offers and updates</p>
                      </div>
                      <Switch
                        checked={notificationPrefs.marketing_emails}
                        onCheckedChange={(checked) => setNotificationPrefs({...notificationPrefs, marketing_emails: checked})}
                      />
                    </div>

                    <Separator className="dark:bg-slate-700" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base dark:text-slate-200">Weekly Summary</Label>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Get a weekly summary of your activity</p>
                      </div>
                      <Switch
                        checked={notificationPrefs.weekly_summary}
                        onCheckedChange={(checked) => setNotificationPrefs({...notificationPrefs, weekly_summary: checked})}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button onClick={handleNotificationPrefsUpdate} className="bg-orange-600 hover:bg-orange-700">
                      <Save className="w-4 h-4 mr-2" />
                      Save Notification Preferences
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Privacy Tab */}
            <TabsContent value="privacy" className="space-y-6">
              <Card className="border-0 shadow-lg dark:bg-slate-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 dark:text-white">
                    <Shield className="w-5 h-5" />
                    Privacy Settings
                  </CardTitle>
                  <CardDescription className="dark:text-slate-400">Control your privacy and data sharing preferences</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="dark:text-slate-200">Profile Visibility</Label>
                      <Select 
                        value={privacySettings.profile_visibility} 
                        onValueChange={(value: "public" | "private" | "team") => setPrivacySettings({...privacySettings, profile_visibility: value})}
                      >
                        <SelectTrigger className="dark:bg-slate-700 dark:text-white dark:border-slate-600">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="public">Public - Visible to everyone</SelectItem>
                          <SelectItem value="team">Team - Visible to team members only</SelectItem>
                          <SelectItem value="private">Private - Only visible to you</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="dark:bg-slate-700" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base dark:text-slate-200">Show Email Address</Label>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Display your email on your profile</p>
                      </div>
                      <Switch
                        checked={privacySettings.show_email}
                        onCheckedChange={(checked) => setPrivacySettings({...privacySettings, show_email: checked})}
                      />
                    </div>

                    <Separator className="dark:bg-slate-700" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base dark:text-slate-200">Show Phone Number</Label>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Display your phone number on your profile</p>
                      </div>
                      <Switch
                        checked={privacySettings.show_phone}
                        onCheckedChange={(checked) => setPrivacySettings({...privacySettings, show_phone: checked})}
                      />
                    </div>

                    <Separator className="dark:bg-slate-700" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base dark:text-slate-200">Allow Analytics</Label>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Help us improve by sharing anonymous usage data</p>
                      </div>
                      <Switch
                        checked={privacySettings.allow_analytics}
                        onCheckedChange={(checked) => setPrivacySettings({...privacySettings, allow_analytics: checked})}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button onClick={handlePrivacySettingsUpdate} className="bg-orange-600 hover:bg-orange-700">
                      <Save className="w-4 h-4 mr-2" />
                      Save Privacy Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>
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