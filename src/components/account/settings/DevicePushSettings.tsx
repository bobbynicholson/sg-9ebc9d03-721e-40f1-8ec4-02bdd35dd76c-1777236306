import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, BellRing, CheckCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { isInstalledApp, isIosDevice } from "@/lib/pwa/environment";
import { pwaInstallUrl } from "@/lib/pwa/metadata";
import { announceDevicePushChange, applicationServerKey, subscriptionUsesApplicationServerKey } from "@/lib/pwa/pushSubscription";

type DevicePushStatus = "checking" | "needs-install" | "not-configured" | "unsupported" | "blocked" | "ready" | "subscribed" | "error";

interface Props {
  userId: string;
  activeRole: string;
  companyName?: string | null;
  companySlug?: string | null;
}

async function saveSubscription(activeRole: string, subscription: PushSubscription): Promise<void> {
  const response = await fetch("/api/pwa/push-subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ ...subscription.toJSON(), activeRole }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "This device could not be added to push notifications.");
  }
}

async function removeSubscription(endpoint: string): Promise<void> {
  const response = await fetch("/api/pwa/push-subscription", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "The old device subscription could not be removed.");
  }
}

export function DevicePushSettings({ userId, activeRole, companyName, companySlug }: Props) {
  const { toast } = useToast();
  const [status, setStatus] = useState<DevicePushStatus>("checking");
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const canManageCompanyPreferences = ["super_admin", "owner", "company_admin", "admin"].includes(activeRole.toLowerCase());
  const preferenceSettingsHref = `${companySlug ? `/${companySlug}` : ""}/admin/notification-settings`;

  const refresh = useCallback(async () => {
    const onIos = isIosDevice();
    const inInstalledApp = isInstalledApp();
    setIos(onIos);
    setInstalled(inInstalledApp);
    setError(null);

    if (onIos && !inInstalledApp) {
      setStatus("needs-install");
      return;
    }
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }

    try {
      const configResponse = await fetch("/api/pwa/push-subscription", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!configResponse.ok) throw new Error("Push notification setup could not be checked.");
      const config = await configResponse.json();
      if (!config?.enabled || !config?.publicKey) {
        setPublicKey(null);
        setStatus("not-configured");
        return;
      }
      setPublicKey(config.publicKey);
      const currentPermission = window.Notification.permission;
      if (currentPermission === "denied") {
        setStatus("blocked");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      registrationRef.current = registration;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription || !subscriptionUsesApplicationServerKey(subscription, config.publicKey)) {
        setStatus("ready");
        return;
      }

      await saveSubscription(activeRole, subscription);
      setStatus("subscribed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Push notification setup could not be checked.");
      setStatus("error");
    }
  }, [activeRole]);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, userId]);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const onIos = isIosDevice();
      const inInstalledApp = isInstalledApp();
      if (onIos && !inInstalledApp) {
        setIos(true);
        setInstalled(false);
        setStatus("needs-install");
        return;
      }
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }

      // Ask directly from this button tap. Browsers, especially iOS, reject
      // notification prompts that are triggered automatically on page load.
      const nextPermission = window.Notification.permission === "granted"
        ? "granted"
        : await window.Notification.requestPermission();
      if (nextPermission !== "granted") {
        setStatus(nextPermission === "denied" ? "blocked" : "ready");
        return;
      }

      let key = publicKey;
      if (!key) {
        const configResponse = await fetch("/api/pwa/push-subscription", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const config = configResponse.ok ? await configResponse.json() : null;
        if (!config?.enabled || !config?.publicKey) {
          setStatus("not-configured");
          return;
        }
        key = config.publicKey;
        setPublicKey(key);
      }

      const registration = registrationRef.current || await navigator.serviceWorker.ready;
      registrationRef.current = registration;
      let subscription = await registration.pushManager.getSubscription();
      let oldEndpoint: string | null = null;
      if (subscription && !subscriptionUsesApplicationServerKey(subscription, key)) {
        oldEndpoint = subscription.endpoint;
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(key) as unknown as BufferSource,
        });
      }
      if (oldEndpoint) await removeSubscription(oldEndpoint);
      await saveSubscription(activeRole, subscription);
      announceDevicePushChange();
      setStatus("subscribed");
      toast({ title: "Push alerts enabled", description: "This device can now receive alerts in the background." });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Push alerts could not be enabled. Try again.";
      setError(message);
      setStatus("error");
      toast({ title: "Push alerts could not be enabled", description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = registrationRef.current || await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removeSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      announceDevicePushChange();
      setStatus("ready");
      toast({ title: "Push alerts turned off", description: "This device will no longer receive background alerts." });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Push alerts could not be turned off. Try again.";
      setError(message);
      setStatus("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BellRing className="h-5 w-5 text-brand-primary" />Push alerts on this device</CardTitle>
        <CardDescription>Tap Enable alerts, then allow the browser prompt. This controls background alerts on this device only.</CardDescription>
      </CardHeader>
      <CardContent>
        {status === "checking" && <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Checking this device…</p>}

        {status === "needs-install" && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-sm leading-6 text-slate-600">For iPhone and iPad alerts, install {companyName || "this app"} on the Home Screen, open it from that icon, then return here. Requires iOS or iPadOS 16.4 or later.</p>
            <Button asChild className="min-h-11 shrink-0"><Link href={pwaInstallUrl(companySlug)}>Install app</Link></Button>
          </div>
        )}

        {status === "not-configured" && <p role="status" className="text-sm leading-6 text-amber-800">Push alerts are not configured on the server yet. An administrator must add the VAPID public and private keys in Vercel and redeploy.</p>}

        {status === "unsupported" && (
          <div role="status" className="flex items-start gap-2 text-sm leading-6 text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{ios ? "Update this iPhone or iPad to iOS/iPadOS 16.4 or later, install the app on the Home Screen, and open it from its icon." : "This browser does not support web push. Update your browser or open the app in the latest version of Chrome."}</p>
          </div>
        )}

        {status === "blocked" && (
          <div role="status" className="flex items-start gap-2 text-sm leading-6 text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{ios ? `Alerts are blocked for this Home Screen app. Allow notifications for ${companyName || "the app"} in iPhone/iPad Settings, then return here.` : "Alerts are blocked for this site in your browser or device settings. Allow notifications for this site, then return here."}</p>
          </div>
        )}

        {status === "ready" && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-slate-600">{ios && installed ? "Tap Enable and allow the iPhone or iPad notification prompt." : "Tap Enable and allow the browser prompt. Android does not need the app installed, though the installed app works too."}</p>
            <Button type="button" onClick={() => void enable()} disabled={busy} className="min-h-11 shrink-0">
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enabling…</> : "Enable alerts"}
            </Button>
          </div>
        )}

        {status === "subscribed" && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-800"><CheckCircle className="h-4 w-4 shrink-0" />Alerts are enabled on this device.</p>
            <Button type="button" variant="outline" onClick={() => void disable()} disabled={busy} className="min-h-11 shrink-0">
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Turn off alerts"}
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p role="alert" className="text-sm leading-6 text-rose-700">{error || "Could not check push alerts for this device."}</p>
            <Button type="button" variant="outline" onClick={() => void refresh()} className="min-h-11 shrink-0"><RefreshCw className="mr-2 h-4 w-4" />Check again</Button>
          </div>
        )}

        {status !== "checking" && status !== "error" && error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}

        {canManageCompanyPreferences && (
          <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
            <p className="text-xs leading-relaxed text-slate-500">Choose which event types can send alerts from Notification settings. That choice is separate from allowing push on this device.</p>
            <Button asChild variant="outline" size="sm" className="mt-2 min-h-10">
              <Link href={preferenceSettingsHref}>Choose alert types</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
