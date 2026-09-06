import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Laboratorio de Hidrocarburos | Sciu Science",
  description:
    "Laboratorio interactivo bilingüe para construir hidrocarburos y compuestos con grupos funcionales, validar valencias y explorar nomenclatura IUPAC.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script id="google-analytics-script" async src="https://www.googletagmanager.com/gtag/js?id=G-FZ76EQBG32" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              const analyticsMeasurementId = 'G-FZ76EQBG32';
              const analyticsDebugMode =
                window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1' ||
                new URLSearchParams(window.location.search).get('ga_debug') === '1';
              const analyticsScript = document.getElementById('google-analytics-script');
              if (analyticsDebugMode && analyticsScript) {
                analyticsScript.addEventListener('load', () => console.info('✅ gtag.js descargado'));
                analyticsScript.addEventListener('error', () => console.error(
                  '❌ gtag.js bloqueado o no disponible. Revisa bloqueadores de anuncios y protección antirrastreo.'
                ));
              }
              gtag('js', new Date());
              gtag('config', analyticsMeasurementId, {
                debug_mode: analyticsDebugMode,
                send_page_view: !analyticsDebugMode
              });

              if (analyticsDebugMode) {
                console.info('✅ Google Analytics inicializado');
                console.info('📊 ID:', analyticsMeasurementId);
                gtag('event', 'page_view', {
                  page_title: document.title || 'Prueba de GA',
                  page_location: window.location.href,
                  page_path: window.location.pathname + window.location.search,
                  debug_mode: true,
                  send_to: analyticsMeasurementId
                });
                console.info('✅ Evento de prueba enviado');
              }
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
