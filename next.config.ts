import type { NextConfig } from 'next';

const config: NextConfig = {
  async headers() {
    // Models, video, tours and textures are big and change rarely: browsers keep them for a day
    // and use the cached copy while checking for a newer one for a further week.
    const cache = [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }];
    return ['/models/:path*', '/media/:path*', '/tour/:path*', '/plans/:path*', '/hdri/:path*', '/draco/:path*'].map((source) => ({ source, headers: cache }));
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
