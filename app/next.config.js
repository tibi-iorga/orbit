/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ["@prisma/client"],
  },
};

module.exports = nextConfig;
