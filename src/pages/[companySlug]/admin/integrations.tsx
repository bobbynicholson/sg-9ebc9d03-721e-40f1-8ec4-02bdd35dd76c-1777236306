
import { useRouter } from "next/router";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plug, CheckCircle2, AlertCircle, Settings } from "lucide-react";

export default function IntegrationsPage() {
  const router = useRouter();
  const { companySlug } = router.query;

  const integrations = [
    {
      id: "payfast",
      name: "PayFast",
      description: "Payment processing for South Africa",
      status: "not_connected",
      category: "Payments"
    },
    {
      id: "stripe",
      name: "Stripe",
      description: "Global payment processing",
      status: "not_connected",
      category: "Payments"
    },
    {
      id: "xero",
      name: "Xero",
      description: "Accounting and invoicing",
      status: "not_connected",
      category: "Accounting"
    },
    {
      id: "quickbooks",
      name: "QuickBooks",
      description: "Financial management",
      status: "not_connected",
      category: "Accounting"
    },
    {
      id: "google_maps",
      name: "Google Maps",
      description: "Location and routing services",
      status: "not_connected",
      category: "Logistics"
    },
    {
      id: "whatsapp",
      name: "WhatsApp Business",
      description: "Customer messaging",
      status: "not_connected",
      category: "Communications"
    }
  ];

  const getStatusBadge = (status: string) => {
    if (status === "connected") {
      return (
        <Badge className="bg-green-100 text-green-700 gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Connected
        </Badge>
      );
    }
    return (
      <Badge className="bg-slate-100 text-slate-700 gap-1">
        <AlertCircle className="w-3 h-3" />
        Not Connected
        </Badge>
    );
  };

  return (
    <>
      <AdminNav companySlug={companySlug as string} />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Integrations</h1>
            <p className="text-slate-600">Connect third-party services to enhance your platform</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Total Integrations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{integrations.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Connected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {integrations.filter(i => i.status === "connected").length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Available</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {integrations.filter(i => i.status === "not_connected").length}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Available Integrations</CardTitle>
              <CardDescription>Connect popular services to automate your workflow</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {integrations.map((integration) => (
                  <div
                    key={integration.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:border-purple-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                        <Plug className="w-6 h-6 text-purple-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-900">{integration.name}</h3>
                          {getStatusBadge(integration.status)}
                        </div>
                        <p className="text-sm text-slate-500">{integration.description}</p>
                        <p className="text-xs text-slate-400 mt-1">{integration.category}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Settings className="w-4 h-4" />
                      {integration.status === "connected" ? "Configure" : "Connect"}
                    </Button>
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
