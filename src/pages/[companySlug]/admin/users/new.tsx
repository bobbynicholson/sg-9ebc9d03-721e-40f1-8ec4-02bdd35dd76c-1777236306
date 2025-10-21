
import { useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import Link from "next/link";
import { userManagementService } from "@/services/userManagementService";

export default function NewUserPage() {
  const router = useRouter();
  const { companySlug } = router.query;
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    phone: "",
    role: "staff" as const,
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      alert("You must be logged in to create users");
      return;
    }

    try {
      setLoading(true);
      
      await userManagementService.createUser({
        email: formData.email,
        full_name: formData.full_name,
        phone: formData.phone,
        role: formData.role,
        password: formData.password,
        company_id: user.company_id || "",
      });

      alert("User created successfully!");
      router.push(`/${companySlug}/admin/users`);
    } catch (error: any) {
      console.error("Error creating user:", error);
      alert(error.message || "Failed to create user. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AdminNav companySlug={companySlug as string} />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <div className="mb-8">
            <Link href={`/${companySlug}/admin/users`}>
              <Button variant="ghost" className="gap-2 mb-4">
                <ArrowLeft className="w-4 h-4" />
                Back to Users
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Add New User</h1>
            <p className="text-slate-600">Create a new team member account</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>User Information</CardTitle>
              <CardDescription>Fill in the details for the new user</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label htmlFor="full_name">Full Name *</Label>
                  <Input
                    id="full_name"
                    type="text"
                    placeholder="John Doe"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    required
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+1 234 567 8900"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="role">Role *</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value: any) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="driver">Driver</SelectItem>
                      <SelectItem value="kitchen">Kitchen Staff</SelectItem>
                      <SelectItem value="cleaning">Cleaning Staff</SelectItem>
                      <SelectItem value="shopping">Shopping Staff</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="password">Temporary Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min. 8 characters"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    minLength={8}
                    className="mt-2"
                  />
                  <p className="text-xs text-slate-500 mt-1">User will be prompted to change this on first login</p>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button type="submit" disabled={loading} className="gap-2">
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Create User
                      </>
                    )}
                  </Button>
                  <Link href={`/${companySlug}/admin/users`}>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
