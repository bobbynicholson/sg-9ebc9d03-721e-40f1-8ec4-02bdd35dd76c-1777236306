
import { useRouter } from "next/router";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, CheckCircle2, AlertCircle, Settings, Calendar } from "lucide-react";

export default function SubscriptionPage() {
  const router = useRouter();
  const { companySlug } = router.query;

  return (
    <>
      <AdminNav companySlug={companySlug as string} />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Subscription Management</h1>
            <p className="text-slate-600">Manage your CateringMS subscription and billing</p>
          </div>

          <Card className="mb-6 border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <CardTitle>Current Plan</CardTitle>
                    <Badge className="bg-green-100 text-green-700 gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Active
                    </Badge>
                  </div>
                  <CardDescription>Your subscription is active and in good standing</CardDescription>
                </div>
                <Button variant="outline">
                  <Settings className="w-4 h-4 mr-2" />
                  Manage Plan
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-white rounded-lg border">
                  <p className="text-sm text-slate-600 mb-1">Plan Type</p>
                  <p className="text-xl font-bold text-slate-900">Professional</p>
                </div>
                <div className="p-4 bg-white rounded-lg border">
                  <p className="text-sm text-slate-600 mb-1">Monthly Cost</p>
                  <p className="text-xl font-bold text-slate-900">R799</p>
                </div>
                <div className="p-4 bg-white rounded-lg border">
                  <p className="text-sm text-slate-600 mb-1">Next Billing</p>
                  <p className="text-xl font-bold text-slate-900">Jan 1, 2025</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Billing Information</CardTitle>
              <CardDescription>Manage your payment method and billing details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                      <CreditCard className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900">Visa •••• 4242</h4>
                      <p className="text-sm text-slate-500">Expires 12/2025</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">Update</Button>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold text-slate-900 mb-2">Billing Address</h4>
                  <p className="text-sm text-slate-600">
                    123 Business Street<br />
                    Cape Town, Western Cape<br />
                    8001, South Africa
                  </p>
                  <Button variant="ghost" size="sm" className="mt-2">Edit Address</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Billing History</CardTitle>
              <CardDescription>View past invoices and payments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-semibold text-slate-900">December 2024</p>
                    <p className="text-sm text-slate-500">Paid on Dec 1, 2024</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-900">R799</span>
                    <Badge className="bg-green-100 text-green-700">Paid</Badge>
                    <Button variant="ghost" size="sm">Download</Button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-semibold text-slate-900">November 2024</p>
                    <p className="text-sm text-slate-500">Paid on Nov 1, 2024</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-900">R799</span>
                    <Badge className="bg-green-100 text-green-700">Paid</Badge>
                    <Button variant="ghost" size="sm">Download</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Available Plans</CardTitle>
              <CardDescription>Upgrade or downgrade your subscription</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg hover:border-purple-300 transition-colors">
                  <h3 className="font-bold text-lg mb-2">Starter</h3>
                  <p className="text-3xl font-bold text-purple-600 mb-4">R299<span className="text-sm text-slate-500 font-normal">/month</span></p>
                  <ul className="space-y-2 mb-4">
                    <li className="text-sm text-slate-600 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Up to 50 orders/month
                    </li>
                    <li className="text-sm text-slate-600 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      5 team members
                    </li>
                    <li className="text-sm text-slate-600 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Basic support
                    </li>
                  </ul>
                  <Button variant="outline" className="w-full">Select Plan</Button>
                </div>

                <div className="p-4 border-2 border-purple-500 rounded-lg bg-purple-50 relative">
                  <Badge className="absolute -top-3 right-4 bg-purple-600">Current</Badge>
                  <h3 className="font-bold text-lg mb-2">Professional</h3>
                  <p className="text-3xl font-bold text-purple-600 mb-4">R799<span className="text-sm text-slate-500 font-normal">/month</span></p>
                  <ul className="space-y-2 mb-4">
                    <li className="text-sm text-slate-600 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Unlimited orders
                    </li>
                    <li className="text-sm text-slate-600 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Unlimited team members
                    </li>
                    <li className="text-sm text-slate-600 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Priority support
                    </li>
                  </ul>
                  <Button className="w-full" disabled>Current Plan</Button>
                </div>

                <div className="p-4 border rounded-lg hover:border-purple-300 transition-colors">
                  <h3 className="font-bold text-lg mb-2">Enterprise</h3>
                  <p className="text-3xl font-bold text-purple-600 mb-4">Custom</p>
                  <ul className="space-y-2 mb-4">
                    <li className="text-sm text-slate-600 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Everything in Pro
                    </li>
                    <li className="text-sm text-slate-600 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Custom integrations
                    </li>
                    <li className="text-sm text-slate-600 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Dedicated support
                    </li>
                  </ul>
                  <Button variant="outline" className="w-full">Contact Sales</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
