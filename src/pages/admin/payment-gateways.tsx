import { useState, useEffect } from "react";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CreditCard, Globe, MapPin, Check, AlertCircle, Settings } from "lucide-react";
import { PaymentGatewayConfig, PaymentGateway } from "@/types/payments";

const gatewayDetails: Record<PaymentGateway, {
  name: string;
  description: string;
  region: "south-africa" | "international";
  fields: Array<{ key: string; label: string; type: string; required: boolean }>;
}> = {
  payfast: {
    name: "PayFast",
    description: "South Africa's leading payment gateway",
    region: "south-africa",
    fields: [
      { key: "merchantId", label: "Merchant ID", type: "text", required: true },
      { key: "merchantKey", label: "Merchant Key", type: "password", required: true },
      { key: "passphrase", label: "Passphrase", type: "password", required: true },
    ],
  },
  yoco: {
    name: "Yoco",
    description: "Simple, affordable payments for South African businesses",
    region: "south-africa",
    fields: [
      { key: "secretKey", label: "Secret Key", type: "password", required: true },
      { key: "publicKey", label: "Public Key", type: "text", required: true },
    ],
  },
  peach: {
    name: "Peach Payments",
    description: "Enterprise payment solutions for Africa",
    region: "south-africa",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", required: true },
      { key: "merchantId", label: "Entity ID", type: "text", required: true },
    ],
  },
  stripe: {
    name: "Stripe",
    description: "Global payment processing platform",
    region: "international",
    fields: [
      { key: "publicKey", label: "Publishable Key", type: "text", required: true },
      { key: "secretKey", label: "Secret Key", type: "password", required: true },
    ],
  },
  paypal: {
    name: "PayPal",
    description: "Trusted by millions worldwide",
    region: "international",
    fields: [
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", required: true },
    ],
  },
  square: {
    name: "Square",
    description: "Complete commerce platform",
    region: "international",
    fields: [
      { key: "apiKey", label: "Access Token", type: "password", required: true },
      { key: "merchantId", label: "Location ID", type: "text", required: true },
    ],
  },
};

