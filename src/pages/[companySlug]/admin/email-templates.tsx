
import { useRouter } from "next/router";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Plus, Edit, Eye, Trash2 } from "lucide-react";

export default function EmailTemplatesPage() {
  const router = useRouter();
  const { companySlug } = router.query;

  const mockTemplates = [
    {
      id: "1",
      name: "Quote Initial",
      slug: "quote_initial",
      status: "active",
      lastUsed: "2024-01-15"
    },
    {
      id: "2",
      name: "Order Confirmation",
      slug: "order_confirmation",
      status: "active",
      lastUsed: "2024-01-14"
    },
    {
      id: "3",
      name: "Payment Received",
      slug: "payment_received",
      status: "active",
      lastUsed: "2024-01-13"
    }
  ];

  return (
    <>
      <AdminNav companySlug={companySlug as string} />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Email Templates</h1>
              <p className="text-slate-600">Manage email templates for customer communications</p>
            </div>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Template
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Total Templates</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{mockTemplates.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Active</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {mockTemplates.filter(t => t.status === "active").length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Emails Sent (This Month)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">0</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Templates</CardTitle>
              <CardDescription>Customize email content for automated communications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:border-purple-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                        <Mail className="w-6 h-6 text-purple-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-slate-900">{template.name}</h3>
                          <Badge className="bg-green-100 text-green-700">{template.status}</Badge>
                        </div>
                        <p className="text-sm text-slate-500">
                          Last used: {new Date(template.lastUsed).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="gap-2">
                        <Eye className="w-4 h-4" />
                        Preview
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Edit className="w-4 h-4" />
                        Edit
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
