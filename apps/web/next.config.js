/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@volunteer-helper/shared', 'antd', '@ant-design/icons'],
  experimental: {
    optimizePackageImports: ['antd', '@ant-design/icons'],
  },
  // 将 /api 请求代理到后端，确保直连 3004 端口时也能正常访问 API
  // /attachments/policy/* 转到 nginx (port 80, 配了 alias 到本地文件),
  // 让 port 3004 直接访问的场景里 policy 文件预览/下载也能 work.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:3003/api/:path*',
      },
      {
        source: '/attachments/:path*',
        destination: 'http://127.0.0.1:80/attachments/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
