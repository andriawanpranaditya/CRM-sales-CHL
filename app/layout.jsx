import './globals.css';
import Script from 'next/script';
import { cookies } from 'next/headers';

export const metadata = {
  title: 'CRM Sales — CHL',
  description: 'CRM Sales Cipta Harmoni Lestari',
  manifest: '/manifest.json',
  icons: { icon: '/favicon.png', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'CRM CHL' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F2EA' },
    { media: '(prefers-color-scheme: dark)', color: '#0B1F19' },
  ],
};

export default function RootLayout({ children }) {
  // Tema pilihan user (cookie crm_tema: light / dark). Tanpa cookie = mengikuti setelan terang/gelap HP.
  let tema;
  try { const t = cookies().get('crm_tema')?.value; if (t === 'light' || t === 'dark') tema = t; } catch {}
  return (
    <html lang="id" data-theme={tema} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        <Script id="register-sw" strategy="afterInteractive">
          {`if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js?v=${process.env.NEXT_PUBLIC_APP_VER || 'dev'}').catch(() => {}); }`}
        </Script>
      </body>
    </html>
  );
}
