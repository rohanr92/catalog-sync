import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Providers from '@/components/Providers';
import Theme from '@/components/Theme';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Catalog Sync — Menina Step',
  description: 'Review and approve catalog changes before they reach each marketplace.',
};
export const viewport: Viewport = { themeColor: '#6d5ce8' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body suppressHydrationWarning>
        <Theme />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
