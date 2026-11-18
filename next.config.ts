import type { NextConfig } from 'next';

const config: NextConfig = {
  async redirects() {
    // The site has no language-neutral pages; send "/" to the default language.
    return [{ source: '/', destination: '/en', permanent: false }];
  },
  async rewrites() {
    // Stand-alone 360° tour of apartment D (single self-contained file in public/tour).
    return [{ source: '/tour', destination: '/tour/index.html' }];
  },
};

export default config;
