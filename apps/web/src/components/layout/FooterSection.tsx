'use client';

import Link from 'next/link';
import BrandLogo from './BrandLogo';

const productLinks = [
  { href: '/universities', label: '院校库' },
  { href: '/majors', label: '专业库' },
  { href: '/scores', label: '查分系统' },
  { href: '/recommend', label: 'AI 推荐' },
  { href: '/plan', label: '志愿方案' },
];

const resourceLinks = ['填报指南', '真题与模考', '高校关系', 'API 文档'];
const aboutLinks = ['关于我们', '联系我们', '服务协议', '隐私政策'];

export default function FooterSection() {
  return (
    <footer className="bg-[#15212e] text-[12px] text-white/50">
      <div className="mx-auto max-w-[1200px] px-4 pb-8 pt-12 sm:px-6 lg:px-12">
        <div className="mb-8 grid grid-cols-2 gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-1">
            <BrandLogo variant="reverse" className="mb-3.5" />
            <p className="m-0 leading-[1.7] text-white/45">
              每一个志愿，都值得被认真对待。
              <br />
              四川考生的高考志愿决策伙伴。
            </p>
          </div>

          <div>
            <h5 className="mb-3.5 mt-0 font-serif text-[14px] font-semibold text-white">产品</h5>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {productLinks.map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className="text-white/55 no-underline transition-colors duration-200 hover:text-white">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h5 className="mb-3.5 mt-0 font-serif text-[14px] font-semibold text-white">资源</h5>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {resourceLinks.map((label) => (
                <li key={label} className="text-white/55">
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h5 className="mb-3.5 mt-0 font-serif text-[14px] font-semibold text-white">关于</h5>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {aboutLinks.map((label) => (
                <li key={label} className="text-white/55">
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-2 border-t border-white/10 pt-4 text-white/45 sm:flex-row sm:gap-0">
          <span>© 2026 立方科技（成都）有限公司</span>
          <span>蜀 ICP 备 2026000000 号 · 川公网安备 51010000000000 号</span>
        </div>
      </div>
    </footer>
  );
}
