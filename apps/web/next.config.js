/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@volunteer-helper/shared', 'antd', '@ant-design/icons'],
  experimental: {
    optimizePackageImports: ['antd', '@ant-design/icons'],
  },
  // 将 /api 请求代理到后端，确保直连 3004 端口时也能正常访问 API
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:3003/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
