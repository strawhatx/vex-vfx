import type { Metadata, Viewport } from "next";
import { Anton, Space_Grotesk } from "next/font/google";
import "./globals.css";

const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
});

const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flarecut: put fire on anything",
  description:
    "Tap a hand, a body, a car. Pick fire, lightning or an aura. It follows the whole clip. Join the waitlist.",
  openGraph: {
    title: "Flarecut: put fire on anything",
    description: "VFX for your videos in one tap. Join the waitlist.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${grotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
