
import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  CheckCircle
} from "lucide-react";
import { User, UserRole } from "@/types";
import { Footer } from "@/components/Footer";

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([]);

  useEffect(() => {
    const storedUsers = JSON.parse(localStorage.getItem("all_users") || "[]");
    setUsers(storedUsers);
  }, []);

  const roleConfig = [
    { value: "admin" as UserRole, label: "Admin", icon: Shield, color: "bg-purple-100 text-purple-700 border-purple-200" },
    { value: "kitchen" as UserRole, label: "Kitchen Team", icon: ChefHat, color: "bg-orange-100 text-orange-700 border-orange-200" },
    { value: "buyer" as UserRole, label: "Shopping Team", icon: ShoppingCart, color: "bg-green-100 text-green-700 border-green-200" },
    { value: "driver" as UserRole, label: "Driver", icon: Truck, color: "bg-blue-100 text-blue-700 border-blue-200" },
    { value: "cleaning" as UserRole, label: "Cleaning Team", icon: Sparkles, color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
    { value: "client" as UserRole, label: "Client", icon: UserCircle, color: "bg-slate-100 text-slate-700 border-slate-200" }
  ];

  const handleEditUser = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      setEditingUser(userId);
      setSelectedRoles(user.role);
    }
  };

  const handleSaveRoles = (userId: string) => {
    const updatedUsers = users.map(user => {
      if (user.id === userId) {
        return {
          ...user,
          role: selectedRoles,
          primaryRole: selectedRoles[0] || "client"
        };
      }
      return user;
    });

    setUsers(updatedUsers);
    localStorage.setItem("all_users", JSON.stringify(updatedUsers));
    setEditingUser(null);
    setSelectedRoles([]);
  };

  const handleRoleToggle = (role: UserRole) => {
    setSelectedRoles(prev => {
      if (prev.includes(role)) {
        return prev.filter(r => r !== role);
      } else {
        return [...prev, role];
      }
    });
  };

  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Link href="/">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg">
              <Users className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                User Management
              </h1>
              <p className="text-slate-600 mt-1">Assign roles and manage user access</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-4">
              <p className="text-sm text-slate-600 mb-1">Total Users</p>
              <p className="text-2xl font-bold text-slate-900">{users.length}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-4">
              <p className="text-sm text-slate-600 mb-1">Active Users</p>
              <p className="text-2xl font-bold text-green-600">
                {users.filter(u => u.status === "active").length}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-4">
              <p className="text-sm text-slate-600 mb-1">Admins</p>
              <p className="text-2xl font-bold text-purple-600">
                {users.filter(u => u.role.includes("admin")).length}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="space-y-4">
          {filteredUsers.map((user) => (
            <Card key={user.id} className="border-0 shadow-md hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-xl font-semibold text-slate-900">{user.name}</h3>
                      <Badge className={user.status === "active" ? "bg-green-100 text-green-700 border-green-200" : "bg-slate-100 text-slate-700 border-slate-200"}>
                        {user.status}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2 mb-4">
                      <p className="text-sm text-slate-600">Email: {user.email}</p>
                      {user.phone && <p className="text-sm text-slate-600">Phone: {user.phone}</p>}
                      <p className="text-sm text-slate-600">
                        Joined: {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    {editingUser === user.id ? (
                      <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
                        <Label className="font-semibold text-slate-700">Assign Roles:</Label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {roleConfig.map((role) => (
                            <div key={role.value} className="flex items-center space-x-2">
                              <Checkbox
                                id={`${user.id}-${role.value}`}
                                checked={selectedRoles.includes(role.value)}
                                onCheckedChange={() => handleRoleToggle(role.value)}
                              />
                              <Label
                                htmlFor={`${user.id}-${role.value}`}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2 cursor-pointer"
                              >
                                <role.icon className="w-4 h-4" />
                                {role.label}
                              </Label>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => handleSaveRoles(user.id)}
                            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                            disabled={selectedRoles.length === 0}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Save Roles
                          </Button>
                          <Button 
                            variant="outline"
                            onClick={() => {
                              setEditingUser(null);
                              setSelectedRoles([]);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 flex-wrap">
                        {user.role.map((role) => {
                          const config = roleConfig.find(r => r.value === role);
                          const Icon = config?.icon || UserCircle;
                          return (
                            <Badge key={role} className={config?.color}>
                              <Icon className="w-3 h-3 mr-1" />
                              {config?.label || role}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {editingUser !== user.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditUser(user.id)}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Roles
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      
      <Footer />
    </div>
  );
}
