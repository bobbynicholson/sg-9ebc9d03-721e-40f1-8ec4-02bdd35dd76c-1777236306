/**
 * /admin/leads/new - create a new lead in the pipeline.
 *
 * Phase 4 #10: migrated off raw useState + onChange handlers to
 * react-hook-form + zod. Field-level validation (required name +
 * email, sane guest count, sensible budget) lands inline now
 * instead of letting bad data through to leadService.createLead
 * and surfacing as a generic toast. Keeps the existing visual
 * layout untouched; only the form plumbing changed.
 */
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
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTenantHref } from "@/lib/tenantUrl";

// Zod schema. Field-level rules:
//   - name + email always required
//   - email must parse as an email
//   - guestCount, budget optional but numeric when present
//   - eventTime requires eventDate (the UI also disables the input
//     in that case, so the rule is belt-and-braces)
const schema = z
  .object({
    name: z.string().trim().min(1, "Contact name is required"),
    company: z.string().trim().optional().default(""),
    email: z
      .string()
      .trim()
      .min(1, "Email is required")
      .email("Use a valid email address (name@example.com)"),
    phone: z.string().trim().optional().default(""),
    eventType: z.string().trim().optional().default(""),
    eventDate: z.string().optional().default(""),
    eventTime: z.string().optional().default(""),
    guestCount: z
      .string()
      .optional()
      .default("")
      .refine((v) => v === "" || /^\d+$/.test(v), {
        message: "Guest count must be a whole number",
      }),
    venueAddress: z.string().trim().optional().default(""),
    budget: z
      .string()
      .optional()
      .default("")
      .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), {
        message: "Budget must be a number, optionally with cents",
      }),
    source: z.string().default("manual_add"),
    specialRequests: z.string().optional().default(""),
    notes: z.string().optional().default(""),
  })
  .refine((d) => !d.eventTime || !!d.eventDate, {
    path: ["eventTime"],
    message: "Pick a date first",
  });

type FormValues = z.infer<typeof schema>;

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