export default function PaymentGatewaysPage() {
  const [configs, setConfigs] = useState<PaymentGatewayConfig[]>([]);
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway | null>(null);
  const [formData, setFormData] = useState<Partial<PaymentGatewayConfig>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("payment_gateway_config");
    if (stored) {
      setConfigs(JSON.parse(stored));
    }
  }, []);

  const handleSave = () => {
    if (!selectedGateway) return;

    const details = gatewayDetails[selectedGateway];
    const newConfig: PaymentGatewayConfig = {
      id: `cfg-${Date.now()}`,
      gateway: selectedGateway,
      name: details.name,
      enabled: formData.enabled || false,
      isTest: formData.isTest || true,
      region: details.region,
      credentials: formData.credentials || {},
      webhookUrl: formData.webhookUrl,
      successUrl: formData.successUrl || `${window.location.origin}/payment/success`,
      cancelUrl: formData.cancelUrl || `${window.location.origin}/payment/cancel`,
      notifyUrl: formData.notifyUrl || `${window.location.origin}/api/payment/webhook`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const existingIndex = configs.findIndex(c => c.gateway === selectedGateway);
    let newConfigs;
    
    if (existingIndex !== -1) {
      newConfigs = [...configs];
      newConfigs[existingIndex] = { ...newConfigs[existingIndex], ...newConfig };
    } else {
      newConfigs = [...configs, newConfig];
    }

    if (newConfig.enabled) {
      newConfigs = newConfigs.map(c => ({
        ...c,
        enabled: c.gateway === selectedGateway
      }));
    }

    setConfigs(newConfigs);
    localStorage.setItem("payment_gateway_config", JSON.stringify(newConfigs));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const getConfig = (gateway: PaymentGateway) => {
    return configs.find(c => c.gateway === gateway);
  };

  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Payment Gateways - CateringMS Admin</title>
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-6">
        <div className="max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Payment Gateways</h1>
            <p className="text-muted-foreground">Configure your payment processing options</p>
          </div>

          {saved && (
            <Alert className="border-green-200 bg-green-50 dark:bg-green-950">
              <Check className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                Payment gateway configuration saved successfully
              </AlertDescription>
            </Alert>
          )}

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> You will need Supabase connected before launch to securely store payment credentials and process real transactions. Current settings are stored locally for testing only.
            </AlertDescription>
          </Alert>

          <Tabs defaultValue="south-africa" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="south-africa" className="gap-2">
                <MapPin className="h-4 w-4" />
                South African Gateways
              </TabsTrigger>
              <TabsTrigger value="international" className="gap-2">
                <Globe className="h-4 w-4" />
                International Gateways
              </TabsTrigger>
            </TabsList>

            <TabsContent value="south-africa" className="space-y-6">
              <div className="grid md:grid-cols-3 gap-6">
                {(["payfast", "yoco", "peach"] as PaymentGateway[]).map((gateway) => {
                  const details = gatewayDetails[gateway];
                  const config = getConfig(gateway);
                  
                  return (
                    <Card key={gateway} className="relative overflow-hidden hover:shadow-lg transition-shadow">
                      {config?.enabled && (
                        <div className="absolute top-4 right-4">
                          <Badge className="bg-green-500">Active</Badge>
                        </div>
                      )}
                      <CardHeader>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <CreditCard className="h-6 w-6 text-primary" />
                          </div>
                          <CardTitle>{details.name}</CardTitle>
                        </div>
                        <CardDescription>{details.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button 
                          onClick={() => {
                            setSelectedGateway(gateway);
                            setFormData(config || {});
                          }}
                          variant={config ? "outline" : "default"}
                          className="w-full"
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          {config ? "Edit Configuration" : "Configure"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="international" className="space-y-6">
              <div className="grid md:grid-cols-3 gap-6">
                {(["stripe", "paypal", "square"] as PaymentGateway[]).map((gateway) => {
                  const details = gatewayDetails[gateway];
                  const config = getConfig(gateway);
                  
                  return (
                    <Card key={gateway} className="relative overflow-hidden hover:shadow-lg transition-shadow">
                      {config?.enabled && (
                        <div className="absolute top-4 right-4">
                          <Badge className="bg-green-500">Active</Badge>
                        </div>
                      )}
                      <CardHeader>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <Globe className="h-6 w-6 text-primary" />
                          </div>
                          <CardTitle>{details.name}</CardTitle>
                        </div>
                        <CardDescription>{details.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button 
                          onClick={() => {
                            setSelectedGateway(gateway);
                            setFormData(config || {});
                          }}
                          variant={config ? "outline" : "default"}
                          className="w-full"
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          {config ? "Edit Configuration" : "Configure"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>

          {selectedGateway && (
            <Card className="border-2 border-primary">
              <CardHeader>
                <CardTitle>Configure {gatewayDetails[selectedGateway].name}</CardTitle>
                <CardDescription>
                  Enter your {gatewayDetails[selectedGateway].name} credentials
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Gateway</Label>
                    <p className="text-sm text-muted-foreground">
                      Make this your active payment gateway
                    </p>
                  </div>
                  <Switch
                    checked={formData.enabled || false}
                    onCheckedChange={(checked) => 
                      setFormData({ ...formData, enabled: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Test Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Use sandbox/test environment
                    </p>
                  </div>
                  <Switch
                    checked={formData.isTest !== false}
                    onCheckedChange={(checked) => 
                      setFormData({ ...formData, isTest: checked })
                    }
                  />
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold">API Credentials</h4>
                  {gatewayDetails[selectedGateway].fields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label htmlFor={field.key}>
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      <Input
                        id={field.key}
                        type={field.type}
                        value={formData.credentials?.[field.key as keyof typeof formData.credentials] || ""}
                        onChange={(e) => 
                          setFormData({
                            ...formData,
                            credentials: {
                              ...formData.credentials,
                              [field.key]: e.target.value
                            }
                          })
                        }
                        placeholder={`Enter your ${field.label.toLowerCase()}`}
                      />
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold">URLs (Optional)</h4>
                  <div className="space-y-2">
                    <Label htmlFor="successUrl">Success URL</Label>
                    <Input
                      id="successUrl"
                      type="url"
                      value={formData.successUrl || ""}
                      onChange={(e) => setFormData({ ...formData, successUrl: e.target.value })}
                      placeholder="https://yourdomain.com/payment/success"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cancelUrl">Cancel URL</Label>
                    <Input
                      id="cancelUrl"
                      type="url"
                      value={formData.cancelUrl || ""}
                      onChange={(e) => setFormData({ ...formData, cancelUrl: e.target.value })}
                      placeholder="https://yourdomain.com/payment/cancel"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="webhookUrl">Webhook URL</Label>
                    <Input
                      id="webhookUrl"
                      type="url"
                      value={formData.webhookUrl || ""}
                      onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                      placeholder="https://yourdomain.com/api/payment/webhook"
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <Button onClick={handleSave} className="flex-1">
                    <Check className="h-4 w-4 mr-2" />
                    Save Configuration
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setSelectedGateway(null)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Before Launch Checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Connect Supabase</p>
                    <p className="text-sm text-muted-foreground">
                      Required for secure credential storage and real payment processing
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Payment Gateway Account</p>
                    <p className="text-sm text-muted-foreground">
                      Sign up with your chosen payment provider and get API credentials
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Email Service</p>
                    <p className="text-sm text-muted-foreground">
                      Set up Resend, SendGrid, or Supabase edge functions for automated emails
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Google Maps API</p>
                    <p className="text-sm text-muted-foreground">
                      Required for GPS tracking features
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
