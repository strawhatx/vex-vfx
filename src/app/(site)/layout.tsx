import { Footer } from '@/components/site/Footer';
import { Nav } from '@/components/site/Nav';
import { SiteMotion } from '@/components/site/SiteMotion';

// the marketing and SEO pages: nav, smooth scroll and reveals, and the footer
export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Nav />
      <main id="main">{children}</main>
      <Footer />
      <SiteMotion />
    </>
  );
}
