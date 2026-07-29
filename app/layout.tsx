import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'YouDown - Download de Vídeos & Áudios',
  description: 'Baixe vídeos e áudios do YouTube e de centenas de plataformas com 1 clique. Sem anúncios, sem instalações.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-[#090d16] text-slate-100 antialiased min-h-screen selection:bg-indigo-500 selection:text-white font-['Plus_Jakarta_Sans',sans-serif]">
        {children}
      </body>
    </html>
  );
}
