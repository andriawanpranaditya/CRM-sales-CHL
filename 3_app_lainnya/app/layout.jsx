import './globals.css';
import Script from 'next/script';

export const metadata = {
  title: 'Harmoni One — CHL',
  description: 'Harmoni One — sistem terpadu penjualan Cipta Harmoni Lestari',
  manifest: '/manifest.json',
  icons: { icon: '/favicon.png', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Harmoni One' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // iPhone berponi: tanpa viewportFit cover, env(safe-area-inset-*) tidak berfungsi
  viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#154235' }, { media: '(prefers-color-scheme: light)', color: '#F6F1E6' }],
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" data-theme="light" suppressHydrationWarning>
      <head>
        {/* Tema dipasang sebelum halaman tampil (tanpa kedip): pilihan tersimpan, atau ikut mode gelap/terang HP */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('h1_tema');if(t!=='dark'&&t!=='light')t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;}catch(e){}" }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        <Script id="register-sw" strategy="afterInteractive">
          {`if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(() => {}); }`}
        </Script>
      </body>
    </html>
  );
}
