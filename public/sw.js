// Service Worker ÚNICO do site.
// Antes existiam dois (sw.js e OneSignalSDKWorker.js) disputando o mesmo espaço,
// o que fazia as notificações falharem de vez em quando. Agora os dois arquivos
// fazem exatamente a mesma coisa: carregam o OneSignal (que exibe as notificações).
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
// (o arquivo OneSignalSDKWorker.js foi mantido por compatibilidade, com o mesmo conteúdo)

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
