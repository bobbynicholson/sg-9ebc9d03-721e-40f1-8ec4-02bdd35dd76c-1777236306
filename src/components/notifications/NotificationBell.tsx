import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { Bell, BellRing, Check, X, Clock, AlertCircle, CheckCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { notificationService, Notification } from "@/services/notificationService";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { effectivePriority } from "@/lib/notificationDisplay";
import { useTenantHref } from "@/lib/tenantUrl";
import { updatePwaAppBadge } from "@/lib/pwa/appBadge";
import { pwaIconUrl } from "@/lib/pwa/metadata";
import { notificationDestination, notificationInboxPathForRole } from "@/lib/notificationLinks";

type SoundTier = "urgent" | "high" | "default";
type DeviceNotificationPermission = NotificationPermission | "unsupported";
type DevicePushStatus = "checking" | "ready" | "subscribed" | "unsupported" | "unconfigured";

function applicationServerKey(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const raw = window.atob(padded);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

const subscriptionSyncs = new Map<string, Promise<boolean>>();
function saveDeviceSubscription(userId: string, activeRole: string, subscription: PushSubscription): Promise<boolean> {
  const key = `${userId}:${subscription.endpoint}`;
  const previous = subscriptionSyncs.get(key) || Promise.resolve(true);
  const request = previous.catch(() => false).then(() => fetch("/api/pwa/push-subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ ...subscription.toJSON(), activeRole }),
  })).then(response => response.ok).catch(() => false)
    .finally(() => {
      if (subscriptionSyncs.get(key) === request) subscriptionSyncs.delete(key);
    });
  subscriptionSyncs.set(key, request);
  return request;
}

// Browsers block audio started for the first time by a background realtime
// event. Keep one AudioContext and unlock it on the operator's first click,
// tap, or key press. The old fallback created a brand-new locked context only
// after the notification arrived, so both the WAV and its fallback could be
// silent even though the notification badge updated correctly.
let sharedAudioContext: AudioContext | null = null;
let audioUnlockPromise: Promise<void> | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = (window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  }).AudioContext || (window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new Ctx();
  }
  return sharedAudioContext;
}

/** Fallback chime, synthesised with WebAudio so it works even if an audio
 * asset fails to load. Varies by tier so the fallback still signals urgency:
 * urgent = 3 insistent beeps, high = bright double-ding, else = soft
 * descending two-note. */
function chime(tier: "urgent" | "high" | "default" = "default") {
  try {
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== "running") return;
    const beep = (freq: number, at: number, len: number, vol: number, type: OscillatorType = "sine") => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + len);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + len + 0.02);
    };
    if (tier === "urgent") {
      beep(988, 0.0, 0.12, 0.06, "square");
      beep(988, 0.17, 0.12, 0.06, "square");
      beep(988, 0.34, 0.16, 0.07, "square");
    } else if (tier === "high") {
      beep(1047, 0.0, 0.16, 0.05);
      beep(1568, 0.09, 0.22, 0.055);
    } else {
      beep(880, 0.0, 0.2, 0.05);
      beep(1319, 0.1, 0.22, 0.05);
    }
  } catch {
    // Best-effort - silent failure is fine.
  }
}

// Raj 2026-07-05: staff wanted to HEAR notifications land, not just see
// the badge - and a DIFFERENT sound per urgency so they can tell an urgent
// one apart without looking. Play a real chime asset for every new
// notification; fall back to the synthesised tone if the file can't load
// or autoplay is blocked. Each <audio> is cached + rewound so rapid
// notifications each ring.
//   urgent -> urgent.wav (insistent triple beep)
//   high   -> high.wav   (brighter double-ding)
//   else   -> notification.wav (soft two-note bell)
const SOUND_SRC: Record<string, string> = {
  urgent: "/sounds/urgent.wav",
  high: "/sounds/high.wav",
  default: "/sounds/notification.wav",
};
const soundCache: Record<string, HTMLAudioElement> = {};
function soundTier(priority?: string | null): SoundTier {
  return priority === "urgent" ? "urgent" : priority === "high" ? "high" : "default";
}
function getSound(tier: SoundTier): HTMLAudioElement {
  let audio = soundCache[tier];
  if (!audio) {
    audio = new Audio(SOUND_SRC[tier]);
    audio.volume = tier === "urgent" ? 0.6 : 0.45;
    audio.preload = "auto";
    soundCache[tier] = audio;
  }
  return audio;
}

