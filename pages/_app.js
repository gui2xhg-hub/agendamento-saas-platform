import React, { useEffect } from 'react';
import '../styles/globals.css';

export default function MyApp({ Component, pageProps }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(
          (registration) => {
            console.log('PWA ServiceWorker registrado com sucesso!', registration.scope);
          },
          (err) => {
            console.log('Falha ao registrar PWA ServiceWorker: ', err);
          }
        );
      });
    }
  }, []);

  return <Component {...pageProps} />;
}
