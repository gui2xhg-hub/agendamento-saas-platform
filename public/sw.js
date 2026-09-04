// Service Worker simples para habilitação do PWA e Notificações
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Mantém as requisições normais da aplicação
  event.respondWith(fetch(event.request));
});
