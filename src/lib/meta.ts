import type { Metadata } from 'next';
import { getDict, isLocale, locales, type Locale } from '@/i18n/config';

/**
 * What Facebook, X, Telegram, WhatsApp and the rest show when a page is shared: title, description, the
 * page's address, its language and the other languages it exists in, and a large picture card. The picture
 * is the complex at sunset (public/og/sebotse.jpg, 1200 × 630) for every page except the apartments, whose
 * opengraph-image.tsx draws a card with the plan, number and area (they pass ownImage, which leaves the
 * picture out here so the card is used). X reads the same picture.
 *
 * Link previews need full addresses, so the site's public address goes in SITE_URL (for example
 * https://sebotse.mn). On Vercel it falls back to the production domain; locally to localhost, where no
 * social network can fetch it anyway.
 */
export const siteUrl = new URL(
  process.env.SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000'),
);

const SHARE_IMAGE = { url: '/og/sebotse.jpg', width: 1200, height: 630, alt: 'Sebotse', type: 'image/jpeg' };

const ogLocale: Record<Locale, string> = { en: 'en_US', mn: 'mn_MN', zh: 'zh_CN' };

/** Metadata for one page. `path` is the page's address after the language, '' for the home page. */
export function pageMeta(locale: string, path: string, title: string | null, description: string, { ownImage = false } = {}): Metadata {
  const images = ownImage ? {} : { images: [SHARE_IMAGE] };
  const t = getDict(locale);
  const lang: Locale = isLocale(locale) ? locale : 'en';
  const url = `/${lang}${path}`;
  const full = title ? `${title} | ${t.site.name}` : t.site.name;
  return {
    ...(title ? { title } : {}),
    description,
    alternates: {
      canonical: url,
      languages: Object.fromEntries([...locales.map((l) => [l, `/${l}${path}`]), ['x-default', `/en${path}`]]),
    },
    openGraph: {
      type: 'website',
      siteName: t.site.name,
      title: full,
      description,
      url,
      locale: ogLocale[lang],
      alternateLocale: locales.filter((l) => l !== lang).map((l) => ogLocale[l]),
      ...images,
    },
    twitter: { card: 'summary_large_image', title: full, description, ...images },
  };
}
