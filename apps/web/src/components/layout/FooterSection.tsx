'use client';

import Link from 'next/link';

export default function FooterSection() {
  return (
    <footer>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-12 pt-10 md:pt-[60px] pb-8 md:pb-10">
        <div className="grid grid-cols-2 md:grid-cols-[2fr_1fr_1fr_1fr] gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="font-serif text-xl font-semibold text-text">
              智愿家
            </div>
            <div className="text-[13px] text-text-muted tracking-[2px] mt-1.5">
              智慧 · 志愿 · 专家
            </div>
            <p className="text-[13px] text-text-tertiary mt-3 leading-relaxed">
              基于 AI 与大数据的升学决策平台，让每一个志愿都被认真对待。
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-text-muted font-medium mb-4">
              产品
            </h4>
            <ul className="list-none p-0 m-0 space-y-2.5">
              <li>
                <Link href="/universities" className="text-sm text-text-tertiary hover:text-primary no-underline transition-colors duration-200">
                  院校查询系统
                </Link>
              </li>
              <li>
                <Link href="/recommend" className="text-sm text-text-tertiary hover:text-primary no-underline transition-colors duration-200">
                  AI 智能推荐
                </Link>
              </li>
              <li>
                <span className="text-sm text-text-tertiary">
                  研究方法论
                </span>
              </li>
              <li>
                <span className="text-sm text-text-tertiary">
                  数据隐私
                </span>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-text-muted font-medium mb-4">
              资源
            </h4>
            <ul className="list-none p-0 m-0 space-y-2.5">
              <li>
                <span className="text-sm text-text-tertiary">
                  高校关系
                </span>
              </li>
              <li>
                <span className="text-sm text-text-tertiary">
                  API 文档
                </span>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-text-muted font-medium mb-4">
              支持
            </h4>
            <ul className="list-none p-0 m-0 space-y-2.5">
              <li>
                <span className="text-sm text-text-tertiary">
                  联系分析师
                </span>
              </li>
              <li>
                <span className="text-sm text-text-tertiary">
                  服务协议
                </span>
              </li>
              <li>
                <span className="text-sm text-text-tertiary">
                  隐私政策
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border mt-8 pt-5 flex flex-col sm:flex-row gap-2 sm:gap-0 justify-between">
          <span className="text-xs text-text-faint">
            &copy; 2026 立方科技. All rights reserved.
          </span>
          <span className="text-xs text-text-faint">
            智愿家 — 你的升学智囊
          </span>
        </div>
      </div>
    </footer>
  );
}
