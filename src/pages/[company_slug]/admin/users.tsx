import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, UserPlus, Mail, Shield, Trash2, Loader2, CheckCircle2, AlertCircle, Truck, ChefHat, ShoppingCart, Sparkles, User, Activity, Clock, AlertTriangle, Send, Copy, MailWarning } from "lucide-react";
import { loginActivityBucket } from "@/lib/loginActivity";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { userManagementService } from "@/services/userManagementService";
import { supabase } from "@/integrations/supabase/client";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { useCompanyKitchens } from "@/hooks/useCompanyKitchens";
import { Building2 } from "lucide-react";

interface StaffMember {
  id: string;
  email: string;
  full_name: string;
  active_role: string;
  created_at: string;
  // USR2-A: mirrored from auth.users via the
  // auth_users_last_sign_in_mirror trigger on every login. Lets the
  // page render activity chips per row without service-role access.
  last_sign_in_at?: string | null;
}

// USR2-A: loginActivityBucket lives in @/lib/loginActivity so the
// same chip renders on /admin/users (full team management) and here.

const ROLE_OPTIONS = [
  { value: "company_admin", label: "Company Admin (all branches)", icon: Shield, color: "bg-indigo-100 text-indigo-700" },
  { value: "region_admin", label: "Branch Manager (single / multi-branch)", icon: Building2, color: "bg-blue-100 text-blue-700" },
  { value: "sales_admin", label: "Sales Admin (cross-branch sales)", icon: Shield, color: "bg-violet-100 text-violet-700" },
  { value: "admin", label: "Admin", icon: Shield, color: "bg-purple-100 text-purple-700" },
  { value: "driver", label: "Driver", icon: Truck, color: "bg-green-100 text-green-700" },
  { value: "kitchen_staff", label: "Kitchen Staff", icon: ChefHat, color: "bg-orange-100 text-orange-700" },
  { value: "shopping_staff", label: "Shopping Staff", icon: ShoppingCart, color: "bg-pink-100 text-pink-700" },
  { value: "cleaning_staff", label: "Cleaning Staff", icon: Sparkles, color: "bg-cyan-100 text-cyan-700" },
];

// Roles that get region scoping. Cross-branch roles (company_admin,
// sales_admin) ignore the picker - they see all branches by RLS rule.
const REGION_SCOPED_ROLE_VALUES = new Set([
  "region_admin", "driver", "kitchen_staff", "shopping_staff", "cleaning_staff",
]);

