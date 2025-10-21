
import { useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { quoteService } from "@/services/quoteService";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";

export default function NewQuotePage() {
  const router = useRouter();
  const { companySlug } = router.query;
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    client_name: "",
    client_email: "",
    client_phone: "",
    event_date: "",
    event_time: "",
    guest_count: "",
    event_type: "",
    venue_address: "",
    special_requirements: "",
    menu_items: "[]",
    equipment_items: "[]",
    subtotal: "0",
    tax: "0",
    total: "0",
    currency: "ZAR",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.id || !profile?.company_id) {
      toast({
        title: "Error",
        description: "User information not available",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      await quoteService.createQuote({
        user_id: user.id,
        company_id: profile.company_id,
        client_name: formData.client_name,
        client_email: formData.client_email,
        client_phone: formData.client_phone || null,
        event_date: formData.event_date,
        event_time: formData.event_time || null,
        guest_count: parseInt(formData.guest_count) || null,
        event_type: formData.event_type || null,
        venue_address: formData.venue_address || null,
        special_requirements: formData.special_requirements || null,
        menu_items: JSON.parse(formData.menu_items),
        equipment_items: JSON.parse(formData.equipment_items),
        subtotal: parseFloat(formData.subtotal),
        tax: parseFloat(formData.tax),
        total: parseFloat(formData.total),
        currency: formData.currency,
        status: "pending",
      } as any);

      toast({
        title: "Success",
        description: "Quote created successfully",
      });

      router.push(`/${companySlug}/admin/quotes`);
    } catch (error) {
      console.error("Error creating quote:", error);
      toast({
        title: "Error",
        description: "Failed to create quote",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AdminNav companySlug={companySlug as string} />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="mb-8">
            <Link href={`/${companySlug}/admin/quotes`}>
              <Button variant="ghost" className="gap-2 mb-4">
                <ArrowLeft className="w-4 h-4" />
                Back to Quotes
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">New Quote</h1>
            <p className="text-slate-600">Create a new quote for a potential client</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Quote Information</CardTitle>
              <CardDescription>Fill in the details for the new quote</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="client_name">Client Name *</Label>
                    <Input
                      id="client_name"
                      required
                      value={formData.client_name}
                      onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                      placeholder="John Doe"
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="client_email">Email Address *</Label>
                    <Input
                      id="client_email"
                      type="email"
                      required
                      value={formData.client_email}
                      onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
                      placeholder="john@example.com"
                      className="mt-2"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="client_phone">Phone Number</Label>
                    <Input
                      id="client_phone"
                      type="tel"
                      value={formData.client_phone}
                      onChange={(e) => setFormData({ ...formData, client_phone: e.target.value })}
                      placeholder="+1 234 567 8900"
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="guest_count">Number of Guests *</Label>
                    <Input
                      id="guest_count"
                      type="number"
                      required
                      value={formData.guest_count}
                      onChange={(e) => setFormData({ ...formData, guest_count: e.target.value })}
                      placeholder="100"
                      className="mt-2"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="event_date">Event Date *</Label>
                    <Input
                      id="event_date"
                      type="date"
                      required
                      value={formData.event_date}
                      onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="event_time">Event Time</Label>
                    <Input
                      id="event_time"
                      type="time"
                      value={formData.event_time}
                      onChange={(e) => setFormData({ ...formData, event_time: e.target.value })}
                      className="mt-2"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="event_type">Event Type</Label>
                    <Input
                      id="event_type"
                      value={formData.event_type}
                      onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
                      placeholder="Wedding, Corporate, Birthday, etc."
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="currency">Currency</Label>
                    <Input
                      id="currency"
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      placeholder="ZAR"
                      className="mt-2"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="venue_address">Venue Address *</Label>
                  <Input
                    id="venue_address"
                    required
                    value={formData.venue_address}
                    onChange={(e) => setFormData({ ...formData, venue_address: e.target.value })}
                    placeholder="123 Event Street, City"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="special_requirements">Special Requirements</Label>
                  <Textarea
                    id="special_requirements"
                    value={formData.special_requirements}
                    onChange={(e) => setFormData({ ...formData, special_requirements: e.target.value })}
                    placeholder="Dietary restrictions, allergies, special requests..."
                    className="mt-2"
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="subtotal">Subtotal</Label>
                    <Input
                      id="subtotal"
                      type="number"
                      step="0.01"
                      value={formData.subtotal}
                      onChange={(e) => setFormData({ ...formData, subtotal: e.target.value })}
                      placeholder="0.00"
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="tax">Tax</Label>
                    <Input
                      id="tax"
                      type="number"
                      step="0.01"
                      value={formData.tax}
                      onChange={(e) => setFormData({ ...formData, tax: e.target.value })}
                      placeholder="0.00"
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="total">Total *</Label>
                    <Input
                      id="total"
                      type="number"
                      step="0.01"
                      required
                      value={formData.total}
                      onChange={(e) => setFormData({ ...formData, total: e.target.value })}
                      placeholder="0.00"
                      className="mt-2"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button type="submit" disabled={loading} className="gap-2">
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Create Quote
                      </>
                    )}
                  </Button>
                  <Link href={`/${companySlug}/admin/quotes`}>
                    <Button type="button" variant="outline">Cancel</Button>
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
