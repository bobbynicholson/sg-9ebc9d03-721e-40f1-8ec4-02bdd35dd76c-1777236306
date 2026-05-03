import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Save } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { leadService } from "@/services/leadService";
import { useCompanyKitchens } from "@/hooks/useCompanyKitchens";
import { useToast } from "@/hooks/use-toast";

export default function NewLead() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    eventType: "",
    eventDate: "",
    guestCount: "",
    budget: "",
    notes: ""
  });

  // Branch / kitchen scoping. Single-branch tenants get auto-picked
  // and the picker stays hidden; multi-branch tenants must choose
  // before save so quotes / orders flowing off this lead inherit
  // the right region.
  const { kitchens } = useCompanyKitchens(user?.company_id ?? null);
  const [kitchenId, setKitchenId] = useState<string | null>(null);
  useEffect(() => {
    if (!kitchenId && kitchens.length > 0) setKitchenId(kitchens[0].id);
  }, [kitchens, kitchenId]);
  const selectedKitchen = kitchens.find((k) => k.id === kitchenId) || null;
  const resolvedRegionId =
    selectedKitchen && selectedKitchen.source === "region"
      ? selectedKitchen.id
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.company_id) return;

    setLoading(true);
    try {
      await leadService.createLead({
        company_id: user.company_id,
        region_id: resolvedRegionId,
        contact_name: formData.name,
        client_name: formData.name,
        client_email: formData.email,
        email: formData.email,
        client_phone: formData.phone,
        // Guard against empty date producing 'Invalid Date' -> ISO crash
        event_date: formData.eventDate ? new Date(formData.eventDate).toISOString() : null,
        guest_count: parseInt(formData.guestCount) || 0,
        event_type: formData.eventType,
        budget_range: formData.budget,
        notes: formData.notes,
        status: "new",
        source: "manual_add"
      } as any);
      
      toast({
        title: "Success",
        description: "Lead created successfully"
      });
      
      router.push("/admin/leads");
    } catch (error) {
      console.error("Error creating lead:", error);
      toast({
        title: "Error",
        description: "Failed to create lead",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>New Lead | CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8 max-w-full">
          <div className="mb-8">
            <Link href="/admin/leads">
              <Button variant="ghost" className="mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Leads
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-slate-900">Create New Lead</h1>
            <p className="text-slate-600">Add a potential customer to your pipeline</p>
          </div>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Lead Information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Contact Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="company">Company</Label>
                    <Input
                      id="company"
                      value={formData.company}
                      onChange={(e) => setFormData({...formData, company: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="eventType">Event Type</Label>
                    <Input
                      id="eventType"
                      value={formData.eventType}
                      onChange={(e) => setFormData({...formData, eventType: e.target.value})}
                      placeholder="Wedding, Corporate, etc."
                    />
                  </div>
                  <div>
                    <Label htmlFor="eventDate">Event Date</Label>
                    <Input
                      id="eventDate"
                      type="date"
                      value={formData.eventDate}
                      onChange={(e) => setFormData({...formData, eventDate: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="guestCount">Guest Count</Label>
                    <Input
                      id="guestCount"
                      type="number"
                      value={formData.guestCount}
                      onChange={(e) => setFormData({...formData, guestCount: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="budget">Budget</Label>
                    <Input
                      id="budget"
                      type="number"
                      value={formData.budget}
                      onChange={(e) => setFormData({...formData, budget: e.target.value})}
                      placeholder="Estimated budget"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    rows={4}
                    placeholder="Additional information about the lead..."
                  />
                </div>

                {kitchens.length > 1 && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4">
                    <Label className="flex items-center gap-1.5 text-sm font-medium text-blue-900">
                      <MapPin className="w-4 h-4" /> Branch / kitchen
                    </Label>
                    <p className="text-xs text-blue-800/70 mb-2">
                      Quotes, orders and prep that flow from this lead will be scoped to the
                      branch you pick.
                    </p>
                    <select
                      value={kitchenId || ""}
                      onChange={(e) => setKitchenId(e.target.value || null)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {kitchens.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                          {k.address ? ` -- ${k.address}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button type="submit" disabled={loading}>
                    <Save className="w-4 h-4 mr-2" />
                    {loading ? "Creating..." : "Create Lead"}
                  </Button>
                  <Link href="/admin/leads">
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />
    </>
  );
}