export default function StaffManagementPage() {
  const router = useRouter();
  const { company_slug } = router.query;
  const { user } = useAuth();
  const { toast } = useToast();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  // Set when a staff member was created but the invite couldn't be
  // emailed (no email sender configured) - drives the "share these
  // details" panel inside the dialog.
  const [createResult, setCreateResult] = useState<
    { email: string; name: string; tempPassword?: string; loginUrl?: string; emailed?: boolean } | null
  >(null);

  // New staff form
  const [newStaff, setNewStaff] = useState({
    email: "",
    full_name: "",
    role: "driver",
  });
  // Branch / kitchen scoping. regions_covered is the array we write to
  // profiles for region_admin + branch-scoped staff. Cross-branch roles
  // ignore this entirely - the picker hides itself.
  const { kitchens } = useCompanyKitchens(user?.company_id ?? null);
  const [regionIds, setRegionIds] = useState<string[]>([]);
  const showRegionPicker =
    REGION_SCOPED_ROLE_VALUES.has(newStaff.role) && kitchens.filter((k) => k.source === "region").length > 0;

  useEffect(() => {
    if (user && company_slug) {
      loadStaff();
    }
  }, [user, company_slug]);

  const loadStaff = async () => {
    if (!user?.company_id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("company_id", user.company_id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setStaff(data || []);
    } catch (error) {
      console.error("Error loading staff:", error);
      toast({
        title: "Error",
        description: "Failed to load staff members",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newStaff.email || !newStaff.full_name) {
      toast({
        title: "Missing information",
        description: `Please enter the staff member's ${!newStaff.email ? "email" : "full name"}.`,
        variant: "destructive",
      });
      return;
    }
    if (!user?.company_id) {
      // company_id comes from the signed-in owner's profile. If it's
      // missing, their account isn't linked to a company - adding staff
      // would fail server-side with the same gap.
      toast({
        title: "Account not linked to a company",
        description: "Your session isn't linked to a company yet. Sign out and back in; if it persists, contact support.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      // supabase.auth.admin.createUser requires a service-role key that we
      // can't safely expose to the browser. Use the server API route instead;
      // it does a regular signUp under the hood and the handle_new_user
      // trigger (plus our auto-confirm trigger) settles the profile.
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newStaff.email.toLowerCase(),
          // password omitted: server generates a per-user random
          // password and returns it once in `tempPassword`. Audit
          // (May 2026, Wave 6) removed the shared "BYPASS_2026"
          // default that gave anyone with the source the ability
          // to log in as any newly-created user.
          full_name: newStaff.full_name,
          role: newStaff.role,
          company_id: user.company_id,
          regions_covered: REGION_SCOPED_ROLE_VALUES.has(newStaff.role) ? regionIds : null,
          region_id: REGION_SCOPED_ROLE_VALUES.has(newStaff.role) && regionIds[0] ? regionIds[0] : null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to create staff");
      }

      const tempPassword = (payload as any)?.tempPassword as string | undefined;
      const emailDelivered = !!(payload as any)?.emailDelivered;
      const loginUrl = (payload as any)?.loginUrl as string | undefined;
      const addedName = newStaff.full_name;
      const addedEmail = newStaff.email;

      loadStaff();
      setRegionIds([]);

      // Always show the credentials on screen. The server-generated temp
      // password is a real, working login even when the invite email goes
      // out (the email only sends a "set your own password" link, which
      // doesn't invalidate the temp password). Hiding it when email
      // "succeeded" left the admin with no way in if the email never
      // arrived - so we surface it every time and just note whether an
      // invite was also emailed.
      setCreateResult({ email: addedEmail, name: addedName, tempPassword, loginUrl, emailed: emailDelivered });
    } catch (error: any) {
      console.error("Error adding staff:", error);
      toast({
        title: "Failed to Add Staff",
        description: dbErrorMessage(error, { entity: "staff member" }),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const closeStaffDialog = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setCreateResult(null);
      setNewStaff({ email: "", full_name: "", role: "driver" });
      setRegionIds([]);
    }
  };

  const copyCreateResult = async () => {
    if (!createResult) return;
    const text =
      `Email: ${createResult.email}\n` +
      (createResult.tempPassword ? `Temporary password: ${createResult.tempPassword}\n` : "") +
      (createResult.loginUrl ? `Sign in at: ${createResult.loginUrl}\n` : "") +
      `Please change your password after first sign-in.`;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Sign-in details copied to your clipboard." });
    } catch {
      toast({ title: "Couldn't copy", description: "Select and copy the details manually.", variant: "destructive" });
    }
  };

  const handleResendInvite = async (staffId: string, staffName: string) => {
    setResendingId(staffId);
    try {
      const res = await fetch("/api/admin/resend-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: staffId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Failed to resend invite");
      toast({ title: "Invite sent", description: `Re-sent the set-password link to ${staffName}.` });
    } catch (error: any) {
      toast({
        title: "Couldn't resend invite",
        description: dbErrorMessage(error, { entity: "invite" }),
        variant: "destructive",
      });
    } finally {
      setResendingId(null);
    }
  };

  const handleDeleteStaff = async (staffId: string, staffName: string) => {
    if (!confirm(`Are you sure you want to remove ${staffName} from your team?`)) {
      return;
    }

    try {
      // Delete profile (auth user deletion requires admin API)
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", staffId);

      if (error) throw error;

      toast({
        title: "Staff Removed",
        description: `${staffName} has been removed from your team`,
      });

      loadStaff();
    } catch (error) {
      console.error("Error deleting staff:", error);
      toast({
        title: "Error",
        description: "Failed to remove staff member",
        variant: "destructive",
      });
    }
  };

  const getRoleBadge = (role: string) => {
    const roleConfig = ROLE_OPTIONS.find(r => r.value === role) || ROLE_OPTIONS[0];
    const Icon = roleConfig.icon;
    
    return (
      <Badge className={roleConfig.color}>
        <Icon className="w-3 h-3 mr-1" />
        {roleConfig.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Staff Management</h1>
            <p className="text-slate-600">Manage your team members and their roles</p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={closeStaffDialog}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90">
                <UserPlus className="w-4 h-4 mr-2" />
                Add Staff Member
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              {createResult ? (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <MailWarning className="w-5 h-5 text-amber-500" />
                      {createResult.emailed ? "User added - sign-in details" : "Share these sign-in details"}
                    </DialogTitle>
                    <DialogDescription>
                      {createResult.emailed ? (
                        <><strong>{createResult.name || createResult.email}</strong> was added and emailed a link to set their own password. They can also sign in right away with the temporary password below.</>
                      ) : (
                        <><strong>{createResult.name || createResult.email}</strong> was added, but your business hasn&apos;t set up an email sender yet, so we couldn&apos;t email the invite. Pass these details on directly.</>
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-1.5">
                      <div><span className="text-slate-500">Email:</span> <strong>{createResult.email}</strong></div>
                      {createResult.tempPassword && (
                        <div>
                          <span className="text-slate-500">Temporary password:</span>{" "}
                          <strong className="font-mono">{createResult.tempPassword}</strong>
                        </div>
                      )}
                      {createResult.loginUrl && (
                        <div>
                          <span className="text-slate-500">Sign in at:</span>{" "}
                          <strong className="break-all">{createResult.loginUrl}</strong>
                        </div>
                      )}
                      <p className="text-xs text-slate-500 pt-1">
                        They should change this password after their first sign-in.
                      </p>
                    </div>
                    {!createResult.emailed && (
                      <p className="text-xs text-slate-500">
                        Set up an email sender under <strong>Settings → Email</strong> so future invites send automatically.
                      </p>
                    )}
                    <div className="flex justify-between gap-2 pt-2">
                      <Button type="button" variant="outline" onClick={copyCreateResult} className="gap-1.5">
                        <Copy className="w-4 h-4" /> Copy details
                      </Button>
                      <Button type="button" onClick={() => closeStaffDialog(false)}>
                        Done
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
              <>
              <DialogHeader>
                <DialogTitle>Add New Staff Member</DialogTitle>
                <DialogDescription>
                  Create a new team member account. They'll get an email invite to set their own password. If your business hasn't set up an email sender yet, we'll show you their sign-in details to share.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleAddStaff} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name *</Label>
                  <Input
                    id="full_name"
                    placeholder="John Smith"
                    value={newStaff.full_name}
                    onChange={(e) => setNewStaff({ ...newStaff, full_name: e.target.value })}
                    required
                    disabled={saving}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@spitbraaidelivery.co.za"
                      value={newStaff.email}
                      onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                      className="pl-10"
                      required
                      disabled={saving}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role *</Label>
                  <Select
                    value={newStaff.role}
                    onValueChange={(value) => setNewStaff({ ...newStaff, role: value })}
                    disabled={saving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((role) => {
                        const Icon = role.icon;
                        return (
                          <SelectItem key={role.value} value={role.value}>
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4" />
                              {role.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {showRegionPicker && (
                  <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                    <Label className="flex items-center gap-1.5 text-sm font-medium text-blue-900">
                      <Building2 className="w-4 h-4" /> Branches this user can access
                    </Label>
                    <p className="text-xs text-blue-800/70">
                      Tick one or more branches. Leave all unticked to give cross-branch access
                      (only valid for managers covering everything).
                    </p>
                    <div className="space-y-1.5 max-h-40 overflow-auto pr-1">
                      {kitchens
                        .filter((k) => k.source === "region")
                        .map((k) => {
                          const checked = regionIds.includes(k.id);
                          return (
                            <label
                              key={k.id}
                              className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm cursor-pointer hover:border-blue-300"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  setRegionIds((prev) =>
                                    e.target.checked
                                      ? [...prev, k.id]
                                      : prev.filter((id) => id !== k.id),
                                  )
                                }
                                className="h-4 w-4"
                              />
                              <span className="font-medium">{k.name}</span>
                              {k.address && (
                                <span className="text-xs text-slate-500 truncate">
                                  - {k.address}
                                </span>
                              )}
                            </label>
                          );
                        })}
                    </div>
                  </div>
                )}

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    A unique temporary password will be generated on save. We'll show it once - copy it and share it with the new staff member via WhatsApp or in person. They should change it on first login.
                  </AlertDescription>
                </Alert>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Add Staff Member
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => closeStaffDialog(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
              </>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* Staff Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {ROLE_OPTIONS.map((roleConfig) => {
            const count = staff.filter(s => s.active_role === roleConfig.value).length;
            const Icon = roleConfig.icon;
            
            return (
              <Card key={roleConfig.value}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600 mb-1">{roleConfig.label}</p>
                      <p className="text-3xl font-bold text-slate-900">{count}</p>
                    </div>
                    <div className={`w-12 h-12 rounded-xl ${roleConfig.color} flex items-center justify-center`}>
                      <Icon className="w-6 h-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Staff List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              All Staff Members
            </CardTitle>
            <CardDescription>
              {staff.length} team member{staff.length !== 1 ? 's' : ''} in your organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            {staff.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                <p className="text-slate-600 mb-4">No staff members yet</p>
                <Button
                  onClick={() => setIsDialogOpen(true)}
                  variant="outline"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Your First Staff Member
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {staff.map((member) => {
                  // USR2-A: per-row activity chip. Helps the admin
                  // notice ghost accounts (created but never used) and
                  // staff who've gone quiet. Tooltip carries the exact
                  // timestamp for the curious.
                  const activity = loginActivityBucket(member.last_sign_in_at);
                  const ActivityIcon =
                    activity.kind === "active" ? Activity :
                    activity.kind === "stale" ? Clock :
                    activity.kind === "ghost" ? AlertTriangle :
                                                 User;
                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors gap-3"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                          <User className="w-6 h-6 text-white" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-900 truncate">{member.full_name}</h3>
                          <p className="text-sm text-slate-600 truncate">{member.email}</p>
                          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${activity.tone}`}
                              title={
                                member.last_sign_in_at
                                  ? `Last sign-in: ${new Date(member.last_sign_in_at).toLocaleString("en-ZA")}`
                                  : "No login recorded yet - this account has never signed in"
                              }
                            >
                              <ActivityIcon className="w-3 h-3" />
                              {activity.label}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        {getRoleBadge(member.active_role)}

                        {/* Pending = never signed in (invite not yet
                            accepted). Offer a resend; hidden once they've
                            signed in so it isn't shown again and again. */}
                        {member.id !== user?.id && !member.last_sign_in_at && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={resendingId === member.id}
                            onClick={() => handleResendInvite(member.id, member.full_name)}
                            className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 gap-1.5"
                          >
                            {resendingId === member.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                            Resend invite
                          </Button>
                        )}

                        {member.id !== user?.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteStaff(member.id, member.full_name)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Guide */}
        <Card className="mt-8 bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
          <CardHeader>
            <CardTitle className="text-purple-900">Quick Guide: Adding Staff</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-purple-900">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <p><strong>Step 1:</strong> Click "Add Staff Member" button above</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <p><strong>Step 2:</strong> Enter their full name and email address</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <p><strong>Step 3:</strong> Select their role (Driver, Kitchen, Shopping, etc.)</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <p><strong>Step 4:</strong> They can log in at <code className="bg-purple-100 px-2 py-1 rounded">/{company_slug}/login</code> using the temporary password shown once on save. Remind them to change it after their first login.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}