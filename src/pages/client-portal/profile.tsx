/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /client-portal/profile -- the client edits their own contact details.
 *
 * Two layers of identity at play:
 *   1. profiles.full_name / mobile_number / phone_number / whatsapp_opt_in /
 *      avatar_url -- the global identity that follows them into every
 *      catering tenant they're a client of. RLS users_update_own_profile
 *      lets them edit their own row directly; no service role needed.
 *   2. clients.client_name (per-tenant) -- what the catering team has
 *      them stored as in their books. Editable here for the resolved
 *      tenant only.
 *
 * The phone story:
 *   Catering teams in SA use WhatsApp for everything -- driver ETAs,
 *   last-minute changes, post-event rating prompts. But quote-request
 *   forms commonly capture a landline (corporate clients especially),
 *   so the profile shouldn't assume the existing phone is mobile-able.
 *
 *   We split mobile_number from phone_number: mobile is the WhatsApp
 *   line, phone is the landline / general fallback. A banner nudges
 *   clients with no mobile to add one. Filling the mobile field flips
 *   whatsapp_opt_in on by default; a checkbox lets them opt out.
 *
 * Email is read-only (auth side).
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Save, User as UserIcon, Mail, Phone, Smartphone,
  Image as ImageIcon, Building2, MessageCircle, Info,
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ClientNav } from "@/components/navigation/ClientNav";
import { ClientPageHeader } from "@/components/client-portal/ClientPageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FormState {
  full_name: string;
  mobile_number: string;
  phone_number: string;
  whatsapp_opt_in: boolean;
  avatar_url: string;
  client_name: string;
}

/**
 * SA mobile detector. Matches 06/07/08 prefixes (after stripping
 * non-digits and a leading +27 country code). Used to:
 *   - decide whether the existing phone_number can be promoted to
 *     mobile_number on first profile visit;
 *   - inline-validate the Mobile field as the user types.
 *
 * Numbers that look ambiguous (international, malformed) get a softer
 * "couldn't tell -- you'll still see WhatsApp prompts" treatment
 * rather than a hard rejection.
 */
function looksLikeSAMobile(input: string): boolean {
  const digits = input.replace(/[^0-9+]/g, "");
  return /^(?:\+?27|0)?[678][0-9]{8}$/.test(digits);
}

