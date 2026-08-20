import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL ?? 'http://localhost:4000'}/:path*`,
      },
    ];
  },
  env: {
    API_URL: process.env.API_URL ?? 'http://localhost:4000',
  },
};

export default nextConfig;
