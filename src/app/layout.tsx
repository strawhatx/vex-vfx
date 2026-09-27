import type { Metadata, Viewport } from 'next';
import { Anton, Bangers, Bebas_Neue, Inter } from 'next/font/google';
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

// text effects' fonts (all SIL Open Font License)
const bebas = Bebas_Neue({
  variable: '--font-bebas',
  weight: '400',
  subsets: ['latin'],
});

const bangers = Bangers({
  variable: '--font-bangers',
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
    <html lang="en" className={`${inter.variable} ${anton.variable} ${bebas.variable} ${bangers.variable}`}>
      <body>{children}</body>
    </html>
  );
}
