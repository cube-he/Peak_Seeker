/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@volunteer-helper/shared', 'antd', '@ant-design/icons'],
  experimental: {
    optimizePackageImports: ['antd', '@ant-design/icons'],
  },
};

module.exports = nextConfig;