export default function NewLead() {
  const router = useRouter();
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const { user } = useAuth();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      company: "",
      email: "",
      phone: "",
      eventType: "",
      eventDate: "",
      eventTime: "",
      guestCount: "",
      venueAddress: "",
      budget: "",
      source: "manual_add",
      specialRequests: "",
      notes: "",
    },
  });

  const eventDate = watch("eventDate");

  // Branch / kitchen scoping. Single-branch tenants get auto-picked
  // and the picker stays hidden; multi-branch tenants must choose
  // before save so quotes / orders flowing off this lead inherit
  // the right region. Kept outside the form schema because it lives
  // on the user's tenant, not the lead row.
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

  const onSubmit = async (values: FormValues) => {
    if (!user?.company_id) return;
    try {
      // Stitch optional event_time onto event_date so the time stays
      // visible without a separate column. If only the date is given,
      // skip the suffix.
      const eventDateTimeISO = values.eventDate
        ? (values.eventTime
            ? new Date(`${values.eventDate}T${values.eventTime}`).toISOString()
            : new Date(values.eventDate).toISOString())
        : null;

      const combinedNotes = [
        values.specialRequests
          ? `Special requests / dietary:\n${values.specialRequests}`
          : null,
        values.notes ? values.notes : null,
      ]
        .filter(Boolean)
        .join("\n\n");

      await leadService.createLead({
        company_id: user.company_id,
        region_id: resolvedRegionId,
        contact_name: values.name,
        company_name: values.company || null,
        client_name: values.name,
        client_email: values.email,
        email: values.email,
        phone: values.phone || null,
        client_phone: values.phone || null,
        event_date: eventDateTimeISO,
        guest_count: values.guestCount ? parseInt(values.guestCount, 10) : 0,
        event_type: values.eventType || null,
        venue_address: values.venueAddress || null,
        budget_range: values.budget,
        budget: values.budget ? parseFloat(values.budget) : null,
        special_requests: values.specialRequests || null,
        notes: combinedNotes || null,
        status: "new",
        source: values.source || "manual_add",
      } as never);

      toast({
        title: "Success",
        description: "Lead created successfully",
      });

      router.push(withSlug("/admin/leads"));
    } catch (error) {
      console.error("Error creating lead:", error);
      toast({
        title: "Error",
        description: "Failed to create lead",
        variant: "destructive",
      });
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
            <Link href={withSlug("/admin/leads")}>
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
                Only contact name and email are required. Fill in what you know. The rest can be added later when you build the quote.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

                {/* ── Contact ───────────────────────────────────── */}
                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Contact</h3>
                    <p className="text-xs text-slate-500">Who you'll be talking to.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Contact name *</Label>
                      <Input id="name" placeholder="Full name" {...register("name")} />
                      {errors.name && (
                        <p className="text-xs text-rose-600 mt-1">{errors.name.message}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="company">Company / organisation</Label>
                      <Input
                        id="company"
                        placeholder="Optional. Leave blank for individuals"
                        {...register("company")}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="name@example.co.za"
                        {...register("email")}
                      />
                      {errors.email && (
                        <p className="text-xs text-rose-600 mt-1">{errors.email.message}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input id="phone" placeholder="+27 21 555 1234" {...register("phone")} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="source">Where did this lead come from?</Label>
                    <Controller
                      control={control}
                      name="source"
                      render={({ field }) => (
                        <select
                          id="source"
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          {SOURCE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      )}
                    />
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
                        placeholder="Wedding, corporate lunch, etc."
                        {...register("eventType")}
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
                        placeholder="e.g. 80"
                        {...register("guestCount")}
                      />
                      {errors.guestCount && (
                        <p className="text-xs text-rose-600 mt-1">{errors.guestCount.message}</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="eventDate">Event date</Label>
                      <Input id="eventDate" type="date" {...register("eventDate")} />
                    </div>
                    <div>
                      <Label htmlFor="eventTime">Start time</Label>
                      <Input
                        id="eventTime"
                        type="time"
                        disabled={!eventDate}
                        {...register("eventTime")}
                      />
                      {!eventDate && (
                        <p className="text-xs text-slate-400 mt-1">Pick a date first.</p>
                      )}
                      {errors.eventTime && (
                        <p className="text-xs text-rose-600 mt-1">{errors.eventTime.message}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="venueAddress">Venue / event location</Label>
                    <Input
                      id="venueAddress"
                      placeholder="Suburb, city, or full address if you have it"
                      {...register("venueAddress")}
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
                      placeholder="Their estimated total spend"
                      {...register("budget")}
                    />
                    {errors.budget && (
                      <p className="text-xs text-rose-600 mt-1">{errors.budget.message}</p>
                    )}
                  </div>
                </section>

                {/* ── Extras ────────────────────────────────────── */}
                <section className="space-y-4 pt-2 border-t border-slate-100">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Extra context</h3>
                    <p className="text-xs text-slate-500">Anything that'll help shape the quote: dietary needs, what they asked for verbatim, the vibe.</p>
                  </div>
                  <div>
                    <Label htmlFor="specialRequests">Special requests / dietary</Label>
                    <Textarea
                      id="specialRequests"
                      rows={3}
                      placeholder={'e.g. "Halaal only", "2 vegan guests, 1 nut allergy", "no pork on the menu"'}
                      {...register("specialRequests")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="notes">Internal notes</Label>
                    <Textarea
                      id="notes"
                      rows={4}
                      placeholder="Anything else you want to remember: how they sounded on the phone, who referred them, follow-up timing..."
                      {...register("notes")}
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
                          {k.address ? ` · ${k.address}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button type="submit" disabled={isSubmitting}>
                    <Save className="w-4 h-4 mr-2" />
                    {isSubmitting ? "Creating..." : "Create Lead"}
                  </Button>
                  <Link href={withSlug("/admin/leads")}>
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

      <ChatBot userRole="admin" companyId={(user as any)?.user_metadata?.company_id} />
    </>
  );
}
