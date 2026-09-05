import { useEffect } from 'react';
import Script from 'next/script';
import '../styles/globals.css';

export default function MyApp({ Component, pageProps }) {
  useEffect(() => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) {
      await OneSignal.init({
        appId: "4459285b-e81c-458e-a6dc-ebc5e1d9baef",
        notifyButton: { enable: false },
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
