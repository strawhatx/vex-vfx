import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { inter } from '@/lib/fonts';
import { JsonLd } from '@/lib/seo/JsonLd';
import { organization, website } from '@/lib/seo/schema';
import { SITE } from '@/lib/seo/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name}: ${SITE.tagline}`, template: `%s | ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: { siteName: SITE.name, locale: SITE.locale, type: 'website' },
  twitter: { card: 'summary_large_image' },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    other: process.env.BING_SITE_VERIFICATION
      ? { 'msvalidate.01': process.env.BING_SITE_VERIFICATION }
      : undefined,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
  colorScheme: 'light',
};

// Cloudflare Web Analytics: cookieless, loaded after everything else, only when a token is set
const beacon = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <JsonLd data={[organization(), website()]} />
        {children}
        {beacon && (
          <Script
            src="https://static.cloudflareinsights.com/beacon.min.js"
            strategy="lazyOnload"
            data-cf-beacon={JSON.stringify({ token: beacon })}
          />
        )}
      </body>
    </html>
  );
}
