/* eslint-disable no-restricted-globals */
/**
 * CateringMS authenticated app service worker.
 *
 * Scope: / (registered from _app only after entering an app surface).
 *
 * What it does today:
 *   1. Shell cache: precache the login page + workspace fallbacks so an
 *      installed app that loses signal still has a usable shell.
 *   2. Network-first for everything else, falling back to the
 *      cached shell when offline -- the driver still reads stale
 *      data instead of a blank page.
 *   3. Background Sync handler for the 'driver-gps-flush' tag: when
 *      the OS wakes the SW after the device comes back online, we
 *      replay queued GPS pings that the foreground hook stashed to
 *      IndexedDB. Stub for now -- the foreground useDriverGPSPing
 *      doesn't enqueue yet; that ships alongside.
 *
 * Versioned cache key: bumping CACHE_VERSION forces every client to
 * drop the old cache on the next activate, so we never serve stale
 * JS after a deploy.
 */

// v4 (2026-10-26): keep first install light. Preloading full role
// dashboards delayed activation and competed with the page that the
// person was opening. Only the sign-in fallback and small brand assets
// are precached; visited static chunks are still cached at runtime.
//
// v3 (2026-07-11): the authenticated app kept running a pre-deploy
// bundle for DAYS - skipWaiting/claim swap the worker but nothing
// reloads an already-open PWA, so fixes never reached his phone. The
// version bump drops every v1 cache, and _app.tsx now listens for
// controllerchange + re-checks for updates on tab focus and reloads
// once, so future deploys actually land on installed PWAs.
// v5: never retain authenticated HTML between accounts on a shared device.
// v6: clear old shell caches and do not cache localhost's stable Next dev
// chunk URLs. Dev chunks can change in place, unlike production hashes.
const CACHE_VERSION = "v6";
const SHELL_CACHE = `cms-app-shell-${CACHE_VERSION}`;
const IS_LOCAL_DEV = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(self.location.hostname);
const SHELL_URLS = [
  "/auth/login",
  "/icons/cateringms-192.png",
  "/icons/cateringms-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  // Skip the wait so a freshly deployed SW takes over without the
  // user having to close every tab.
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      // addAll fails atomically if any URL 4xxs. Use add per-URL so
      // a missing route doesn't poison the whole precache.
      return Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(new Request(new URL(url, self.location.origin), { credentials: "omit" }))
            // The worker has its own console; report the fixed shell path only.
            .catch(() => console.warn("[sw] precache miss:", url)),
        ),
      );
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("cms-app-shell-") && k !== SHELL_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Server-delivered Web Push works even after the PWA window has been closed.
// Each push creates a user-visible OS notification (required by browsers) and
// carries the same deep link as the in-app notification row.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "You have a new update." };
  }

  event.waitUntil((async () => {
    const unreadCount = Number(payload.unreadCount || 0);
    try {
      if (unreadCount > 0 && typeof self.navigator.setAppBadge === "function") {
        await self.navigator.setAppBadge(unreadCount);
      } else if (unreadCount <= 0 && typeof self.navigator.clearAppBadge === "function") {
        await self.navigator.clearAppBadge();
      }
    } catch {
      // The launcher badge is optional; always show the notification itself.
    }

    const notificationId = String(payload.notificationId || "new");
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const appIsVisible = windows.some((client) => client.visibilityState === "visible");
    await self.registration.showNotification(
      String(payload.title || "CateringMS notification"),
      {
        body: String(payload.body || "You have a new update."),
        icon: String(payload.icon || "/icons/cateringms-192.png"),
        badge: String(payload.badge || payload.icon || "/icons/cateringms-192.png"),
        tag: `cateringms-${notificationId}`,
        renotify: false,
        // The foreground app plays its own chime. Let the operating system
        // sound only when the app is not visible, avoiding a doubled alert.
        silent: appIsVisible,
        data: {
          url: String(payload.url || "/notifications"),
          notificationId,
        },
      },
    );
  })());
});

// Open the contextual page when a background notification is tapped in the
// installed driver PWA. The page-level fallback handles browsers where this
// worker is not controlling the current tenant-slug route.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url;
  if (!targetUrl) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const destination = new URL(targetUrl, self.location.origin);
      if (destination.protocol !== "https:" && destination.origin !== self.location.origin) return;
      const existing = clients.find((client) => client.url.startsWith(self.location.origin) && "focus" in client);
      if (existing) {
        existing.navigate(destination.href);
        return existing.focus();
      }
      return self.clients.openWindow(destination.href);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Don't intercept Supabase / API calls -- they need real network
  // state to pass auth and surface errors to the foreground code.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/data/")) return;
  if (IS_LOCAL_DEV && url.pathname.startsWith("/_next/static/")) {
    // Force a network read and bypass both the browser HTTP cache and the
    // service-worker cache while dev chunk filenames remain stable.
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }

  // Network-first for everything else, fall back to shell cache.
  event.respondWith(
    fetch(req)
      .then((resp) => {
        // Account-specific HTML must never be served to the next person
        // signing in on this device. Only immutable application assets
        // are cached; offline navigation falls back to the sign-in shell.
        const isStaticAsset = url.pathname.startsWith("/_next/static/");
        if (resp.ok && isStaticAsset) {
          const copy = resp.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
        }
        return resp;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match("/auth/login"))),
  );
});

// Background Sync -- the driver portal foreground hook will enqueue
// failed GPS pings and request a 'driver-gps-flush' sync when the
// device comes back online. Stub handler for now so the wiring is
// in place; the actual IndexedDB read + replay POST lands when the
// hook enqueues.
self.addEventListener("sync", (event) => {
  if (event.tag === "driver-gps-flush") {
    event.waitUntil(
      (async () => {
        // TODO: read queued pings from IndexedDB('cms-gps-queue')
        // and POST each to /api/driver/location (to be wired). For
        // now we just log so the integration is observable in dev.
        console.log("[sw] driver-gps-flush sync fired");
      })(),
    );
  }
});
