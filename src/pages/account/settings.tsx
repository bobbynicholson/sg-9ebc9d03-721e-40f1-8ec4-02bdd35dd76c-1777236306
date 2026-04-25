import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DynamicNav } from "@/components/DynamicNav";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { User, Mail, Phone, Building2, Save, CheckCircle, Camera, Briefcase, Lock, Eye, EyeOff, Shield } from "lucide-react";
import { ROLE_NAMES } from "@/lib/authGuards";
import { supabase } from "@/integrations/supabase/client";

function ProfileSettingsPage() {
  const { user, profile, updateProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
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

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || "",
        email: profile.email || "",
        phone_number: profile.phone_number || "",
        company_name: profile.company_name || "",
        avatar_url: profile.avatar_url || "",
      });
    }
  }, [profile]);

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

    // Validation
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
      // Verify current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passwordData.currentPassword,
      });

      if (signInError) {
        throw new Error("Current password is incorrect");
      }

      // Update password
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
          <p className="text-slate-600">Loading profile...</p>
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

      <DynamicNav userRole={user.role} />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 p-4 md:p-6 lg:pl-64 xl:pl-72">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Account Settings</h1>
              <p className="text-slate-600 mt-1">Manage your personal information and preferences</p>
            </div>
            <Button
              onClick={handleSave}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
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

          {saved && (
            <Card className="border-0 shadow-lg bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-l-green-500">
              <CardContent className="py-4 px-6">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="font-semibold text-green-900">Profile updated successfully!</p>
                </div>
              </CardContent>
            </Card>
          )}

          {passwordSaved && (
            <Card className="border-0 shadow-lg bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-l-green-500">
              <CardContent className="py-4 px-6">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="font-semibold text-green-900">Password changed successfully!</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Profile Overview */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Profile Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-6 items-start">
                {/* Avatar */}
                <div className="flex flex-col items-center gap-3">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={formData.avatar_url} />
                    <AvatarFallback className="text-2xl bg-blue-100 text-blue-600">
                      {getInitials(formData.full_name || "User")}
                    </AvatarFallback>
                  </Avatar>
                  <Button variant="outline" size="sm" className="w-full">
                    <Camera className="w-4 h-4 mr-2" />
                    Change Photo
                  </Button>
                </div>

                {/* User Info */}
                <div className="flex-1 space-y-4">
                  <div>
                    <Label className="text-sm text-slate-600">Role</Label>
                    <div className="mt-1">
                      <Badge variant="secondary" className="text-sm">
                        <Briefcase className="w-3 h-3 mr-1" />
                        {ROLE_NAMES[profile.role as keyof typeof ROLE_NAMES] || profile.role}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm text-slate-600">Account Created</Label>
                    <p className="text-slate-900">
                      {new Date(profile.created_at || "").toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>

                  {profile.company_name && (
                    <div>
                      <Label className="text-sm text-slate-600">Company</Label>
                      <p className="text-slate-900 flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        {profile.company_name}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Personal Information */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Personal Information
              </CardTitle>
              <CardDescription>Update your personal details and contact information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      className="pl-10"
                      value={formData.full_name}
                      onChange={(e) => handleInputChange("full_name", e.target.value)}
                      placeholder="John Doe"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      className="pl-10"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      placeholder="john@example.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      className="pl-10"
                      value={formData.phone_number}
                      onChange={(e) => handleInputChange("phone_number", e.target.value)}
                      placeholder="+27 12 345 6789"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Company Name</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      className="pl-10"
                      value={formData.company_name}
                      onChange={(e) => handleInputChange("company_name", e.target.value)}
                      placeholder="Your Company Ltd"
                      disabled={profile.role !== "owner" && profile.role !== "super_admin"}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Password & Security */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Password & Security
              </CardTitle>
              <CardDescription>Update your password to keep your account secure</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                {/* Current Password */}
                <div className="space-y-2">
                  <Label>Current Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      className="pl-10 pr-10"
                      type={showCurrentPassword ? "text" : "password"}
                      value={passwordData.currentPassword}
                      onChange={(e) => handlePasswordChange("currentPassword", e.target.value)}
                      placeholder="Enter current password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* New Password */}
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      className="pl-10 pr-10"
                      type={showNewPassword ? "text" : "password"}
                      value={passwordData.newPassword}
                      onChange={(e) => handlePasswordChange("newPassword", e.target.value)}
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {passwordData.newPassword && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
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
                  <p className="text-xs text-slate-500">
                    Must be at least 8 characters with uppercase, lowercase, and numbers
                  </p>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <Label>Confirm New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      className="pl-10 pr-10"
                      type={showConfirmPassword ? "text" : "password"}
                      value={passwordData.confirmPassword}
                      onChange={(e) => handlePasswordChange("confirmPassword", e.target.value)}
                      placeholder="Confirm new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <span className="w-1 h-1 bg-red-600 rounded-full"></span>
                      Passwords do not match
                    </p>
                  )}
                </div>
              </div>

              <Button
                onClick={handlePasswordUpdate}
                disabled={passwordLoading}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
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

          {/* Save Button - Mobile */}
          <div className="md:hidden">
            <Button
              onClick={handleSave}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700"
              size="lg"
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
        </div>
      </div>
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