import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Zap, 
  Check, 
  Settings,
  MessageSquare,
  CreditCard,
  Database,
  Mail,
  FileText
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";

const integrations = [
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    description: "Send automated WhatsApp messages to clients",
    icon: MessageSquare,
    status: "connected",
    features: ["Order confirmations", "Driver updates", "Post-event follow-ups"]
  },
  {
    id: "payfast",
    name: "PayFast",
    description: "Accept payments online securely",
    icon: CreditCard,
    status: "available",
    features: ["Online payments", "Subscription billing", "Payment tracking"]
  },
  {
    id: "xero",
    name: "Xero Accounting",
    description: "Sync invoices and financial data",
    icon: Database,
    status: "available",
    features: ["Invoice sync", "Expense tracking", "Financial reports"]
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Email marketing and automation",
    icon: Mail,
    status: "available",
    features: ["Email campaigns", "Newsletter management", "Marketing automation"]
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Export data to Google Sheets",
    icon: FileText,
    status: "available",
    features: ["Data export", "Report generation", "Inventory sync"]
  }
];

export default function AdminIntegrations() {
  const { user } = useAuth();
  const [enabledIntegrations, setEnabledIntegrations] = useState<string[]>(["whatsapp"]);

  const toggleIntegration = (id: string) => {
    setEnabledIntegrations(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Integrations - CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-6 md:py-8 lg:py-12 max-w-7xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Integrations</h1>
              <p className="text-slate-600">Connect your favorite tools and services</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {integrations.map((integration) => {
              const Icon = integration.icon;
              const isEnabled = enabledIntegrations.includes(integration.id);
              const isConnected = integration.status === "connected";

              return (
                <Card key={integration.id} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between mb-3">
                      <div className={`p-3 rounded-lg ${
                        isConnected ? "bg-green-100" : "bg-slate-100"
                      }`}>
                        <Icon className={`w-6 h-6 ${
                          isConnected ? "text-green-600" : "text-slate-600"
                        }`} />
                      </div>
                      <Badge className={
                        isConnected 
                          ? "bg-green-100 text-green-800" 
                          : "bg-slate-100 text-slate-800"
                      }>
                        {isConnected ? "Connected" : "Available"}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg">{integration.name}</CardTitle>
                    <CardDescription>{integration.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-slate-700 mb-2">Features:</p>
                        <ul className="space-y-1">
                          {integration.features.map((feature, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                              <Check className="w-4 h-4 text-green-600" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={() => toggleIntegration(integration.id)}
                          />
                          <span className="text-sm text-slate-600">
                            {isEnabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                        <Button variant="outline" size="sm">
                          <Settings className="w-4 h-4 mr-2" />
                          Configure
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="mt-8 border-0 shadow-lg bg-gradient-to-r from-purple-50 to-indigo-50">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Zap className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 mb-2">Need a custom integration?</h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Contact our support team to discuss custom integrations for your specific business needs.
                  </p>
                  <Button variant="outline">Contact Support</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />
    </>
  );
}