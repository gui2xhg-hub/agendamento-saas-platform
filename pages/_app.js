import { useEffect } from 'react';
import Script from 'next/script';
import '../styles/globals.css'; // Mantenha seus imports de CSS aqui

export default function MyApp({ Component, pageProps }) {
  useEffect(() => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) {
      await OneSignal.init({
        appId: "SEU_ONESIGNAL_APP_ID_AQUI", // Substitua pelo seu App ID do OneSignal
        safari_web_id: "web.onesignal.auto.xxxxxx", // Opcional para Safari antigo
        notifyButton: {
          enable: false, // Desativado botão flutuante padrão (usaremos prompt nativo)
        },
        allowLocalhostAsSecureOrigin: true
      });
    });
  }, []);

  return (
    <>
      <Script
        src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
        strategy="afterInteractive"
      />
      <Component {...pageProps} />
    </>
  );
}
