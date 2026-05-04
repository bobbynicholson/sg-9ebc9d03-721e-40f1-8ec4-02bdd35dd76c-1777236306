/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /client-portal/profile -- the client edits their own contact details.
 *
 * Two layers of identity at play:
 *   1. profiles.full_name / phone / avatar_url -- the global identity
 *      that follows them into every catering tenant they're a client of.
 *      The RLS users_update_own_profile policy lets them edit their own
 *      row; we use it directly without a service role.
 *   2. clients.client_name (per-tenant) -- what the catering team has
 *      them stored as in their books. Editable here for the resolved
 *      tenant only -- changing it on Spit Braai's books doesn't change
 *      it on any other catering tenant they're a client of.
 *
 * Email is read-only (auth.users.email is the source of truth -- they
 * change it via /client-portal/settings if we expose it later).
 */
import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, User as UserIcon, Mail, Phone, Image as ImageIcon, Building2 } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ClientNav } from "@/components/navigation/ClientNav";
import { ClientPageHeader } from "@/components/client-portal/ClientPageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FormState {
  full_name: string;
  phone: string;
  avatar_url: string;
  client_name: string;
}

export default function ClientProfilePage() {
  const router = useRouter();
  const { user, profile, company, refreshProfile } = useAuth() as any;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    full_name: "",
    phone: "",
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
        // Pull the global profile row + the per-tenant client row in
        // parallel. The clients row may not exist (rare, but possible
        // if the user signed up before the catering team added them).
        const [profileRes, clientRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("full_name, phone, phone_number, avatar_url")
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
        setForm({
          full_name: p.full_name || "",
          phone: p.phone_number || p.phone || "",
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

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      // Profile update -- RLS users_update_own_profile gates this to
      // id = auth.uid(). Both phone columns get written so any existing
      // call sites that read either keep working.
      const { error: profErr } = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name.trim() || null,
          phone: form.phone.trim() || null,
          phone_number: form.phone.trim() || null,
          avatar_url: form.avatar_url.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      if (profErr) throw profErr;

      // Tenant-scoped clients.client_name -- only when there's an
      // existing row. We don't auto-create one here; that's the
      // caterer's job (or the auto-provision flow). Updating it here
      // changes how this tenant addresses the client without touching
      // any other tenant they belong to.
      if (tenantClientId && form.client_name.trim() !== "") {
        const { error: clientErr } = await supabase
          .from("clients")
          .update({ client_name: form.client_name.trim() })
          .eq("id", tenantClientId);
        if (clientErr) throw clientErr;
      }

      toast({
        title: "Profile updated",
        description: "Your details have been saved.",
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

        <main className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 max-w-3xl mx-auto space-y-6">
          {loading ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center">
                <Loader2 className="w-6 h-6 mx-auto text-slate-400 animate-spin" />
                <p className="text-sm text-slate-500 mt-3">Loading your details...</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Identity card -- avatar preview + global name + phone */}
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
                    <Field id="phone" label="Phone" icon={Phone} hint="So the team can reach you on the day if anything's up.">
                      <Input
                        id="phone"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="+27 ..."
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
                </CardContent>
              </Card>

              {/* Per-tenant card -- only render when this user has a
                  clients row under the resolved tenant. Hides the
                  card for users who haven't been booked yet. */}
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
