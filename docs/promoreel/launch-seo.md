# Launch SEO checklist

## Before you deploy
- [ ] Pick the domain and set `NEXT_PUBLIC_SITE_URL` (canonical URLs, the sitemap, OG and JSON-LD all use it). Until then it falls back to `https://promoreel.app`.
- [ ] Hosting: **Netlify's free plan** (or Cloudflare Pages). Vercel's free Hobby plan is for non-commercial use only, and an email list makes this a marketing site. Re-read the plan's terms when you sign up.
- [ ] Set `BUTTONDOWN_API_KEY` (server only) in the host's environment. Without it, downloads still work but emails aren't saved (the server logs a warning).
- [ ] `npm run build` passes and lists every page as static (○ or ●) except `/api/subscribe`.
- [ ] `curl -s https://<domain>/ | grep -o '<h1[^>]*>.*</h1>'` shows the headline in the raw HTML (no JavaScript needed).
- [ ] Check `/robots.txt`, `/sitemap.xml` and `/llms.txt` on the live domain.

## Google Search Console
1. Go to search.google.com/search-console → **Add property** → **URL prefix** → `https://<domain>`.
2. Choose **HTML tag**, copy the `content` value, and set it as `GOOGLE_SITE_VERIFICATION` in the host's environment. Redeploy, then click **Verify**. (Prefer DNS? Use a Domain property and the TXT record instead.)
3. **Sitemaps** → submit `sitemap.xml`. It includes video entries for each example video.
4. **URL Inspection** → request indexing for `/`, `/create` and the six `/for/...` pages.
5. Check again in 1–2 weeks: **Pages** (indexed or not, and why), **Videos** (example videos found), **Enhancements** (breadcrumbs, FAQ, video) and **Core Web Vitals**.

## Bing Webmaster Tools (also feeds ChatGPT search and Copilot)
1. bing.com/webmasters → **Import from Google Search Console** (fastest), or add the site manually.
2. Manual: choose the meta tag, set `BING_SITE_VERIFICATION`, redeploy, verify.
3. Submit `https://<domain>/sitemap.xml`. Turn on **IndexNow** if offered.

## Analytics (privacy-friendly)
- Cloudflare Web Analytics: add the site (it doesn't need to be on Cloudflare DNS), copy the token into `NEXT_PUBLIC_CF_BEACON_TOKEN`, redeploy. The beacon loads with `lazyOnload` and sets no cookies. The CSP already allows only its two hosts.

## Structured data
- [ ] Run `/`, `/create`, one `/aesthetics/...`, one `/for/...` and `/examples` through the Rich Results Test (search.google.com/test/rich-results) and validator.schema.org. Expect SoftwareApplication, FAQPage, BreadcrumbList, VideoObject, Article, Organization and WebSite.

## Core Web Vitals
- **In the lab, before launch:** Chrome DevTools → Lighthouse → Mobile → Performance, SEO, Accessibility, Best Practices, on `/`, `/aesthetics/y2k-chrome`, `/for/product-hunt-launch-video` and `/create`. Targets: Performance 90+ mobile and 95+ desktop, 100 for the rest.
- **In the field, after launch:** pagespeed.web.dev shows real-user (CrUX) data once there's enough traffic. Search Console → **Core Web Vitals** groups slow URLs.
- **What to watch:** LCP is the hero headline (text, no image to wait for). INP: the engine renders on `requestAnimationFrame` and export yields every 4 frames. CLS: canvases and videos have fixed aspect ratios, and fonts use `display: swap`.

## The first 10 guides
Three are written (✓). Each one should answer its question in the first paragraph, link to one or two `/for` pages and one or two styles, and end with the CTA. Add the MDX file in `src/content/guides/` and its entry in `src/domain/promo/content/guides.ts`.

1. ✓ How to make a Product Hunt launch video (`how to make a product hunt launch video`)
2. ✓ App Store preview video size, length and format (`best size for an app store preview`)
3. ✓ How to promote a side project (`how to promote a side project`)
4. How to make a TikTok video for your app without showing your face (`tiktok app promo without face`)
5. X (Twitter) video specs and launch post tips (`twitter video size`)
6. What to put in a SaaS demo video, and what to leave out (`saas demo video`)
7. How to make an animated stat video for your product (`animated stat counter video`)
8. How to write a "what I shipped" post that people read (`build in public update`)
9. How long should a launch video be? (`how long should a product video be`)
10. Product Hunt launch checklist for solo founders (`product hunt launch checklist`)

## After launch, monthly
- [ ] Search Console → **Performance**: which queries bring impressions with low clicks? Rewrite those pages' titles and descriptions.
- [ ] Add one guide a week from the list above.
- [ ] Add example videos from real users (with permission) to `/examples`. Each one is a new video result.
- [ ] Re-check the `/alternatives` pages and update their `REVIEWED` date (`content/competitors.ts`).
