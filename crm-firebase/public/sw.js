// Service worker de House Chat: solo muestra las notificaciones push (no guarda la app en caché).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "House Chat", {
    body: d.body || "Tienes un mensaje nuevo", tag: d.tag || undefined, renotify: !!d.tag,
    icon: "/icon-512.png", badge: "/icon-512.png", timestamp: d.ts || Date.now(), data: { url: d.url || "/#conv" },
  }));
});

// Al tocar la notificación: abre ese chat (en la ventana de House Chat que ya esté abierta, si hay una)
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) { await w.focus(); w.postMessage({ type: "open", url }); return; }
    }
    await self.clients.openWindow(url);
  })());
});
