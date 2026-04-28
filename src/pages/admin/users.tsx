import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AdminNav } from "@/components/admin/AdminNav";
import { 
  Users,
  ArrowLeft,
  Search,
  Shield,
  ChefHat,
  Truck,
  ShoppingCart,
  Sparkles,
  UserCircle,
  Edit,
  CheckCircle,
  Loader2,
  AlertCircle,
  RefreshCw
} from "lucide-react";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { userManagementService, UserWithDepartments } from "@/services/userManagementService";
import type { DepartmentAssignment } from "@/services/userManagementService";
import { useToast } from "@/hooks/use-toast";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { InfoTooltip } from "@/components/ui/info-tooltip";

function AdminUsersPage() {
  const [users, setUsers] = useState<UserWithDepartments[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [selectedDepartments, setSelectedDepartments] = useState<UserRole[]>([]);
  const [primaryDepartment, setPrimaryDepartment] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Partial<Record<UserRole, number>> | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const roleConfig = [
    { value: "admin" as UserRole, label: "Admin", icon: Shield, color: "bg-purple-100 text-purple-700 border-purple-200" },
    { value: "company_admin" as UserRole, label: "Company Admin", icon: Shield, color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
    { value: "kitchen" as UserRole, label: "Kitchen Team", icon: ChefHat, color: "bg-orange-100 text-orange-700 border-orange-200" },
    { value: "shopping" as UserRole, label: "Shopping Team", icon: ShoppingCart, color: "bg-green-100 text-green-700 border-green-200" },
    { value: "driver" as UserRole, label: "Driver", icon: Truck, color: "bg-blue-100 text-blue-700 border-blue-200" },
    { value: "cleaning" as UserRole, label: "Cleaning Team", icon: Sparkles, color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
    { value: "client" as UserRole, label: "Client", icon: UserCircle, color: "bg-slate-100 text-slate-700 border-slate-200" }
  ];

  useEffect(() => {
    if (user) {
      loadUsers();
      loadStats();
    } else if (user === null) {
      setLoading(false);
      setError("Please log in to manage users.");
    }
  }, [user]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedUsers = await userManagementService.getAllUsers(user?.company_id, {
        excludeRoles: ["client"],
      });
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Error loading users:", error);
      setError("Failed to load users. Please try again.");
      toast({
        title: "Error",
        description: "Failed to load users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const fetchedStats = await userManagementService.getDepartmentStats(user?.company_id, {
        excludeRoles: ["client"],
      });
      setStats(fetchedStats);
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const handleEditUser = (userId: string) => {
    const targetUser = users.find(u => u.id === userId);
    if (targetUser) {
      setEditingUser(userId);
      setSelectedDepartments(targetUser.departments);
      setPrimaryDepartment(targetUser.primary_department || targetUser.departments[0] || null);
    }
  };

  const handleSaveRoles = async (userId: string) => {
    if (selectedDepartments.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one department",
        variant: "destructive",
      });
      return;
    }

    if (!primaryDepartment) {
      toast({
        title: "Error",
        description: "Please select a primary department",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);

      const assignments: { department: UserRole; is_primary: boolean; }[] = selectedDepartments.map(dept => ({
        department: dept,
        is_primary: dept === primaryDepartment,
      }));

      await userManagementService.assignDepartments(userId, assignments, user!.id);
      await loadUsers();
      await loadStats();

      setEditingUser(null);
      setSelectedDepartments([]);
      setPrimaryDepartment(null);

      toast({
        title: "Success",
        description: "User departments updated successfully",
      });
    } catch (error) {
      console.error("Error saving roles:", error);
      toast({
        title: "Error",
        description: "Failed to update user departments",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDepartmentToggle = (dept: UserRole) => {
    setSelectedDepartments(prev => {
      if (prev.includes(dept)) {
        const newDepts = prev.filter(d => d !== dept);
        if (primaryDepartment === dept && newDepts.length > 0) {
          setPrimaryDepartment(newDepts[0]);
        } else if (newDepts.length === 0) {
          setPrimaryDepartment(null);
        }
        return newDepts;
      } else {
        if (prev.length === 0) {
          setPrimaryDepartment(dept);
        }
        return [...prev, dept];
      }
    });
  };

  const handleSetPrimary = (dept: UserRole) => {
    if (selectedDepartments.includes(dept)) {
      setPrimaryDepartment(dept);
    }
  };

  const filteredUsers = searchTerm
    ? users.filter(user => 
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : users;

  if (loading) {
    return (
      <>
        <NoIndexMeta />
        <Head>
          <meta name="robots" content="noindex, nofollow" />
          <title>User Management - CateringMS Admin</title>
        </Head>
        
        <AdminNav />
        
        <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-slate-50 lg:pl-72 xl:pl-80">
          <div className="px-4 py-8">
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
                <p className="text-gray-600">Loading users...</p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (error && !user) {
    return (
      <>
        <NoIndexMeta />
        <Head>
          <meta name="robots" content="noindex, nofollow" />
          <title>User Management - CateringMS Admin</title>
        </Head>
        
        <AdminNav />
        
        <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-slate-50 lg:pl-72 xl:pl-80">
          <div className="px-4 py-8">
            <Card className="border-2 border-red-200 bg-red-50">
              <CardContent className="pt-12 pb-12 text-center">
                <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <p className="text-xl font-semibold text-gray-900 mb-2">Access Denied</p>
                <p className="text-gray-600 mb-4">{error}</p>
                <Link href="/auth/login">
                  <Button className="bg-purple-600 hover:bg-purple-700">
                    Go to Login
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>User Management - CateringMS Admin</title>
      </Head>
      
      <AdminNav />
      
      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-slate-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-6 md:py-8 max-w-full">
          <Link href="/admin/dashboard">
            <Button variant="ghost" className="mb-4" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Admin Dashboard
            </Button>
          </Link>

          <div className="mb-6 md:mb-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg flex-shrink-0">
                  <Users className="w-5 h-5 md:w-8 md:h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                    User Management
                  </h1>
                  <p className="text-sm md:text-base text-slate-600 mt-1">Assign departments and manage user access</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <InfoTooltip 
                  content="Refresh the user list to see the latest changes and department assignments."
                  side="left"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadUsers}
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4 mb-6">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <p className="text-xs md:text-sm text-slate-600 mb-1">Total Users</p>
                <p className="text-2xl md:text-3xl font-bold text-slate-900">{users.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <p className="text-xs md:text-sm text-slate-600 mb-1">Active</p>
                <p className="text-2xl md:text-3xl font-bold text-green-600">
                  {users.filter(u => u.is_active).length}
                </p>
              </CardContent>
            </Card>
            {stats && roleConfig.slice(0, 4).map((role) => (
              <Card key={role.value} className="border-0 shadow-lg">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <role.icon className="w-3 h-3 md:w-4 md:h-4 text-slate-600" />
                    <p className="text-xs md:text-sm text-slate-600">{role.label}</p>
                  </div>
                  <p className="text-2xl md:text-3xl font-bold text-slate-900">
                    {stats[role.value] || 0}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 md:pl-10 text-sm md:text-base"
              />
            </div>
          </div>

          {filteredUsers.length === 0 ? (
            <Card className="border-0 shadow-md">
              <CardContent className="pt-12 pb-12 text-center">
                <Users className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                <p className="text-xl font-semibold text-slate-900 mb-2">No users found</p>
                <p className="text-slate-600">
                  {searchTerm ? "Try a different search term" : "No users in the system yet"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredUsers.map((targetUser) => (
                <Card key={targetUser.id} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                  <CardContent className="p-4 md:p-6">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className="text-lg md:text-xl font-semibold text-slate-900 truncate">
                              {targetUser.full_name || "Unnamed User"}
                            </h3>
                            <Badge className={targetUser.is_active ? "bg-green-100 text-green-700 border-green-200 text-xs" : "bg-slate-100 text-slate-700 border-slate-200 text-xs"}>
                              {targetUser.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          
                          <div className="space-y-1 mb-3 text-xs md:text-sm text-slate-600">
                            <p className="truncate">Email: {targetUser.email || "N/A"}</p>
                            {targetUser.phone_number && <p>Phone: {targetUser.phone_number}</p>}
                            {targetUser.company_name && <p>Company: {targetUser.company_name}</p>}
                            <p>Joined: {new Date(targetUser.created_at || Date.now()).toLocaleDateString()}</p>
                          </div>

                          {editingUser !== targetUser.id && (
                            <div className="flex gap-2 flex-wrap">
                              {targetUser.departments && targetUser.departments.length > 0 ? (
                                targetUser.departments.map((dept) => {
                                  const config = roleConfig.find(r => r.value === dept);
                                  const Icon = config?.icon || UserCircle;
                                  const isPrimary = dept === targetUser.primary_department;
                                  return (
                                    <Badge key={dept} className={`text-xs ${config?.color} ${isPrimary ? "ring-2 ring-offset-2 ring-purple-500" : ""}`}>
                                      <Icon className="w-3 h-3 mr-1" />
                                      {config?.label || dept}
                                      {isPrimary && " (Primary)"}
                                    </Badge>
                                  );
                                })
                              ) : (
                                <Badge className="text-xs bg-slate-100 text-slate-600">
                                  No departments assigned
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>

                        {editingUser !== targetUser.id && (
                          <div className="flex items-center gap-2">
                            <InfoTooltip 
                              content="Click to assign or modify departments for this user. You can assign multiple departments and set one as primary."
                              side="left"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditUser(targetUser.id)}
                              className="w-full sm:w-auto text-sm"
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Edit Departments
                            </Button>
                          </div>
                        )}
                      </div>

                      {editingUser === targetUser.id && (
                        <div className="space-y-4 p-3 md:p-4 bg-slate-50 rounded-lg border-2 border-purple-200">
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <Label className="font-semibold text-slate-700 text-sm md:text-base">
                                Assign Departments:
                              </Label>
                              <InfoTooltip 
                                content="Select all departments this user should have access to. The primary department determines their default portal view when they log in."
                                side="right"
                              />
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {roleConfig.map((role) => {
                                const isSelected = selectedDepartments.includes(role.value);
                                const isPrimary = primaryDepartment === role.value;
                                
                                return (
                                  <div key={role.value} className={`flex items-center space-x-2 p-2 rounded border-2 transition-all ${
                                    isPrimary ? "border-purple-500 bg-purple-50" : isSelected ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-50"
                                  }`}>
                                    <Checkbox
                                      id={`${targetUser.id}-${role.value}`}
                                      checked={isSelected}
                                      onCheckedChange={() => handleDepartmentToggle(role.value)}
                                    />
                                    <Label
                                      htmlFor={`${targetUser.id}-${role.value}`}
                                      className="text-xs md:text-sm font-medium leading-none flex items-center gap-2 cursor-pointer flex-1"
                                    >
                                      <role.icon className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                                      <span className="truncate">{role.label}</span>
                                    </Label>
                                    {isSelected && (
                                      <div className="flex items-center gap-1">
                                        <InfoTooltip 
                                          content="The primary department is where the user will land when they first log in. They can switch between all assigned departments."
                                          side="top"
                                          className="mr-1"
                                        />
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 px-2 text-xs"
                                          onClick={() => handleSetPrimary(role.value)}
                                          disabled={isPrimary}
                                        >
                                          {isPrimary ? "Primary" : "Set Primary"}
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            
                            <p className="text-xs text-slate-600 mt-2">
                              {primaryDepartment ? `Primary department: ${roleConfig.find(r => r.value === primaryDepartment)?.label}` : "Select at least one department"}
                            </p>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row gap-2 pt-2">
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                              <InfoTooltip 
                                content="Save the department assignments. The user will be able to access all selected department portals."
                                side="top"
                              />
                              <Button 
                                onClick={() => handleSaveRoles(targetUser.id)}
                                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 flex-1 sm:flex-initial text-sm"
                                disabled={selectedDepartments.length === 0 || saving}
                                size="sm"
                              >
                                {saving ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Saving...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Save Departments
                                  </>
                                )}
                              </Button>
                            </div>
                            <Button 
                              variant="outline"
                              onClick={() => {
                                setEditingUser(null);
                                setSelectedDepartments([]);
                                setPrimaryDepartment(null);
                              }}
                              className="w-full sm:w-auto text-sm"
                              size="sm"
                              disabled={saving}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function UsersPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <AdminUsersPage />
    </ProtectedRoute>
  );
}