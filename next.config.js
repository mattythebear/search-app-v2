/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '**',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Optional: Add proxy for development if needed
  async rewrites() {
    // Only use this if you need to proxy Typesense in development
    if (process.env.USE_TYPESENSE_PROXY === 'true') {
      return [
        {
          source: '/typesense-proxy/:path*',
          destination: `${process.env.TYPESENSE_PROTOCOL || 'http'}://${process.env.TYPESENSE_HOST}:${process.env.TYPESENSE_PORT}/${process.env.TYPESENSE_PATH || ''}:path*`,
        },
      ];
    }
    return [];
  },
}

module.exports = nextConfig
