/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /client-portal/profile - the client edits their own contact details.
 *
 * Two layers of identity at play:
 *   1. profiles.full_name / mobile_number / phone_number / whatsapp_opt_in /
 *      avatar_url - the global identity that follows them into every
 *      catering tenant they're a client of. RLS users_update_own_profile
 *      lets them edit their own row directly; no service role needed.
 *   2. clients.client_name (per-tenant) - what the catering team has
 *      them stored as in their books. Editable here for the resolved
 *      tenant only.
 *
 * The phone story:
 *   Catering teams in SA use WhatsApp for everything - driver ETAs,
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
import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Save, User as UserIcon, Mail, Phone, Smartphone,
  Building2, MessageCircle, Info, Camera, Trash2,
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ClientNav } from "@/components/navigation/ClientNav";
import { PortalShell, PortalHeader, PortalCard } from "@/components/portal/ui";
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
 * "couldn't tell - you'll still see WhatsApp prompts" treatment
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
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

        // WhatsApp opt-in default: when there's a mobile and the
        // profile has never explicitly stored a value, treat it as
        // opted-in. This is operational comms (ETAs, day-of changes,
        // rating prompts), not marketing. If the user has actively
        // opted out (false stored), respect it.
        const optInStored = p.whatsapp_opt_in;
        const optInDefault = !!mobile && optInStored !== false;

        setForm({
          full_name: p.full_name || "",
          mobile_number: mobile,
          phone_number: landline,
          whatsapp_opt_in: optInDefault,
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

  /**
   * Avatar upload to the public `avatars` bucket. Path layout enforced
   * by RLS is `{user_id}/...`; we add a timestamp so the previous avatar
   * doesn't get cached as the new one (Supabase + browser CDNs both
   * key off the URL). The new public URL writes straight onto
   * profiles.avatar_url - no separate Save click needed for the
   * avatar to stick.
   *
   * Validates: image type only, max 3MB. Anything else and we toast.
   */
  const onAvatarPicked = async (file: File | null) => {
    if (!file || !user?.id) return;
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Pick an image file",
        description: "PNG, JPG, GIF, WebP - not a document.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast({
        title: "Image is too big",
        description: "Keep it under 3 MB. A profile photo doesn't need to be high-res.",
        variant: "destructive",
      });
      return;
    }
    setUploadingAvatar(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) throw new Error("Could not resolve uploaded image URL");

      // Persist immediately so the avatar doesn't depend on the Save
      // button. The cast mirrors the same TS-types-out-of-date issue as
      // in save() above.
      const { error: persistErr } = await (supabase as any)
        .from("profiles")
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (persistErr) throw persistErr;

      setForm((prev) => ({ ...prev, avatar_url: publicUrl }));
      refreshProfile?.();
      toast({ title: "Photo updated" });
    } catch (e: any) {
      toast({
        title: "Couldn't upload photo",
        description: e?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onAvatarRemoved = async () => {
    if (!user?.id) return;
    setUploadingAvatar(true);
    try {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ avatar_url: null, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;
      setForm((prev) => ({ ...prev, avatar_url: "" }));
      refreshProfile?.();
      toast({ title: "Photo removed" });
    } catch (e: any) {
      toast({
        title: "Couldn't remove photo",
        description: e?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

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

      // Cast through `any` because the generated Supabase types for
      // profiles haven't been regenerated since mobile_number /
      // whatsapp_opt_in landed - TS narrows the update payload to
      // `never` until that's done. Functionally fine; the columns
      // exist server-side and RLS gates writes to id = auth.uid().
      const profileUpdate = {
        full_name: form.full_name.trim() || null,
        phone: landlineTrimmed,
        phone_number: landlineTrimmed,
        mobile_number: mobileTrimmed,
        whatsapp_opt_in: finalOptIn,
        avatar_url: form.avatar_url.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error: profErr } = await (supabase as any)
        .from("profiles")
        .update(profileUpdate)
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

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Your profile"
            subtitle="Update how the catering team gets in touch with you. Email is locked to the address you signed in with."
            icon={UserIcon}
          />

          {loading ? (
            // Skeleton in the shape of the form: an identity card block
            // plus a couple of field rows, so the layout doesn't jump
            // when the real data lands.
            <div className="space-y-6" aria-busy="true" aria-label="Loading your details">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    <div className="h-3 w-56 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    <div className="h-8 w-32 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="h-3 w-24 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                      <div className="h-10 w-full rounded-md bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Mobile-missing banner - the smart nudge for clients
                  who only gave a landline at quote time. */}
              {!form.mobile_number.trim() && (
                <PortalCard padded={false} className="bg-brand-primary/5 dark:bg-brand-primary/10 border-l-4 border-brand-primary">
                  <div className="p-4 flex items-start gap-3">
                    <MessageCircle className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-primary">
                        Add your mobile for WhatsApp updates
                      </p>
                      <p className="text-xs text-slate-700 dark:text-slate-300 mt-1">
                        {companyName} uses WhatsApp for driver ETAs, last-minute changes and quick
                        confirmations on the day. Pop your mobile in below and you&apos;ll be sorted.
                        It&apos;s entirely optional - they&apos;ll keep using email + phone if you skip it.
                      </p>
                    </div>
                  </div>
                </PortalCard>
              )}

              {/* Identity card - avatar preview + global name */}
              <PortalCard padded={false}>
                <div className="p-5 sm:p-6 space-y-5">
                  <div className="flex items-center gap-4">
                    {/* Avatar with upload affordance. Click the photo
                        (or the Change button) to pick a new image; it
                        uploads + persists immediately so a refresh
                        doesn't lose it. */}
                    <div className="relative flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border-2 border-transparent hover:border-slate-300 dark:hover:border-slate-600 transition group relative"
                        aria-label="Upload profile photo"
                      >
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
                          <UserIcon className="w-8 h-8 text-slate-400" />
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                          {uploadingAvatar ? (
                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                          ) : (
                            <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                        className="hidden"
                        onChange={(e) => onAvatarPicked(e.target.files?.[0] || null)}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                        {form.full_name || "Your details"}
                      </h2>
                      <p className="text-sm text-slate-500 truncate">
                        {user?.email || "Signed in"}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingAvatar}
                          className="gap-1.5"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          {form.avatar_url ? "Change photo" : "Add photo"}
                        </Button>
                        {form.avatar_url && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onAvatarRemoved}
                            disabled={uploadingAvatar}
                            className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </Button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1.5">
                        PNG, JPG, GIF or WebP. Max 3 MB.
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
                    <Field id="email" label="Email" icon={Mail} hint="Locked - this is the address you sign in with.">
                      <Input id="email" value={user?.email || ""} disabled />
                    </Field>
                    <Field
                      id="mobile_number"
                      label="Mobile (for WhatsApp)"
                      icon={Smartphone}
                      hint={
                        form.mobile_number && !mobileLooksValid
                          ? "That doesn't look like a SA mobile. Format: 082 123 4567 or +27 82 123 4567."
                          : "Used for WhatsApp comms - driver ETAs, day-of changes, post-event rating."
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
                  </div>

                  {/* WhatsApp opt-in - shown when there's a mobile to
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
                            <MessageCircle className="w-4 h-4 text-brand-primary" />
                            Send me WhatsApp updates from {companyName}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            Driver ETA on the day, last-minute changes, a one-tap rating prompt
                            after the event. No marketing - just operational stuff. Untick to opt
                            out; you can change this any time.
                          </p>
                        </div>
                      </label>
                    </div>
                  )}

                  {/* Mobile present but opt-in off - gentle nudge */}
                  {form.mobile_number.trim() && !form.whatsapp_opt_in && (
                    <div className="rounded-md border border-brand-primary/20 bg-brand-primary/5 dark:bg-brand-primary/10 p-3 flex items-start gap-2">
                      <Info className="w-4 h-4 text-brand-primary flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-700 dark:text-slate-300">
                        WhatsApp updates are off. {companyName} will reach you on email + phone
                        instead. Tick the box above if you&apos;d rather get faster updates by WhatsApp.
                      </p>
                    </div>
                  )}
                </div>
              </PortalCard>

              {tenantClientId && (
                <PortalCard padded={false}>
                  <div className="p-5 sm:p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-brand-primary" />
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                        How {companyName} addresses you
                      </h3>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      This is the name the catering team has on their books for you. Changing it
                      here only affects this catering company - not anyone else you might be a
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
                  </div>
                </PortalCard>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push(resolvedSlug ? `/${resolvedSlug}/client-portal/dashboard` : "/client-portal/dashboard")}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={save} disabled={saving} className="gap-2 bg-brand-primary hover:opacity-90 text-white">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save changes
                </Button>
              </div>
            </div>
          )}
        </PortalShell>
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
