/**
 * Service Worker (stable + minimal)
 *
 * The previous SW implementation registered multiple `fetch` handlers, called
 * `respondWith()` more than once per request, and referenced undefined
 * variables (e.g. `API_CACHE`). Those runtime errors can break navigation and
 * manifest loading, often presenting as a "white screen" after deploys.
 *
 * This version intentionally avoids aggressive caching of HTML/JS bundles.
 */

self.addEventListener("install", () => {
  // Activate the new SW immediately.
  // IMPORTANT: avoid immediate takeover while the app is running.
  // Immediate activation can cause a "refresh" feeling on background/restore.
  // The SW will update and take effect on the next full page load instead.
});

self.addEventListener("activate", (event) => {
  // IMPORTANT: do not claim control of existing pages automatically.
  // This prevents reloads on resume/minimize due to SW controller changes.
  // The update will be used once the user reloads the page.
});

// Network-first passthrough. Return 503 on network failure to prevent uncaught rejection.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    fetch(req).catch(() => {
      return new Response(null, {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Cache-Control": "no-store" },
      });
    })
  );
});
