'use client';

import Link from 'next/link';

export default function FooterSection() {
  return (
    <footer className="bg-surface-container-low">
      <div className="max-w-[1920px] mx-auto px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div>
            <div className="text-lg font-extrabold tracking-tighter text-primary font-headline mb-4">
              巅峰智选 Summit Intelligence
            </div>
            <p className="text-xs text-on-surface-variant">
              &copy; {new Date().getFullYear()} 巅峰智选。权威机构数据引擎认证。
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-4">
              平台
            </h4>
            <ul className="list-none p-0 m-0 space-y-3">
              <li>
                <Link href="/universities" className="text-sm text-on-surface-variant hover:text-on-surface no-underline transition-colors">
                  院校查询系统
                </Link>
              </li>
              <li>
                <Link href="/recommend" className="text-sm text-on-surface-variant hover:text-on-surface no-underline transition-colors">
                  AI 智能推荐
                </Link>
              </li>
              <li>
                <span className="text-sm text-on-surface-variant">
                  研究方法论
                </span>
              </li>
              <li>
                <span className="text-sm text-on-surface-variant">
                  数据隐私
                </span>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-4">
              资源
            </h4>
            <ul className="list-none p-0 m-0 space-y-3">
              <li>
                <span className="text-sm text-on-surface-variant">
                  高校关系
                </span>
              </li>
              <li>
                <span className="text-sm text-on-surface-variant">
                  API 文档
                </span>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-4">
              支持
            </h4>
            <ul className="list-none p-0 m-0 space-y-3">
              <li>
                <span className="text-sm text-on-surface-variant">
                  联系分析师
                </span>
              </li>
              <li>
                <span className="text-sm text-on-surface-variant">
                  服务协议
                </span>
              </li>
              <li>
                <span className="text-sm text-on-surface-variant">
                  隐私政策
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
