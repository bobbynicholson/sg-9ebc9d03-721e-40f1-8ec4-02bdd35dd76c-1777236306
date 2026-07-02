import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PortalCard, PortalCardHeader } from "@/components/portal/ui";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { AlertTriangle, Loader2, RefreshCcw, Save, Shield } from "lucide-react";
import type { PrivacySettings } from "./types";
import { ACCOUNT_PRIVACY_JSON_KEY, PRIVACY_DEFAULTS } from "./types";

interface Props {
  userId: string;
}

/**
 * Privacy tab for /account/settings. Self-contained: loads the caller's
 * privacy settings from profiles.notification_preferences (jsonb) under
 * the ACCOUNT_PRIVACY_JSON_KEY namespace and writes them back on save,
 * preserving any sibling keys other features store in the same column.
 *
 * Previously these saved to localStorage only, so settings silently
 * differed per device. Now they follow the account.
 */
export function PrivacyTab({ userId }: Props) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<PrivacySettings>(PRIVACY_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("notification_preferences")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;

      const jsonb = (data?.notification_preferences ?? {}) as Record<string, unknown>;
      const saved = jsonb[ACCOUNT_PRIVACY_JSON_KEY];
      if (saved && typeof saved === "object") {
        // Merge over defaults so newly added fields keep their default
        // instead of reading as undefined on older rows.
        setSettings({ ...PRIVACY_DEFAULTS, ...(saved as Partial<PrivacySettings>) });
      } else {
        setSettings(PRIVACY_DEFAULTS);
      }
    } catch (err: unknown) {
      console.error("[PrivacyTab] load failed:", err);
      setLoadError(dbErrorMessage(err, { entity: "privacy settings" }));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Re-read the jsonb right before writing so we merge with the
      // latest sibling keys instead of a stale copy from mount.
      const { data, error: readErr } = await supabase
        .from("profiles")
        .select("notification_preferences")
        .eq("id", userId)
        .maybeSingle();
      if (readErr) throw readErr;

      const existing = (data?.notification_preferences ?? {}) as Record<string, unknown>;
      const next = { ...existing, [ACCOUNT_PRIVACY_JSON_KEY]: settings };

      const { error } = await supabase
        .from("profiles")
        .update({ notification_preferences: next as never })
        .eq("id", userId);
      if (error) throw error;

      toast({
        title: "Privacy settings saved",
        description: "These settings now apply across all your devices.",
      });
    } catch (err: unknown) {
      console.error("[PrivacyTab] save failed:", err);
      toast({
        title: "Could not save privacy settings",
        description: dbErrorMessage(err, { entity: "privacy settings" }),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PortalCard className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your privacy settings...
        </div>
      </PortalCard>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/60 dark:bg-rose-950/40">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-900/60 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
              Could not load your privacy settings
            </p>
            <p className="mt-1 text-sm text-rose-700 dark:text-rose-300/90">{loadError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 border-rose-300 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/40"
              onClick={() => load()}
            >
              <RefreshCcw className="mr-2 h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PortalCard>
      <PortalCardHeader
        title={
          <span className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-brand-primary" />
            Privacy settings
          </span>
        }
      />
      <p className="-mt-2 mb-5 text-sm text-slate-500 dark:text-slate-400">
        Control who can see your details. These apply across all your devices.
      </p>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="privacy-visibility" className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Profile visibility
          </Label>
          <Select
            value={settings.profile_visibility}
            onValueChange={(value: "public" | "private" | "team") =>
              setSettings((prev) => ({ ...prev, profile_visibility: value }))
            }
          >
            <SelectTrigger id="privacy-visibility" className="min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public - visible to everyone</SelectItem>
              <SelectItem value="team">Team - visible to team members only</SelectItem>
              <SelectItem value="private">Private - only visible to you</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200/90 dark:divide-slate-800 dark:border-slate-800">
          <div className="flex min-h-[56px] items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <Label
                htmlFor="privacy-show-email"
                className="cursor-pointer text-sm font-medium text-slate-900 dark:text-slate-100"
              >
                Show email address
              </Label>
              <p className="text-xs text-slate-500 dark:text-slate-400">Display your email on your profile</p>
            </div>
            <Switch
              id="privacy-show-email"
              checked={settings.show_email}
              onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, show_email: checked }))}
            />
          </div>

          <div className="flex min-h-[56px] items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <Label
                htmlFor="privacy-show-phone"
                className="cursor-pointer text-sm font-medium text-slate-900 dark:text-slate-100"
              >
                Show phone number
              </Label>
              <p className="text-xs text-slate-500 dark:text-slate-400">Display your phone number on your profile</p>
            </div>
            <Switch
              id="privacy-show-phone"
              checked={settings.show_phone}
              onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, show_phone: checked }))}
            />
          </div>

          <div className="flex min-h-[56px] items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <Label
                htmlFor="privacy-analytics"
                className="cursor-pointer text-sm font-medium text-slate-900 dark:text-slate-100"
              >
                Allow analytics
              </Label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Help us improve by sharing anonymous usage data
              </p>
            </div>
            <Switch
              id="privacy-analytics"
              checked={settings.allow_analytics}
              onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, allow_analytics: checked }))}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end border-t border-slate-200 pt-4 dark:border-slate-800">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="min-h-[44px] bg-brand-primary text-white hover:bg-brand-primary/90"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save privacy settings
            </>
          )}
        </Button>
      </div>
    </PortalCard>
  );
}
