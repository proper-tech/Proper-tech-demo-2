import type { MetadataRoute } from 'next';
import { locales } from '@/i18n/config';
import { siteUrl } from '@/lib/meta';
import { sitePaths } from '@/lib/routes';

// Every page in every language, each naming its other two languages, as the pages' own hreflang tags do
// (lib/meta.ts). The addresses must be full ones, so the site's public address (SITE_URL) has to be set for a
// production build; without it they point at localhost.
export default function sitemap(): MetadataRoute.Sitemap {
  const at = (path: string) => new URL(path, siteUrl).href;
  return sitePaths().flatMap((path) =>
    locales.map((locale) => ({
      url: at(`/${locale}${path}`),
      alternates: { languages: Object.fromEntries(locales.map((l) => [l, at(`/${l}${path}`)])) },
    })),
  );
}
