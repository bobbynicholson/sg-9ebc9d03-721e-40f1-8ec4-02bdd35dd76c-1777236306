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
import { 
  Users, UserPlus, Mail, Shield, Trash2, 
  Edit, Loader2, CheckCircle2, AlertCircle,
  Truck, ChefHat, ShoppingCart, Sparkles, User
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { userManagementService } from "@/services/userManagementService";
import { supabase } from "@/integrations/supabase/client";

interface StaffMember {
  id: string;
  email: string;
  full_name: string;
  active_role: string;
  created_at: string;
  last_sign_in?: string;
}

const ROLE_OPTIONS = [
  { value: "company_admin", label: "Company Admin", icon: Shield, color: "bg-indigo-100 text-indigo-700" },
  { value: "admin", label: "Admin", icon: Shield, color: "bg-purple-100 text-purple-700" },
  { value: "driver", label: "Driver", icon: Truck, color: "bg-green-100 text-green-700" },
  { value: "kitchen_staff", label: "Kitchen Staff", icon: ChefHat, color: "bg-orange-100 text-orange-700" },
  { value: "shopping_staff", label: "Shopping Staff", icon: ShoppingCart, color: "bg-pink-100 text-pink-700" },
  { value: "cleaning_staff", label: "Cleaning Staff", icon: Sparkles, color: "bg-cyan-100 text-cyan-700" },
];

export default function StaffManagementPage() {
  const router = useRouter();
  const { company_slug } = router.query;
  const { user } = useAuth();
  const { toast } = useToast();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // New staff form
  const [newStaff, setNewStaff] = useState({
    email: "",
    full_name: "",
    role: "driver",
  });

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
    
    if (!newStaff.email || !newStaff.full_name || !user?.company_id) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      // Create auth user with bypass password
      const { data: authData, error: signUpError } = await supabase.auth.admin.createUser({
        email: newStaff.email.toLowerCase(),
        password: "BYPASS_2026",
        email_confirm: true,
      });

      if (signUpError) throw signUpError;

      if (!authData.user) {
        throw new Error("Failed to create user");
      }

      // Create profile
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: authData.user.id,
          email: newStaff.email.toLowerCase(),
          full_name: newStaff.full_name,
          role: newStaff.role,
          active_role: newStaff.role,
          company_id: user.company_id,
        } as any);

      if (profileError) throw profileError;

      toast({
        title: "Staff Added!",
        description: `${newStaff.full_name} has been added to your team`,
      });

      // Reset form
      setNewStaff({
        email: "",
        full_name: "",
        role: "driver",
      });

      setIsDialogOpen(false);
      loadStaff();
    } catch (error: any) {
      console.error("Error adding staff:", error);
      toast({
        title: "Failed to Add Staff",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
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
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Staff Management</h1>
            <p className="text-slate-600">Manage your team members and their roles</p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90">
                <UserPlus className="w-4 h-4 mr-2" />
                Add Staff Member
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Staff Member</DialogTitle>
                <DialogDescription>
                  Create a new team member account. They'll receive login credentials via email.
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

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Password: <code className="font-mono text-sm">BYPASS_2026</code> (temporary)
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
                    onClick={() => setIsDialogOpen(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
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
                {staff.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <User className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">{member.full_name}</h3>
                        <p className="text-sm text-slate-600">{member.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {getRoleBadge(member.active_role)}
                      
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
                ))}
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
              <p><strong>Step 4:</strong> They can login at <code className="bg-purple-100 px-2 py-1 rounded">/{company_slug}/login</code> with password: <code className="bg-purple-100 px-2 py-1 rounded">BYPASS_2026</code></p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}