export default function ClientProfilePage() {
  const router = useRouter();
  const { user, profile, company, refreshProfile } = useAuth() as any;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    full_name: "",
    mobile_number: "",
    phone_number: "",
    whatsapp_opt_in: false,
    avatar_url: "",
    client_name: "",
  });
  const [tenantClientId, setTenantClientId] = useState<string | null>(null);

  const companyName = company?.company_name || "your portal";
  const resolvedSlug =
    (typeof router.query.company_slug === "string" && router.query.company_slug) ||
    (user as any)?.user_metadata?.last_company_slug ||
    company?.slug ||
    "";

  useEffect(() => {
    if (!user?.id || !company?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [profileRes, clientRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("full_name, phone, phone_number, mobile_number, whatsapp_opt_in, avatar_url")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("clients")
            .select("id, client_name")
            .eq("user_id", user.id)
            .eq("company_id", company.id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (cancelled) return;

        const p = (profileRes.data as any) || {};
        const c = (clientRes.data as any) || {};

        // First-visit promotion: if mobile_number is empty but the
        // existing phone_number / phone looks like a SA mobile,
        // pre-populate the mobile field. The user still has to save
        // for this to persist, but it saves them re-typing.
        const existingPhone = p.phone_number || p.phone || "";
        let mobile = p.mobile_number || "";
        let landline = p.phone_number || p.phone || "";
        if (!mobile && existingPhone && looksLikeSAMobile(existingPhone)) {
          mobile = existingPhone;
          // Clear the landline field so we don't end up showing the
          // same number twice. The user can still re-add a landline.
          landline = "";
        }

        setForm({
          full_name: p.full_name || "",
          mobile_number: mobile,
          phone_number: landline,
          whatsapp_opt_in: !!p.whatsapp_opt_in,
          avatar_url: p.avatar_url || "",
          client_name: c.client_name || "",
        });
        setTenantClientId(c.id || null);
      } catch (e: any) {
        toast({
          title: "Couldn't load your profile",
          description: e?.message || "Refresh and try again.",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, company?.id]);

  const mobileLooksValid = useMemo(
    () => form.mobile_number.length === 0 || looksLikeSAMobile(form.mobile_number),
    [form.mobile_number],
  );

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      // Mirror landline into both phone columns so legacy call sites
      // that read either keep working. mobile_number is its own.
      const landlineTrimmed = form.phone_number.trim() || null;
      const mobileTrimmed = form.mobile_number.trim() || null;
      // No mobile -> opt-in must be off, otherwise we'd flag a client
      // for WhatsApp comms with nowhere to send them. The opt-in toggle
      // is auto-set to true the first time a mobile is added (see
      // onMobileChange) so finalOptIn just mirrors whatever the user
      // last saw on the form.
      const finalOptIn = mobileTrimmed ? form.whatsapp_opt_in : false;

      const { error: profErr } = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name.trim() || null,
          phone: landlineTrimmed,
          phone_number: landlineTrimmed,
          mobile_number: mobileTrimmed,
          whatsapp_opt_in: finalOptIn,
          avatar_url: form.avatar_url.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      if (profErr) throw profErr;

      if (tenantClientId && form.client_name.trim() !== "") {
        const { error: clientErr } = await supabase
          .from("clients")
          .update({ client_name: form.client_name.trim() })
          .eq("id", tenantClientId);
        if (clientErr) throw clientErr;
      }

      toast({
        title: "Profile updated",
        description: mobileTrimmed && finalOptIn
          ? "Your details have been saved. WhatsApp updates are on."
          : "Your details have been saved.",
      });
      refreshProfile?.();
    } catch (e: any) {
      toast({
        title: "Couldn't save",
        description: e?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // When the client first types a mobile, default the WhatsApp toggle
  // on. They have to actively uncheck to opt out. Doesn't override an
  // explicit toggle they've already touched.
  const onMobileChange = (next: string) => {
    setForm((prev) => {
      const wasEmpty = prev.mobile_number.trim() === "";
      const nowFilled = next.trim() !== "";
      return {
        ...prev,
        mobile_number: next,
        whatsapp_opt_in: wasEmpty && nowFilled ? true : prev.whatsapp_opt_in,
      };
    });
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Your profile | {companyName}</title></Head>
      <ClientNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-64 xl:pl-72 pt-16 lg:pt-0">
        <ClientPageHeader
          title="Your profile"
          subtitle="Update how the catering team gets in touch with you. Email is locked to the address you signed in with."
        />

        <main className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 space-y-6">
          {loading ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center">
                <Loader2 className="w-6 h-6 mx-auto text-slate-400 animate-spin" />
                <p className="text-sm text-slate-500 mt-3">Loading your details...</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Mobile-missing banner -- the smart nudge for clients
                  who only gave a landline at quote time. */}
              {!form.mobile_number.trim() && (
                <Card className="border-0 shadow-sm bg-emerald-50 dark:bg-emerald-950/30 border-l-4 border-emerald-500">
                  <CardContent className="p-4 flex items-start gap-3">
                    <MessageCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                        Add your mobile for WhatsApp updates
                      </p>
                      <p className="text-xs text-emerald-800 dark:text-emerald-200 mt-1">
                        {companyName} uses WhatsApp for driver ETAs, last-minute changes and quick
                        confirmations on the day. Pop your mobile in below and you&apos;ll be sorted.
                        It&apos;s entirely optional -- they&apos;ll keep using email + phone if you skip it.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Identity card -- avatar preview + global name */}
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5 sm:p-6 space-y-5">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {form.avatar_url ? (
                        <img
                          src={form.avatar_url}
                          alt={form.full_name || "You"}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <UserIcon className="w-7 h-7 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                        {form.full_name || "Your details"}
                      </h2>
                      <p className="text-sm text-slate-500 truncate">
                        {user?.email || "Signed in"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field id="full_name" label="Full name" icon={UserIcon}>
                      <Input
                        id="full_name"
                        value={form.full_name}
                        onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                        placeholder="Your name"
                      />
                    </Field>
                    <Field id="email" label="Email" icon={Mail} hint="Locked -- this is the address you sign in with.">
                      <Input id="email" value={user?.email || ""} disabled />
                    </Field>
                    <Field
                      id="mobile_number"
                      label="Mobile (for WhatsApp)"
                      icon={Smartphone}
                      hint={
                        form.mobile_number && !mobileLooksValid
                          ? "That doesn't look like a SA mobile. Format: 082 123 4567 or +27 82 123 4567."
                          : "Used for WhatsApp comms -- driver ETAs, day-of changes, post-event rating."
                      }
                    >
                      <Input
                        id="mobile_number"
                        value={form.mobile_number}
                        onChange={(e) => onMobileChange(e.target.value)}
                        placeholder="082 123 4567"
                        inputMode="tel"
                        className={
                          form.mobile_number && !mobileLooksValid
                            ? "border-amber-300 focus-visible:ring-amber-500"
                            : ""
                        }
                      />
                    </Field>
                    <Field
                      id="phone_number"
                      label="Landline / other phone (optional)"
                      icon={Phone}
                      hint="A landline or other contact number. Used as a fallback if WhatsApp doesn't reach you."
                    >
                      <Input
                        id="phone_number"
                        value={form.phone_number}
                        onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                        placeholder="011 123 4567"
                        inputMode="tel"
                      />
                    </Field>
                    <Field id="avatar_url" label="Avatar URL (optional)" icon={ImageIcon}>
                      <Input
                        id="avatar_url"
                        value={form.avatar_url}
                        onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
                        placeholder="https://..."
                      />
                    </Field>
                  </div>

                  {/* WhatsApp opt-in -- shown when there's a mobile to
                      send to. Auto-on when they first add a mobile;
                      they can flip it off here. */}
                  {form.mobile_number.trim() && (
                    <div
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3"
                    >
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.whatsapp_opt_in}
                          onChange={(e) =>
                            setForm({ ...form, whatsapp_opt_in: e.target.checked })
                          }
                          className="mt-0.5 w-4 h-4"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                            <MessageCircle className="w-4 h-4 text-emerald-600" />
                            Send me WhatsApp updates from {companyName}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            Driver ETA on the day, last-minute changes, a one-tap rating prompt
                            after the event. No marketing -- just operational stuff. Untick to opt
                            out; you can change this any time.
                          </p>
                        </div>
                      </label>
                    </div>
                  )}

                  {/* Mobile present but opt-in off -- gentle nudge */}
                  {form.mobile_number.trim() && !form.whatsapp_opt_in && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-start gap-2">
                      <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-900 dark:text-amber-100">
                        WhatsApp updates are off. {companyName} will reach you on email + phone
                        instead. Tick the box above if you&apos;d rather get faster updates by WhatsApp.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {tenantClientId && (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-5 sm:p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-emerald-600" />
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                        How {companyName} addresses you
                      </h3>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      This is the name the catering team has on their books for you. Changing it
                      here only affects this catering company -- not anyone else you might be a
                      client of.
                    </p>
                    <Field id="client_name" label={`Name on ${companyName}'s books`} icon={UserIcon}>
                      <Input
                        id="client_name"
                        value={form.client_name}
                        onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                        placeholder="What the team should call you"
                      />
                    </Field>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push(resolvedSlug ? `/${resolvedSlug}/client-portal/dashboard` : "/client-portal/dashboard")}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={save} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save changes
                </Button>
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}

function Field({
  id, label, icon: Icon, hint, children,
}: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}
