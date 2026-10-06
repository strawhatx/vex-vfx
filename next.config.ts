import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Everything loads from this site. On top of Next's defaults the tool needs: blob: URLs for
// screenshots, music, workers and the exported video; the Anthropic API, which the browser calls
// directly when the user directs with their own key; and Cloudflare Web Analytics (cookieless).
// React needs 'unsafe-eval' in dev only.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self' blob: data: https://api.anthropic.com https://cloudflareinsights.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // nothing the tool needs: no camera, microphone or location
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  trailingSlash: false,
  // the CSS is ~12 KB: inline it so the first paint doesn't wait on stylesheet requests
  experimental: { inlineCss: true },
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // the old FlareCut routes, permanently moved
  async redirects() {
    return [
      { source: "/editor", destination: "/create", statusCode: 301 },
      { source: "/editor/:path*", destination: "/create", statusCode: 301 },
      { source: "/contact", destination: "/", statusCode: 301 },
      // the Clean Apple style became Clean Soft
      { source: "/aesthetics/clean-apple", destination: "/aesthetics/clean-soft", statusCode: 301 },
    ];
  },
};

export default createMDX({ options: { remarkPlugins: ["remark-gfm"] } })(nextConfig);
