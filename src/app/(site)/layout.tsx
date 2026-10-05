import { Credits } from '@/components/site/Credits';
import { Nav } from '@/components/site/Nav';
import { SiteMotion } from '@/components/site/SiteMotion';

// the marketing and SEO pages: nav, smooth scroll and reveals, and the end-credits footer
export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Nav />
      <main id="main">{children}</main>
      <Credits />
      <SiteMotion />
    </>
  );
}
