import type { Metadata, Viewport } from 'next';
import { Anton, Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const anton = Anton({
  variable: '--font-anton',
  weight: '400',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'FlareCut',
  description: 'Click a hand, a body, or anything else, pick an effect, and watch it follow frame by frame.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0b0c',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} ${anton.variable}`}>
      <body>{children}</body>
    </html>
  );
}
