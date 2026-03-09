import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import QueryProvider from '@/components/QueryProvider';
import './globals.css';

export const metadata: Metadata = {
  title: '志愿填报助手 - 科学填报，精准定位',
  description: '基于AI��术的高考志愿填报智能助手，帮助考生科学分析、精准定位、合理填报',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <QueryProvider>
          <AntdRegistry>
            <ConfigProvider
              locale={zhCN}
              theme={{
                token: {
                  colorPrimary: '#2563EB',
                  colorSuccess: '#10B981',
                  colorWarning: '#F59E0B',
                  colorError: '#EF4444',
                  colorInfo: '#3B82F6',
                  borderRadius: 8,
                  colorBgContainer: '#FFFFFF',
                  colorBgLayout: '#F8FAFC',
                  colorBorder: '#E2E8F0',
                  colorText: '#334155',
                  colorTextSecondary: '#64748B',
                  fontFamily: `-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif`,
                },
                components: {
                  Button: {
                    controlHeight: 38,
                    controlHeightLG: 44,
                    paddingContentHorizontal: 20,
                  },
                  Card: {
                    paddingLG: 24,
                  },
                  Table: {
                    headerBg: '#F8FAFC',
                    headerColor: '#0F172A',
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
