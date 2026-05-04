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
    // Contact
    name: "",
    company: "",
    email: "",
    phone: "",
    // Event
    eventType: "",
    eventDate: "",
    eventTime: "",
    guestCount: "",
    venueAddress: "",
    // Money + context
    budget: "",
    source: "manual_add",
    specialRequests: "",
    notes: "",
  });

  // Common lead-source options. Free text "Other" preserved via the
  // dropdown's last option which falls back to manual_add behind the
  // scenes -- the source string itself is human-readable in the leads
  // funnel chart and used as-is.
  const SOURCE_OPTIONS = [
    { value: "manual_add",     label: "Direct enquiry / manual entry" },
    { value: "website",        label: "Website form" },
    { value: "referral",       label: "Referral / word of mouth" },
    { value: "instagram",      label: "Instagram" },
    { value: "facebook",       label: "Facebook" },
    { value: "google_search",  label: "Google search" },
    { value: "repeat_client",  label: "Repeat client" },
    { value: "phone_enquiry",  label: "Phone enquiry" },
    { value: "walk_in",        label: "Walk-in" },
    { value: "other",          label: "Other" },
  ];

  const EVENT_TYPE_SUGGESTIONS = [
    "Wedding", "Corporate lunch", "Birthday party", "Anniversary",
    "Year-end function", "Conference", "Funeral", "Other private event",
  ];

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
      // Stitch optional event_time onto the event_date so the time stays
      // visible without a separate column. If only the date is given,
      // skip the suffix.
      const eventDateTimeISO = formData.eventDate
        ? (formData.eventTime
            ? new Date(`${formData.eventDate}T${formData.eventTime}`).toISOString()
            : new Date(formData.eventDate).toISOString())
        : null;

      // Combine special requests + notes when both are filled. Special
      // requests get a clear header so they're easy to scan when the
      // lead later becomes a quote.
      const combinedNotes = [
        formData.specialRequests
          ? `Special requests / dietary:\n${formData.specialRequests}`
          : null,
        formData.notes ? formData.notes : null,
      ]
        .filter(Boolean)
        .join("\n\n");

      await leadService.createLead({
        company_id: user.company_id,
        region_id: resolvedRegionId,
        contact_name: formData.name,
        company_name: formData.company || null,
        client_name: formData.name,
        client_email: formData.email,
        email: formData.email,
        phone: formData.phone || null,
        client_phone: formData.phone || null,
        event_date: eventDateTimeISO,
        guest_count: parseInt(formData.guestCount) || 0,
        event_type: formData.eventType || null,
        venue_address: formData.venueAddress || null,
        budget_range: formData.budget,
        budget: formData.budget ? parseFloat(formData.budget) : null,
        special_requests: formData.specialRequests || null,
        notes: combinedNotes || null,
        status: "new",
        source: formData.source || "manual_add",
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
              <CardTitle>Lead information</CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                Only contact name and email are required. Fill in what you know -- the rest can be added later when you build the quote.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-8">

                {/* ── Contact ───────────────────────────────────── */}
                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Contact</h3>
                    <p className="text-xs text-slate-500">Who you'll be talking to.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Contact name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Full name"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="company">Company / organisation</Label>
                      <Input
                        id="company"
                        value={formData.company}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        placeholder="Optional -- leave blank for individuals"
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
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="name@example.co.za"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+27 21 555 1234"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="source">Where did this lead come from?</Label>
                    <select
                      id="source"
                      value={formData.source}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {SOURCE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">
                      Helps the Lead source funnel chart on your dashboard see which channels actually convert.
                    </p>
                  </div>
                </section>

                {/* ── Event ─────────────────────────────────────── */}
                <section className="space-y-4 pt-2 border-t border-slate-100">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Event details</h3>
                    <p className="text-xs text-slate-500">All optional. Anything you capture here flows straight into the quote when you're ready.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="eventType">Event type</Label>
                      <Input
                        id="eventType"
                        list="event-type-suggestions"
                        value={formData.eventType}
                        onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
                        placeholder="Wedding, corporate lunch, etc."
                      />
                      <datalist id="event-type-suggestions">
                        {EVENT_TYPE_SUGGESTIONS.map((t) => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <Label htmlFor="guestCount">Guest count</Label>
                      <Input
                        id="guestCount"
                        type="number"
                        min={0}
                        value={formData.guestCount}
                        onChange={(e) => setFormData({ ...formData, guestCount: e.target.value })}
                        placeholder="e.g. 80"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="eventDate">Event date</Label>
                      <Input
                        id="eventDate"
                        type="date"
                        value={formData.eventDate}
                        onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="eventTime">Start time</Label>
                      <Input
                        id="eventTime"
                        type="time"
                        value={formData.eventTime}
                        onChange={(e) => setFormData({ ...formData, eventTime: e.target.value })}
                        disabled={!formData.eventDate}
                      />
                      {!formData.eventDate && (
                        <p className="text-xs text-slate-400 mt-1">Pick a date first.</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="venueAddress">Venue / event location</Label>
                    <Input
                      id="venueAddress"
                      value={formData.venueAddress}
                      onChange={(e) => setFormData({ ...formData, venueAddress: e.target.value })}
                      placeholder="Suburb, city, or full address if you have it"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Helpful for delivery distance + branch routing later. A suburb is fine for now.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="budget">Budget (R)</Label>
                    <Input
                      id="budget"
                      type="number"
                      min={0}
                      step="0.01"
                      value={formData.budget}
                      onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                      placeholder="Their estimated total spend"
                    />
                  </div>
                </section>

                {/* ── Extras ────────────────────────────────────── */}
                <section className="space-y-4 pt-2 border-t border-slate-100">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Extra context</h3>
                    <p className="text-xs text-slate-500">Anything that'll help shape the quote -- dietary needs, what they asked for verbatim, the vibe.</p>
                  </div>
                  <div>
                    <Label htmlFor="specialRequests">Special requests / dietary</Label>
                    <Textarea
                      id="specialRequests"
                      value={formData.specialRequests}
                      onChange={(e) => setFormData({ ...formData, specialRequests: e.target.value })}
                      rows={3}
                      placeholder={'e.g. "Halaal only", "2 vegan guests, 1 nut allergy", "no pork on the menu"'}
                    />
                  </div>
                  <div>
                    <Label htmlFor="notes">Internal notes</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={4}
                      placeholder="Anything else you want to remember -- how they sounded on the phone, who referred them, follow-up timing..."
                    />
                  </div>
                </section>

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