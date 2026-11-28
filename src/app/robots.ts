import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/meta';

// Search engines may read every page. Vercel's preview deployments (a copy of the site per branch) are kept out
// of the index, or a half-finished preview could be found instead of the real site.
export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV === 'preview') return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: new URL('/sitemap.xml', siteUrl).href,
  };
}
