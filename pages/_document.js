import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="pt-BR">
      <Head>
        {/* CONFIGURAÇÕES PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FF8C00" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Agendamentos" />
        <link rel="apple-touch-icon" href="https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=192&auto=format&fit=crop&q=80" />
      </Head>
      <body className="bg-gray-950 text-white">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
