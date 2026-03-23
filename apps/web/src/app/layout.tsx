import type { Metadata } from 'next';
import { Inter, Manrope } from 'next/font/google';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import QueryProvider from '@/components/QueryProvider';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-headline',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '巅峰智选 Summit Intelligence | AI 驱动的升学志愿填报专家',
  description: '全球顶尖升学情报系统，为每一位追梦者构建精准的"数字作战室"。基于大数据深度洞察，重新定义名校申请策略。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${manrope.variable}`}>
      <body className="bg-surface text-on-surface font-body antialiased">
        <QueryProvider>
          <AntdRegistry>
            <ConfigProvider
              locale={zhCN}
              theme={{
                token: {
                  colorPrimary: '#003fb1',
                  colorSuccess: '#006973',
                  colorWarning: '#723b00',
                  colorError: '#ba1a1a',
                  colorInfo: '#1a56db',
                  borderRadius: 8,
                  colorBgContainer: '#ffffff',
                  colorBgLayout: '#faf8ff',
                  colorBorder: '#c3c5d7',
                  colorText: '#191b23',
                  colorTextSecondary: '#434654',
                  fontFamily: `var(--font-body), 'Inter', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif`,
                },
                components: {
                  Button: {
                    controlHeight: 40,
                    controlHeightLG: 48,
                    paddingContentHorizontal: 24,
                  },
                  Card: {
                    paddingLG: 24,
                  },
                  Table: {
                    headerBg: '#f3f3fe',
                    headerColor: '#191b23',
                    rowHoverBg: 'rgba(243, 243, 254, 0.5)',
                  },
                  Input: {
                    activeBorderColor: '#003fb1',
                    hoverBorderColor: '#b5c4ff',
                  },
                  Select: {
                    optionActiveBg: '#f3f3fe',
                  },
                  Tabs: {
                    inkBarColor: '#003fb1',
                    itemSelectedColor: '#003fb1',
                    itemHoverColor: '#1a56db',
                  },
                  Tag: {
                    borderRadiusSM: 9999,
                  },
                  Modal: {
                    borderRadiusLG: 16,
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
