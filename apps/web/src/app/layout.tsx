import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import QueryProvider from '@/components/QueryProvider';
import './globals.css';

const crimsonPro = localFont({
  src: [
    { path: '../../public/fonts/crimson-pro-400.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/crimson-pro-500.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/crimson-pro-600.woff2', weight: '600', style: 'normal' },
    { path: '../../public/fonts/crimson-pro-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-serif',
  display: 'swap',
});

const inter = localFont({
  src: [
    { path: '../../public/fonts/inter-400.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/inter-500.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/inter-600.woff2', weight: '600', style: 'normal' },
    { path: '../../public/fonts/inter-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '智愿家 Zhiyuanjia | 你的升学智囊',
  description: '基于 AI 与大数据的升学决策平台，让每一个志愿都被认真对待。智慧·志愿·专家。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={`${crimsonPro.variable} ${inter.variable}`}>
      <body className={`${crimsonPro.variable} ${inter.variable} font-sans antialiased`}>
        <QueryProvider>
          <AntdRegistry>
            <ConfigProvider
              locale={zhCN}
              theme={{
                token: {
                  colorPrimary: '#1e3a5f',
                  colorSuccess: '#276749',
                  colorWarning: '#b8860b',
                  colorError: '#c53030',
                  colorBgBase: '#f5f4ed',
                  colorBgContainer: '#faf9f5',
                  colorBgElevated: '#ffffff',
                  colorText: '#1a1a19',
                  colorTextSecondary: '#4d4c48',
                  colorTextTertiary: '#6b6962',
                  colorTextQuaternary: '#87867f',
                  colorBorder: '#e8e6dc',
                  colorBorderSecondary: '#f0eee6',
                  borderRadius: 8,
                  fontFamily: "Inter, 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
                  fontSize: 14,
                  lineHeight: 1.65,
                },
                components: {
                  Button: {
                    controlHeight: 40,
                    controlHeightLG: 48,
                    borderRadius: 8,
                  },
                  Card: {
                    paddingLG: 24,
                    borderRadiusLG: 10,
                  },
                  Table: {
                    headerBg: '#f0eee6',
                    rowHoverBg: '#faf9f5',
                  },
                  Input: {
                    activeBg: '#f0eee6',
                    hoverBg: '#f0eee6',
                  },
                  Tag: {
                    borderRadiusSM: 999,
                  },
                },
              }}
            >
              {children}
            </ConfigProvider>
          </AntdRegistry>
        </QueryProvider>
      </body>
    </html>
  );
}
