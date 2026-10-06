// What the video is about: the product's name, its one-line tagline and where to find it.

export interface Product {
  name: string;
  tagline: string;
  url: string;
}

export const PRODUCT_LIMITS = { name: 40, tagline: 80, url: 80 };

export const EMPTY_PRODUCT: Product = { name: '', tagline: '', url: '' };

// the URL as it reads on screen: no scheme, no www, no trailing slash
export function displayUrl(url: string): string {
  return url
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '');
}

// a simple shape check; the newsletter tool does the real one
export const isEmail = (s: string) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(s.trim());
