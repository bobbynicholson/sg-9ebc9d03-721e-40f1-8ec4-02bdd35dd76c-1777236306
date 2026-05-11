/* eslint-disable no-restricted-globals */
/**
 * CateringMS driver portal service worker.
 *
 * Scope: /team-portal/driver/  (set by Service-Worker-Allowed via
 * the manifest's `scope` and the registration `scope` arg in _app).
 *
 * What it does today:
 *   1. Shell cache: precache the driver dashboard + key offline
 *      fallback so a driver who loses signal still sees the shell
 *      rather than the browser's "no internet" screen.
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

const CACHE_VERSION = "v1";
const SHELL_CACHE = `cms-driver-shell-${CACHE_VERSION}`;
const SHELL_URLS = [
  "/team-portal/driver/dashboard",
  "/team-portal/driver/deliveries",
  "/team-portal/driver/routes",
  "/favicon.ico",
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
          cache.add(url).catch((e) => console.warn("[sw] precache miss:", url, e)),
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
          .filter((k) => k.startsWith("cms-driver-shell-") && k !== SHELL_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
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

  // Network-first for everything else, fall back to shell cache.
  event.respondWith(
    fetch(req)
      .then((resp) => {
        // Cache successful HTML responses so an offline reload of
        // the driver dashboard still paints.
        if (
          resp.ok &&
          (req.destination === "document" || req.headers.get("accept")?.includes("text/html"))
        ) {
          const copy = resp.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
        }
        return resp;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match("/team-portal/driver/dashboard"))),
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