/**
 * Unlock both playback engines during a real user gesture. All three WAVs
 * are started silently in the same gesture because Safari can scope media
 * permission to the individual audio element rather than the whole origin.
 */
function unlockNotificationSound(): Promise<void> {
  if (audioUnlockPromise) return audioUnlockPromise;
  audioUnlockPromise = (async () => {
    const ctx = getAudioContext();
    if (ctx?.state === "suspended") await ctx.resume();

    const attempts = (Object.keys(SOUND_SRC) as SoundTier[]).map(async (tier) => {
      const audio = getSound(tier);
      const volume = audio.volume;
      audio.volume = 0;
      try {
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
      } finally {
        audio.volume = volume;
      }
    });
    const results = await Promise.allSettled(attempts);
    const mediaUnlocked = results.some((result) => result.status === "fulfilled");
    if (ctx?.state !== "running" && !mediaUnlocked) {
      throw new Error("Browser audio is still locked");
    }
  })().catch(() => {
    // A later gesture can retry if the browser rejected this one.
    audioUnlockPromise = null;
  });
  return audioUnlockPromise;
}

function playNotifSound(priority?: string | null) {
  const tier = soundTier(priority);
  try {
    if (typeof window === "undefined") return;
    const audio = getSound(tier);
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof (p as any).catch === "function") (p as Promise<void>).catch(() => chime(tier));
  } catch {
    chime(tier);
  }
}

// Module-level guard shared across every mounted NotificationBell. The
// responsive layout (PortalSidebar) mounts the bell up to THREE times
// (desktop / collapsed / mobile slots); each instance independently
// subscribes to realtime and would fire its own toast + chime for the
// same row, so one notification looked like it arrived two or three
// times. First instance to see an id toasts and records it here; the
// others skip. Short TTL so a genuinely re-sent id can alert again later.
const recentlyToasted = new Map<string, number>();
function claimToast(id: string): boolean {
  const now = Date.now();
  for (const [k, t] of recentlyToasted) if (now - t > 30000) recentlyToasted.delete(k);
  if (recentlyToasted.has(id)) return false;
  recentlyToasted.set(id, now);
  return true;
}

// Optional browser-level alert for an already-granted notification
// permission. We deliberately do not request permission from a background
// realtime callback; the user must opt in from the browser/PWA settings.
// Persisted notifications and the in-app bell remain the source of truth when
// permission is unavailable or the tab has been fully terminated.
async function showBackgroundNotification(notification: Notification, href: string, icon: string) {
  if (typeof window === "undefined" || document.visibilityState === "visible") return;
  if (!("Notification" in window) || window.Notification.permission !== "granted") return;

  const title = notification.title || "New CateringMS message";
  const options = {
    body: notification.message || "You have a new notification.",
    tag: `cateringms-${notification.id}`,
    icon,
    badge: icon,
    silent: false,
    data: { url: href, notificationId: notification.id },
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration?.showNotification) {
      await registration.showNotification(title, options);
    } else {
      const popup = new window.Notification(title, options);
      popup.onclick = () => {
        window.focus();
        window.location.assign(href);
      };
    }
  } catch {
    // Browser notification support is best-effort; the bell still updates.
  }
}

