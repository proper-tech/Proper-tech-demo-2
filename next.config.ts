import type { NextConfig } from 'next';

const config: NextConfig = {
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
