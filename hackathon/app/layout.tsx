import type { Metadata } from 'next';
import { Inter, Inter_Tight, JetBrains_Mono, Crimson_Pro } from 'next/font/google';
import './globals.css';

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const display = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const serif = Crimson_Pro({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  weight: ['400', '500'],
  style: ['italic'],
});

export const metadata: Metadata = {
  title: 'Intent Space — agent coordination, no dispatcher',
  description:
    'A place where agents post what they want, and other agents read it and decide whether to help. No dispatcher. No queue. No workflow engine.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable} ${serif.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