export function NotificationBell() {
  const router = useRouter();
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const { user, activeRole, company, profile, isStaffPreview } = useAuth() as any;
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [pwaUnreadCount, setPwaUnreadCount] = useState(0);
  const [deviceNotificationPermission, setDeviceNotificationPermission] =
    useState<DeviceNotificationPermission>("unsupported");
  const [devicePushStatus, setDevicePushStatus] = useState<DevicePushStatus>("checking");
  const [devicePushBusy, setDevicePushBusy] = useState(false);
  const readStateRef = useRef(new Map<string, boolean>());
  const devicePushStatusRef = useRef<DevicePushStatus>("checking");
  const badgeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationLoadRequestRef = useRef(0);
  const companyId =
    company?.id ||
    profile?.company_id ||
    (user as any)?.company_id ||
    (user as any)?.user_metadata?.company_id ||
    null;
  const notificationIcon = pwaIconUrl(company?.slug ? {
    id: company.id,
    slug: company.slug,
    companyName: company.company_name,
    logoUrl: company.logo_url,
    primaryColor: company.primary_color,
  } : null, 192);

  useEffect(() => {
    const syncPermission = () => {
      if (!("Notification" in window)) {
        setDeviceNotificationPermission("unsupported");
        return;
      }
      setDeviceNotificationPermission(window.Notification.permission);
    };

    syncPermission();
    window.addEventListener("focus", syncPermission);
    document.addEventListener("visibilitychange", syncPermission);
    return () => {
      window.removeEventListener("focus", syncPermission);
      document.removeEventListener("visibilitychange", syncPermission);
    };
  }, []);

  useEffect(() => {
    devicePushStatusRef.current = devicePushStatus;
  }, [devicePushStatus]);

  useEffect(() => {
    let cancelled = false;
    const syncPushStatus = async () => {
      if (!user?.id || isStaffPreview) {
        setDevicePushStatus("checking");
        return;
      }
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setDevicePushStatus("unsupported");
        return;
      }

      try {
        const configResponse = await fetch("/api/pwa/push-subscription", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const config = configResponse.ok ? await configResponse.json() : null;
        if (cancelled) return;
        if (!config?.enabled || !config?.publicKey) {
          setDevicePushStatus("unconfigured");
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (cancelled) return;
        if (!subscription) {
          setDevicePushStatus("ready");
          return;
        }

        const role = String(activeRole || profile?.active_role || profile?.role || user?.role || "client");
        const saved = await saveDeviceSubscription(user.id, role, subscription);
        if (!cancelled) setDevicePushStatus(saved ? "subscribed" : "ready");
      } catch {
        if (!cancelled) setDevicePushStatus("ready");
      }
    };

    void syncPushStatus();
    const refresh = () => {
      if (document.visibilityState === "visible") void syncPushStatus();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [user?.id, activeRole, isStaffPreview]);

  const enableDeviceNotifications = async () => {
    if (isStaffPreview) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window) || !user?.id) {
      setDevicePushStatus("unsupported");
      setDeviceNotificationPermission("unsupported");
      return;
    }

    setDevicePushBusy(true);
    try {
      // Safari on iOS requires this permission prompt to be opened directly
      // from the user's tap, before any network request yields the gesture.
      const permission = window.Notification.permission === "granted"
        ? "granted"
        : await window.Notification.requestPermission();
      setDeviceNotificationPermission(permission);
      if (permission !== "granted") {
        if (permission === "denied") {
          toast({
            title: "Device notifications are blocked",
            description: "Allow notifications in your browser or installed-app settings.",
            variant: "destructive",
          });
        }
        return;
      }

      const configResponse = await fetch("/api/pwa/push-subscription", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const config = configResponse.ok ? await configResponse.json() : null;
      if (!config?.enabled || !config?.publicKey) {
        setDevicePushStatus("unconfigured");
        toast({
          title: "Device alerts are unavailable",
          description: "Push notifications are not configured for this app yet.",
          variant: "destructive",
        });
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(config.publicKey) as unknown as BufferSource,
        });
      }
      const role = String(activeRole || profile?.active_role || profile?.role || user?.role || "client");
      if (!(await saveDeviceSubscription(user.id, role, subscription))) {
        throw new Error("The device subscription could not be saved");
      }

      setDevicePushStatus("subscribed");
      // Permission also unlocks numeric app badges on supported iOS devices.
      await updatePwaAppBadge(pwaUnreadCount);
      toast({
        title: "Push alerts enabled",
        description: "New alerts can reach this device in the background. Tap one to open its linked page.",
      });
    } catch (error) {
      setDevicePushStatus("ready");
      toast({
        title: "Could not enable device notifications",
        description: error instanceof Error ? error.message : "Please try again from the installed app.",
        variant: "destructive",
      });
    } finally {
      setDevicePushBusy(false);
    }
  };

  const disableDeviceNotifications = async () => {
    if (!("serviceWorker" in navigator) || !user?.id) return;
    setDevicePushBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/pwa/push-subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("The device could not be removed from push notifications");
        await subscription.unsubscribe();
      }
      setDevicePushStatus("ready");
      toast({ title: "Push alerts turned off on this device" });
    } catch (error) {
      toast({
        title: "Could not turn off device alerts",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setDevicePushBusy(false);
    }
  };

  const refreshUnreadCount = async () => {
    if (!user?.id) return;
    const count = await notificationService.getUnreadCount(user.id, activeRole, companyId);
    setPwaUnreadCount(count);
  };

  const queueUnreadCountRefresh = () => {
    if (badgeRefreshTimerRef.current) clearTimeout(badgeRefreshTimerRef.current);
    badgeRefreshTimerRef.current = setTimeout(() => {
      badgeRefreshTimerRef.current = null;
      void refreshUnreadCount();
    }, 150);
  };

  useEffect(() => {
    notificationLoadRequestRef.current += 1;
    setNotifications([]);
    setLoading(!!user?.id);
    if (!user?.id) {
      setPwaUnreadCount(0);
      readStateRef.current.clear();
      void updatePwaAppBadge(0);
      return;
    }
    readStateRef.current.clear();
    setPwaUnreadCount(0);
    void updatePwaAppBadge(0);
    void loadNotifications();

    // Prime browser audio on the first operator interaction. Without this,
    // realtime notifications received in a background/idle admin tab are
    // visible but are forbidden from making sound by autoplay policy.
    const detachUnlockListeners = () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      document.removeEventListener("touchstart", unlock, true);
    };
    const unlock = () => {
      void unlockNotificationSound().then(() => {
        // Keep listening when that gesture was rejected so another click
        // can retry (some Safari/PWA states reject the first resume).
        if (audioUnlockPromise) detachUnlockListeners();
      });
    };
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
    document.addEventListener("touchstart", unlock, true);

    // Realtime: server pushes new rows targeting this recipient.
    // notificationService.subscribeToNotifications already handles the
    // role filter, so we just prepend the new row when it arrives.
    const unsubscribe = notificationService.subscribeToNotifications(
      user.id,
      (notification, eventType) => {
        if (eventType === "DELETE") {
          const wasRead = readStateRef.current.get(notification.id);
          readStateRef.current.delete(notification.id);
          setNotifications((prev) => prev.filter((item) => item.id !== notification.id));
          if (wasRead === false || (wasRead === undefined && !notification.is_read)) {
            setPwaUnreadCount((count) => Math.max(0, count - 1));
          }
          queueUnreadCountRefresh();
          return;
        }

        if (eventType === "UPDATE") {
          const inCurrentScope =
            (!companyId || notification.company_id === companyId) &&
            (!activeRole || !notification.target_role || notification.target_role === activeRole);
          const wasRead = readStateRef.current.get(notification.id);
          if (!inCurrentScope) {
            readStateRef.current.delete(notification.id);
            setNotifications((prev) => prev.filter((item) => item.id !== notification.id));
            if (wasRead === false) setPwaUnreadCount((count) => Math.max(0, count - 1));
            queueUnreadCountRefresh();
            return;
          }
          readStateRef.current.set(notification.id, notification.is_read);
          setNotifications((prev) => prev.map((item) => item.id === notification.id ? notification : item));
          if (wasRead === undefined || wasRead !== notification.is_read) queueUnreadCountRefresh();
          return;
        }

        if (readStateRef.current.has(notification.id)) return;
        readStateRef.current.set(notification.id, notification.is_read);
        setNotifications((prev) => {
          // Guard against the realtime channel re-firing the same row
          // (rare but happens on reconnects).
          if (prev.some((n) => n.id === notification.id)) return prev;
          return [notification, ...prev];
        });
        if (!notification.is_read) queueUnreadCountRefresh();
        // Alert on every new notification, deduped across the 2-3 bell
        // mounts (desktop / collapsed / mobile). Raj 2026-07-05: play the
        // sound for ALL new notifications so staff hear them land. The
        // pop-up toast still fires only for high/urgent so we don't spam
        // the screen for routine items - the sound + badge cover those.
        if (claimToast(notification.id)) {
          const priority = (notification.priority || "").toLowerCase();
          // The local chime is immediate while the app is visible. In the
          // background, subscribed devices use the OS push sound instead.
          // A foreground app uses the unlocked in-app chime. When hidden,
          // an OS notification supplies the sound if permission is granted;
          // otherwise audio playback is commonly blocked by the browser.
          const canPlayLocalSound = document.visibilityState === "visible"
            || (!("Notification" in window) || window.Notification.permission !== "granted");
          if (canPlayLocalSound) {
            playNotifSound(priority);
          }
          if (devicePushStatusRef.current !== "subscribed") {
            const destination = notificationDestination(
              notification,
              activeRole || profile?.active_role || profile?.role || user?.role,
            );
            const href = /^https?:\/\//i.test(destination) ? destination : withSlug(destination);
            void showBackgroundNotification(notification, href, notificationIcon);
          }
          if (priority === "urgent" || priority === "high") {
            toast({
              title: notification.title || "New notification",
              description: notification.message || undefined,
              variant: priority === "urgent" ? "destructive" : "default",
            });
          }
        }
      },
      activeRole,
      companyId,
    );

    // Safety net: if a network blip drops the realtime channel, a slow
    // poll still catches up. 5 minutes is rare enough not to be costly,
    // frequent enough that no notification stays hidden for long.
    const interval = setInterval(() => { void loadNotifications(false); }, 5 * 60 * 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
      if (badgeRefreshTimerRef.current) clearTimeout(badgeRefreshTimerRef.current);
      badgeRefreshTimerRef.current = null;
      detachUnlockListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeRole, companyId]);

  useEffect(() => {
    void updatePwaAppBadge(user?.id ? pwaUnreadCount : 0);
  }, [pwaUnreadCount, user?.id]);

  const loadNotifications = async (showSpinner = true) => {
    if (!user?.id) return;
    const requestId = ++notificationLoadRequestRef.current;
    if (showSpinner) setLoading(true);
    try {
      // Load the visible rows and the exact count in parallel. The list is
      // intentionally capped, while the bell and installed-app badge use
      // the full unread count.
      const [unreadNotifs, readNotifs, exactUnreadCount] = await Promise.all([
        notificationService.getNotifications(user.id, true, activeRole, { limit: 50, companyId }),
        notificationService.getNotifications(user.id, false, activeRole, { limit: 5, companyId }),
        notificationService.getUnreadCount(user.id, activeRole, companyId),
      ]);
      if (requestId !== notificationLoadRequestRef.current) return;
      
      // Combine, DEDUPE, then sort by date. getNotifications(userId, false)
      // returns ALL notifications (read + unread), not just read - so every
      // unread row also lands in readNotifs and would render twice. Keep the
      // first occurrence per id (unread list is first, so its copy wins).
      const seen = new Set<string>();
      const combined = [...unreadNotifs, ...readNotifs]
        .filter((n) => {
          if (!n.id) return true;
          if (seen.has(n.id)) return false;
          seen.add(n.id);
          return true;
        })
        .sort(
          (a, b) => new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime()
        );

      setNotifications(combined);
      readStateRef.current = new Map(combined.map((notification) => [notification.id, notification.is_read]));
      setPwaUnreadCount(exactUnreadCount);
    } catch (error) {
      if (requestId === notificationLoadRequestRef.current) {
        console.error("Failed to load notifications:", error);
      }
    } finally {
      if (requestId === notificationLoadRequestRef.current) setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await notificationService.markAsRead(notificationId);
    const wasUnread = readStateRef.current.get(notificationId) === false;
    readStateRef.current.set(notificationId, true);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
    );
    if (wasUnread) setPwaUnreadCount((count) => Math.max(0, count - 1));
    queueUnreadCountRefresh();
  };

  const handleMarkAllAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user?.id) return;
    await notificationService.markAllAsRead(user.id, activeRole, companyId);
    readStateRef.current.forEach((_isRead, id) => readStateRef.current.set(id, true));
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setPwaUnreadCount(0);
    queueUnreadCountRefresh();
  };

  const handleDelete = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const wasUnread = readStateRef.current.get(notificationId) === false;
    await notificationService.deleteNotification(notificationId);
    readStateRef.current.delete(notificationId);
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    if (wasUnread) setPwaUnreadCount((count) => Math.max(0, count - 1));
    queueUnreadCountRefresh();
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      readStateRef.current.set(notification.id, true);
      void notificationService.markAsRead(notification.id).catch(() => { void loadNotifications(); });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      );
      setPwaUnreadCount((count) => Math.max(0, count - 1));
      queueUnreadCountRefresh();
    }
    
    setOpen(false);
    const destination = notificationDestination(
      notification,
      activeRole || profile?.active_role || profile?.role || user?.role,
    );
    router.push(/^https?:\/\//i.test(destination) ? destination : withSlug(destination));
  };

  const handleViewAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);

    const role = activeRole || profile?.active_role || profile?.role || user?.role;
    router.push(withSlug(notificationInboxPathForRole(role)));
  };

  // Soft tinted icon chip per priority - replaces the old heavy
  // left-border bar. Each row gets a rounded icon "coin" whose tint
  // signals urgency without shouting.
  const getPriorityIcon = (priority: string | null) => {
    switch (priority) {
      case "urgent":
      case "high":
        return <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />;
      case "medium":
        return <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
      default:
        return <Bell className="h-4 w-4 text-slate-500 dark:text-slate-400" />;
    }
  };

  const getPriorityIconBg = (priority: string | null) => {
    switch (priority) {
      case "urgent":
      case "high":
        return "bg-rose-50 dark:bg-rose-950/40";
      case "medium":
        return "bg-amber-50 dark:bg-amber-950/40";
      default:
        return "bg-slate-100 dark:bg-slate-800";
    }
  };

  // Final safety net: render each id at most once, no matter how the
  // list got built (stale cached bundle, double fetch, realtime re-fire).
  // This is what actually guarantees the dropdown never shows a row twice.
  const visibleNotifications = Array.from(
    new Map(notifications.map((n) => [n.id, n])).values(),
  );
  const unreadCount = pwaUnreadCount;
  const pushRoleLabel = String(activeRole || profile?.active_role || profile?.role || user?.role || "current")
    .replace(/_/g, " ");

  if (!user) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-11 w-11 shrink-0 rounded-full hover:bg-slate-100 data-[state=open]:bg-brand-primary/10 data-[state=open]:text-brand-primary dark:hover:bg-slate-800 dark:data-[state=open]:bg-brand-primary/20"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-brand-primary text-white text-xs border-transparent"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="end"
        collisionPadding={12}
        avoidCollisions
        className={cn(
          // Opens BELOW the bell. The old side="right" placement was built
          // for the sidebar bell, but the portal headers put the bell in
          // the top-right corner - on a phone Radix flipped it to the left
          // where a 420px panel can't fit and hung it half off-screen
          // (driver feedback 2026-07-04, Pic 79). With side="bottom" the
          // horizontal overflow sits on the ALIGN axis, which
          // avoidCollisions can correct in both header and sidebar slots.
          // Strong shadow + rounded corners + ring so it reads as a distinct
          // floating panel hovering above the dashboard, not something laid
          // flat over the content. overflow-hidden keeps the rounded corners
          // clean against the header / footer fills.
          "z-[1200] flex max-h-[min(calc(100dvh-1.5rem),var(--radix-dropdown-menu-content-available-height))] w-[calc(100vw-1.5rem)] max-w-[420px] flex-col overflow-hidden border-slate-200 bg-white p-0 text-slate-900 shadow-2xl sm:w-[420px] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100",
          "rounded-2xl border border-slate-200/80 dark:border-slate-700/70",
          "shadow-2xl ring-1 ring-black/5 dark:ring-white/10",
        )}
        sideOffset={10}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-primary/10">
              <Bell className="h-4 w-4 text-brand-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white leading-none">
                Notifications
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                {unreadCount > 0
                  ? `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`
                  : "You're all caught up"}
              </p>
            </div>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="h-auto min-h-11 flex-shrink-0 px-2 text-xs text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary"
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        {devicePushStatus === "ready" && deviceNotificationPermission !== "denied" && (
          <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
                <BellRing className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-900 dark:text-white">Get alerts on this device</p>
                <p className="mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">
                  Receive {pushRoleLabel} updates in the background. Changing portals updates this device's alert role.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => void enableDeviceNotifications()}
                disabled={devicePushBusy}
                className="min-h-10 shrink-0 px-3 text-xs"
              >
                {devicePushBusy ? "Enabling…" : "Enable"}
              </Button>
            </div>
          </div>
        )}

        {devicePushStatus === "subscribed" && (
          <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                <BellRing className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-emerald-950 dark:text-emerald-100">Device alerts are on</p>
                <p className="mt-0.5 text-xs leading-snug text-emerald-800 dark:text-emerald-300">
                  Receiving {pushRoleLabel} alerts on this device. Tap one to open its linked page.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={devicePushBusy}
                onClick={() => void disableDeviceNotifications()}
                className="min-h-10 shrink-0 px-2 text-xs"
              >
                {devicePushBusy ? "Saving…" : "Turn off"}
              </Button>
            </div>
          </div>
        )}

        {deviceNotificationPermission === "denied" && (
          <div role="status" className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            Device alerts are blocked. Allow them in your browser or installed-app settings.
          </div>
        )}

        {/* Notifications List */}
        <ScrollArea className="h-[min(420px,max(8rem,calc(100dvh-12rem)))] min-h-0 shrink bg-slate-50/60 dark:bg-slate-950/40">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Clock className="h-7 w-7 mb-3 animate-pulse text-slate-400" />
              <p className="text-sm">Loading notifications...</p>
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary/10 mb-4">
                <Bell className="h-7 w-7 text-brand-primary" />
              </div>
              <p className="font-semibold text-slate-900 dark:text-white mb-1">No notifications</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">You're all caught up.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleNotifications.map((notification) => {
                // Wave 24: degrade displayed priority on stale rows so a
                // 19-day-old "URGENT" doesn't keep glowing red in the
                // dropdown header. Same shared helper the per-portal
                // notification pages use.
                const displayedPriority = effectivePriority(
                  notification.priority,
                  notification.created_at,
                );
                return (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    "group relative flex min-w-0 cursor-pointer gap-3 px-4 py-3.5 transition-colors",
                    !notification.is_read
                      ? "bg-white hover:bg-brand-primary/[0.04] dark:bg-slate-900 dark:hover:bg-brand-primary/10"
                      : "hover:bg-white dark:hover:bg-slate-900/60",
                  )}
                >
                  {/* Unread accent rail */}
                  {!notification.is_read && (
                    <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-brand-primary" />
                  )}

                  {/* Priority icon coin */}
                  <div
                    className={cn(
                      "mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full",
                      getPriorityIconBg(displayedPriority),
                    )}
                  >
                    {getPriorityIcon(displayedPriority)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4
                        className={cn(
                          "min-w-0 break-words pr-1 text-[13px] leading-snug",
                          !notification.is_read
                            ? "font-semibold text-slate-900 dark:text-white"
                            : "font-medium text-slate-600 dark:text-slate-300",
                        )}
                      >
                        {notification.title}
                      </h4>
                          {/* Keep row actions visible so touch users can reach them. */}
                      <div className="flex shrink-0 items-center gap-0.5">
                        {!notification.is_read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Mark as read"
                            className="h-11 w-11 text-slate-500 hover:text-brand-primary hover:bg-brand-primary/10 lg:h-8 lg:w-8"
                            onClick={(e) => handleMarkAsRead(notification.id, e)}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Dismiss"
                          className="h-11 w-11 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 lg:h-8 lg:w-8"
                          onClick={(e) => handleDelete(notification.id, e)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                      {notification.message}
                    </p>

                    <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                      <Clock className="h-3 w-3 flex-shrink-0" />
                      <span className="whitespace-nowrap">
                        {formatDistanceToNow(new Date(notification.created_at || ""), {
                          addSuffix: true,
                        })}
                      </span>
                      {notification.notification_type && (
                        <span className="ml-1 inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 capitalize truncate">
                          {notification.notification_type.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {visibleNotifications.length > 0 && (
          <div className="shrink-0 border-t border-slate-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
            <Button
              variant="ghost"
              className="h-11 w-full text-sm font-medium text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary"
              onClick={handleViewAll}
            >
              View all notifications
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
