// Service worker mínimo: permite instalar o sistema como app no celular/tablet.
// Sempre busca a versão mais nova na internet; o cache é só para abrir sem rede.
const CACHE = "sistema-elite-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((r) => { const c = r.clone(); caches.open(CACHE).then((k) => k.put(req, c)); return r; })
      .catch(() => caches.match(req))
  );
});
