import type { NextConfig } from 'next';

// Sent with every response. nosniff: a file is only ever read as the type it is served as. The referrer stops at
// the site's address when a visitor follows a link elsewhere. Frames: only the site itself may frame its pages
// (the apartment and podium pages frame the 360° tours), so no other site can dress them up as its own. No page
// needs the camera, microphone, location or payments. HSTS: once seen over HTTPS, browsers never try plain HTTP
// here (this host only: other sites on the domain may not have HTTPS).
// There is no Content-Security-Policy: the tours, the map's worker and the layout's first-paint script are inline
// or blob code, and a policy strict enough to matter would need each of them allowed by hash first.
const security = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
];

const config: NextConfig = {
  poweredByHeader: false,
  // A 404 page for addresses with no language in them (src/app/global-not-found.tsx): the root layout lives
  // under [locale], so there is no layout for an ordinary not-found page to render in.
  experimental: { globalNotFound: true },
  async headers() {
    // Models, video, tours, the drone's views and textures are big and change rarely: browsers keep them for a
    // day and use the cached copy while checking for a newer one for a further week.
    const cache = [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }];
    const daily = ['/models/:path*', '/media/:path*', '/tour/:path*', '/tour-hd/:path*', '/tour-a/:path*', '/tour-d/:path*', '/views/:path*', '/plans/:path*', '/hdri/:path*', '/draco/:path*', '/logo/:path*', '/og/:path*'];
    // The tours' pictures are named after a hash of their content (interior/tools/split_tours.py, hd_tours.mjs):
    // a changed picture gets a new name, so a cached one never goes stale. Listed last, so they win over the above.
    const forever = [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }];
    // A tour's page names those pictures and holds its scripts, so it is the one file that changes when a tour is
    // rebuilt: browsers check it every time (a small "not modified" answer when it hasn't changed), or a buyer would
    // see the old tour for up to a day after a fix.
    const check = [{ key: 'Cache-Control', value: 'public, no-cache' }];
    return [
      { source: '/:path*', headers: security },
      ...daily.map((source) => ({ source, headers: cache })),
      { source: '/tour/:plan/img/:file', headers: forever },
      { source: '/tour-hd/:plan/img/:file', headers: forever },
      { source: '/tour-hd/outside/:file', headers: forever },
      { source: '/tour/:plan/index.html', headers: check },
      { source: '/tour-hd/:plan/index.html', headers: check },
    ];
  },
  async redirects() {
    // The site has no language-neutral pages; send "/" to the default language.
    return [{ source: '/', destination: '/en', permanent: false }];
  },
  async rewrites() {
    // Stand-alone rendered 360° tours, one self-contained file per plan in public/tour/<plan>/.
    return [
      { source: '/tour', destination: '/tour/D/index.html' },
      { source: '/tour/:plan([A-F])', destination: '/tour/:plan/index.html' },
    ];
  },
};

export default config;
