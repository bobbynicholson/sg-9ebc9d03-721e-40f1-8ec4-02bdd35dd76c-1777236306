import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Settings, 
  Bell, 
  Mail, 
  Calendar, 
  DollarSign, 
  Clock, 
  Truck,
  ChefHat,
  Save,
  CheckCircle,
  Globe,
  Building2,
  ArrowRight
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";

export default function AdminSettingsPage() {
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState({
    company: {
      name: "Your Catering Company",
      email: "info@yourcatering.com",
      phone: "+27 12 345 6789",
      address: "123 Main Street, Johannesburg",
      logo: "",
    },
    notifications: {
      emailNewLead: true,
      emailQuoteAccepted: true,
      emailPaymentReceived: true,
      smsDriverAssigned: true,
      smsDeliveryUpdate: true,
      emailComplaint: true,
      emailDailyReport: true,
    },
    automation: {
      autoFollowUpDays: 3,
      secondFollowUpDays: 7,
      reminderDays: [14, 7, 3, 1],
      autoDiscountPercent: 10,
      reviewRequestDays: 1,
      complaintResponseHours: 24,
    },
    pricing: {
      weekendPremium: 15,
      lastMinuteSurcharge: 25,
      earlyBirdDiscount: 10,
      bulkDiscountThreshold: 100,
      bulkDiscountPercent: 15,
      minimumOrderValue: 5000,
    },
    operations: {
      equipmentCleaningHours: 4,
      kitchenPrepHours: 48,
      deliveryBufferMinutes: 30,
      maxConcurrentEvents: 5,
      driverRadius: 50,
    },
    financial: {
      currency: "ZAR",
      taxRate: 15,
      depositPercent: 30,
      cancellationFeePercent: 25,
      refundProcessDays: 7,
    },
  });

  const handleSave = () => {
    localStorage.setItem("admin_settings", JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const updateSetting = (category: string, key: string, value: any) => {
    setSettings({
      ...settings,
      [category]: {
        ...settings[category as keyof typeof settings],
        [key]: value,
      },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shadow-lg">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">System Settings</h1>
              <p className="text-slate-600">Configure platform preferences and automation</p>
            </div>
          </div>
          <Button onClick={handleSave} className="bg-slate-600 hover:bg-slate-700">
            <Save className="w-4 h-4 mr-2" />
            Save All Changes
          </Button>
        </div>

        {saved && (
          <Card className="border-0 shadow-lg bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-l-green-500">
            <CardContent className="py-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <p className="font-semibold text-green-900">Settings saved successfully!</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-0 shadow-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 text-white">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <Globe className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-1">Scale Across Regions</h3>
                  <p className="text-purple-100">
                    Launch franchises and regional operations in new provinces. Head office manages sales while regions handle fulfillment.
                  </p>
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      <span className="text-sm">Independent Kitchens</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4" />
                      <span className="text-sm">Regional Drivers</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ChefHat className="w-4 h-4" />
                      <span className="text-sm">Local Teams</span>
                    </div>
                  </div>
                </div>
              </div>
              <Link href="/admin/regions">
                <Button size="lg" className="bg-white text-purple-600 hover:bg-purple-50">
                  Manage Regions
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/admin/order-assignments">
                <Button size="lg" variant="outline" className="bg-white/80 hover:bg-white">
                  Assign Orders
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="company" className="space-y-6">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="company">Company</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="operations">Operations</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
            <TabsTrigger value="email-automation">Email Automation</TabsTrigger>
          </TabsList>

          <TabsContent value="company">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Company Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Company Name</Label>
                  <Input
                    value={settings.company.name}
                    onChange={(e) => updateSetting("company", "name", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    value={settings.company.email}
                    onChange={(e) => updateSetting("company", "email", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input
                    value={settings.company.phone}
                    onChange={(e) => updateSetting("company", "phone", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Physical Address</Label>
                  <Input
                    value={settings.company.address}
                    onChange={(e) => updateSetting("company", "address", e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Notification Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="font-medium">New Lead Notification</p>
                      <p className="text-sm text-slate-600">Get notified when a new lead is captured</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.notifications.emailNewLead}
                    onCheckedChange={(checked) =>
                      updateSetting("notifications", "emailNewLead", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="font-medium">Quote Accepted</p>
                      <p className="text-sm text-slate-600">Notification when client accepts quote</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.notifications.emailQuoteAccepted}
                    onCheckedChange={(checked) =>
                      updateSetting("notifications", "emailQuoteAccepted", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <DollarSign className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="font-medium">Payment Received</p>
                      <p className="text-sm text-slate-600">Alert when payment is processed</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.notifications.emailPaymentReceived}
                    onCheckedChange={(checked) =>
                      updateSetting("notifications", "emailPaymentReceived", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Truck className="w-5 h-5 text-purple-600" />
                    <div>
                      <p className="font-medium">Driver Assignment (SMS)</p>
                      <p className="text-sm text-slate-600">SMS to driver when assigned to delivery</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.notifications.smsDriverAssigned}
                    onCheckedChange={(checked) =>
                      updateSetting("notifications", "smsDriverAssigned", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-red-600" />
                    <div>
                      <p className="font-medium">Complaint Submitted</p>
                      <p className="text-sm text-slate-600">Immediate alert for new complaints</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.notifications.emailComplaint}
                    onCheckedChange={(checked) =>
                      updateSetting("notifications", "emailComplaint", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-slate-600" />
                    <div>
                      <p className="font-medium">Daily Summary Report</p>
                      <p className="text-sm text-slate-600">Daily email with key metrics and upcoming events</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.notifications.emailDailyReport}
                    onCheckedChange={(checked) =>
                      updateSetting("notifications", "emailDailyReport", checked)
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="automation">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Automation Rules
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Follow-up (days after quote)</Label>
                    <Input
                      type="number"
                      value={settings.automation.autoFollowUpDays}
                      onChange={(e) =>
                        updateSetting("automation", "autoFollowUpDays", parseInt(e.target.value))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Second Follow-up (days after quote)</Label>
                    <Input
                      type="number"
                      value={settings.automation.secondFollowUpDays}
                      onChange={(e) =>
                        updateSetting("automation", "secondFollowUpDays", parseInt(e.target.value))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Follow-up Discount (%)</Label>
                  <Input
                    type="number"
                    value={settings.automation.autoDiscountPercent}
                    onChange={(e) =>
                      updateSetting("automation", "autoDiscountPercent", parseInt(e.target.value))
                    }
                  />
                  <p className="text-sm text-slate-600">Discount offered in second follow-up email</p>
                </div>

                <div className="space-y-2">
                  <Label>Event Reminder Days (comma-separated)</Label>
                  <Input
                    value={settings.automation.reminderDays.join(", ")}
                    onChange={(e) =>
                      updateSetting(
                        "automation",
                        "reminderDays",
                        e.target.value.split(",").map((d) => parseInt(d.trim()))
                      )
                    }
                  />
                  <p className="text-sm text-slate-600">Send reminders X days before event (e.g., 14, 7, 3, 1)</p>
                </div>

                <div className="space-y-2">
                  <Label>Review Request (days after delivery)</Label>
                  <Input
                    type="number"
                    value={settings.automation.reviewRequestDays}
                    onChange={(e) =>
                      updateSetting("automation", "reviewRequestDays", parseInt(e.target.value))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Complaint Response SLA (hours)</Label>
                  <Input
                    type="number"
                    value={settings.automation.complaintResponseHours}
                    onChange={(e) =>
                      updateSetting("automation", "complaintResponseHours", parseInt(e.target.value))
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pricing">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Pricing Rules
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Weekend Premium (%)</Label>
                    <Input
                      type="number"
                      value={settings.pricing.weekendPremium}
                      onChange={(e) =>
                        updateSetting("pricing", "weekendPremium", parseInt(e.target.value))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Minute Surcharge (%)</Label>
                    <Input
                      type="number"
                      value={settings.pricing.lastMinuteSurcharge}
                      onChange={(e) =>
                        updateSetting("pricing", "lastMinuteSurcharge", parseInt(e.target.value))
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Early Bird Discount (%)</Label>
                    <Input
                      type="number"
                      value={settings.pricing.earlyBirdDiscount}
                      onChange={(e) =>
                        updateSetting("pricing", "earlyBirdDiscount", parseInt(e.target.value))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Bulk Discount Threshold (guests)</Label>
                    <Input
                      type="number"
                      value={settings.pricing.bulkDiscountThreshold}
                      onChange={(e) =>
                        updateSetting("pricing", "bulkDiscountThreshold", parseInt(e.target.value))
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Bulk Discount (%)</Label>
                    <Input
                      type="number"
                      value={settings.pricing.bulkDiscountPercent}
                      onChange={(e) =>
                        updateSetting("pricing", "bulkDiscountPercent", parseInt(e.target.value))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Minimum Order Value (R)</Label>
                    <Input
                      type="number"
                      value={settings.pricing.minimumOrderValue}
                      onChange={(e) =>
                        updateSetting("pricing", "minimumOrderValue", parseInt(e.target.value))
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="operations">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ChefHat className="w-5 h-5" />
                  Operational Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Equipment Cleaning Time (hours)</Label>
                    <Input
                      type="number"
                      value={settings.operations.equipmentCleaningHours}
                      onChange={(e) =>
                        updateSetting("operations", "equipmentCleaningHours", parseInt(e.target.value))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Kitchen Prep Lead Time (hours)</Label>
                    <Input
                      type="number"
                      value={settings.operations.kitchenPrepHours}
                      onChange={(e) =>
                        updateSetting("operations", "kitchenPrepHours", parseInt(e.target.value))
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Delivery Buffer Time (minutes)</Label>
                    <Input
                      type="number"
                      value={settings.operations.deliveryBufferMinutes}
                      onChange={(e) =>
                        updateSetting("operations", "deliveryBufferMinutes", parseInt(e.target.value))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Concurrent Events</Label>
                    <Input
                      type="number"
                      value={settings.operations.maxConcurrentEvents}
                      onChange={(e) =>
                        updateSetting("operations", "maxConcurrentEvents", parseInt(e.target.value))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Driver Service Radius (km)</Label>
                  <Input
                    type="number"
                    value={settings.operations.driverRadius}
                    onChange={(e) =>
                      updateSetting("operations", "driverRadius", parseInt(e.target.value))
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="financial">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Financial Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select
                      value={settings.financial.currency}
                      onValueChange={(value) => updateSetting("financial", "currency", value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ZAR">ZAR (South African Rand)</SelectItem>
                        <SelectItem value="USD">USD (US Dollar)</SelectItem>
                        <SelectItem value="EUR">EUR (Euro)</SelectItem>
                        <SelectItem value="GBP">GBP (British Pound)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>VAT/Tax Rate (%)</Label>
                    <Input
                      type="number"
                      value={settings.financial.taxRate}
                      onChange={(e) =>
                        updateSetting("financial", "taxRate", parseInt(e.target.value))
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Required Deposit (%)</Label>
                    <Input
                      type="number"
                      value={settings.financial.depositPercent}
                      onChange={(e) =>
                        updateSetting("financial", "depositPercent", parseInt(e.target.value))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cancellation Fee (%)</Label>
                    <Input
                      type="number"
                      value={settings.financial.cancellationFeePercent}
                      onChange={(e) =>
                        updateSetting("financial", "cancellationFeePercent", parseInt(e.target.value))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Refund Processing Time (days)</Label>
                  <Input
                    type="number"
                    value={settings.financial.refundProcessDays}
                    onChange={(e) =>
                      updateSetting("financial", "refundProcessDays", parseInt(e.target.value))
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="email-automation">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  After-Sales Email Automation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2">Intelligent Follow-Up System</h3>
                      <p className="text-slate-700 mb-4">
                        Automatically nurture client relationships with 6 strategic emails sent over 12 months after each event. 
                        Build loyalty, drive repeat business, and maintain top-of-mind awareness.
                      </p>
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="bg-white rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-blue-600">6</div>
                          <div className="text-xs text-slate-600">Strategic Emails</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-green-600">12</div>
                          <div className="text-xs text-slate-600">Month Journey</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-purple-600">Auto</div>
                          <div className="text-xs text-slate-600">Fully Automated</div>
                        </div>
                      </div>
                      <Link href="/admin/after-sales-emails">
                        <Button className="w-full bg-blue-600 hover:bg-blue-700">
                          Manage Email Templates
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold text-sm">Email Journey Timeline:</h4>
                  <div className="space-y-2">
                    {[
                      { months: 2, title: "Initial Feedback Request", desc: "How was your event?" },
                      { months: 4, title: "New Services Introduction", desc: "Share menu updates & special offers" },
                      { months: 6, title: "Seasonal Check-in", desc: "Perfect timing for celebrations" },
                      { months: 8, title: "VIP Benefits Reminder", desc: "Exclusive discounts & priority booking" },
                      { months: 10, title: "Year-End Planning", desc: "Holiday events & new year bookings" },
                      { months: 12, title: "Anniversary Celebration", desc: "Special thank you & biggest discount" },
                    ].map((email, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 bg-white rounded-lg border">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold">
                          {email.months}mo
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{email.title}</p>
                          <p className="text-xs text-slate-600">{email.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
