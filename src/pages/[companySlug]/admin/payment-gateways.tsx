
import { useRouter } from "next/router";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CreditCard, Save, AlertCircle, CheckCircle2 } from "lucide-react";

export default function PaymentGatewaysPage() {
  const router = useRouter();
  const { companySlug } = router.query;

  return (
    <>
      <AdminNav companySlug={companySlug as string} />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Payment Gateways</h1>
              <p className="text-slate-600">Configure payment processing for your business</p>
            </div>
            <Button className="gap-2">
              <Save className="w-4 h-4" />
              Save Changes
            </Button>
          </div>

          <Card className="mb-6 border-2 border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">Payment Gateway Information</h4>
                  <p className="text-sm text-blue-700">
                    Configure your payment gateways to accept online payments from clients. 
                    PayFast is recommended for South African businesses, while Stripe is ideal for international transactions.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    PayFast (South Africa)
                  </CardTitle>
                  <CardDescription>Accept payments from South African clients</CardDescription>
                </div>
                <Badge className="bg-slate-100 text-slate-700 gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Not Connected
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-semibold text-slate-900">Enable PayFast</h4>
                  <p className="text-sm text-slate-500">Accept ZAR payments via PayFast</p>
                </div>
                <Switch />
              </div>
              <div>
                <Label htmlFor="payfast-merchant-id">Merchant ID</Label>
                <Input id="payfast-merchant-id" placeholder="Enter your PayFast Merchant ID" className="mt-2" />
              </div>
              <div>
                <Label htmlFor="payfast-merchant-key">Merchant Key</Label>
                <Input id="payfast-merchant-key" type="password" placeholder="Enter your PayFast Merchant Key" className="mt-2" />
              </div>
              <div>
                <Label htmlFor="payfast-passphrase">Passphrase (Optional)</Label>
                <Input id="payfast-passphrase" type="password" placeholder="Enter your PayFast Passphrase" className="mt-2" />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50">
                <div>
                  <h4 className="font-semibold text-slate-900">Test Mode</h4>
                  <p className="text-sm text-slate-500">Use PayFast sandbox for testing</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    Stripe (International)
                  </CardTitle>
                  <CardDescription>Accept payments from international clients</CardDescription>
                </div>
                <Badge className="bg-slate-100 text-slate-700 gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Not Connected
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-semibold text-slate-900">Enable Stripe</h4>
                  <p className="text-sm text-slate-500">Accept USD/GBP/EUR payments via Stripe</p>
                </div>
                <Switch />
              </div>
              <div>
                <Label htmlFor="stripe-publishable-key">Publishable Key</Label>
                <Input id="stripe-publishable-key" placeholder="pk_live_..." className="mt-2" />
              </div>
              <div>
                <Label htmlFor="stripe-secret-key">Secret Key</Label>
                <Input id="stripe-secret-key" type="password" placeholder="sk_live_..." className="mt-2" />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50">
                <div>
                  <h4 className="font-semibold text-slate-900">Test Mode</h4>
                  <p className="text-sm text-slate-500">Use Stripe test keys for testing</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
