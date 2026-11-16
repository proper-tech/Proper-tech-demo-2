import type { NextConfig } from 'next';

const config: NextConfig = {
  async redirects() {
    // The site has no language-neutral pages; send "/" to the default language.
    return [{ source: '/', destination: '/en', permanent: false }];
  },
};

export default config;
