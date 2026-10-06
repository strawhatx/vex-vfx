// The site's type: SF Pro on Apple devices (the system font), Inter everywhere else. Inter is
// self-hosted by next/font with a size-matched fallback, so the swap doesn't shift the layout.
import { Inter } from 'next/font/google';

export const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap', preload: false });
