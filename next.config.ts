import type { NextConfig } from 'next';

const config: NextConfig = {
  async headers() {
    // Models, video, tours, the drone's views and textures are big and change rarely: browsers keep them for a
    // day and use the cached copy while checking for a newer one for a further week.
    const cache = [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }];
    const daily = ['/models/:path*', '/media/:path*', '/tour/:path*', '/tour-a/:path*', '/tour-d/:path*', '/views/:path*', '/plans/:path*', '/hdri/:path*', '/draco/:path*', '/logo/:path*', '/og/:path*'];
    // The tours' pictures are named after a hash of their content (interior/tools/split_tours.py): a changed
    // picture gets a new name, so a cached one never goes stale. Listed last, so it wins over /tour above.
    const forever = [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }];
    return [...daily.map((source) => ({ source, headers: cache })), { source: '/tour/:plan/img/:file', headers: forever }];
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
