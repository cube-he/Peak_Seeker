'use client';

import BrandLogo from './BrandLogo';

interface AuthLayoutProps {
  children: React.ReactNode;
  heroTitle: string;
  heroSubtitle: string;
  features?: { title: string; description: string }[];
  socialProof?: string;
  eyebrow?: string;
}

export default function AuthLayout({
  children,
  heroTitle,
  heroSubtitle,
  features,
  socialProof,
  eyebrow = '每一个志愿，都值得被认真对待',
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-primary to-[#15212e] px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage: `url('/images/bg-auth-panel.webp')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/35 to-[#15212e]/90" />

        <div className="relative z-10">
          <BrandLogo variant="reverse" size="md" />
        </div>

        <div className="relative z-10 mx-auto max-w-[480px]">
          <div className="mb-4 text-[11px] font-medium uppercase tracking-[2px] text-accent-light">
            {eyebrow}
          </div>
          <h1 className="m-0 font-serif text-[42px] font-semibold leading-tight tracking-normal text-white">
            {heroTitle}
          </h1>
          <p className="mt-5 text-base leading-relaxed text-white/75">
            {heroSubtitle}
          </p>
          <div className="mt-8 grid grid-cols-3 gap-5 border-t border-white/15 pt-6">
            {[
              ['2,237', '在川招生院校'],
              ['14.4 万', '录取记录'],
              ['4 年', '数据纵深'],
            ].map(([value, label]) => (
              <div key={label}>
                <div className="font-serif text-[26px] font-bold leading-none text-accent-light tabular-nums">
                  {value}
                </div>
                <div className="mt-2 text-[11px] uppercase tracking-[1.4px] text-white/50">{label}</div>
              </div>
            ))}
          </div>
          {features && features.length > 0 && (
            <div className="mt-8 space-y-4">
              {features.map((feat) => (
                <div key={feat.title} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-accent/25 text-xs text-accent-light">
                    ✓
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-white/90">{feat.title}</div>
                    <p className="m-0 mt-1 text-xs leading-relaxed text-white/55">{feat.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="relative z-10 flex justify-between gap-6 text-[11px] uppercase tracking-[1.2px] text-white/40">
          <span>{socialProof || '2026 高考志愿决策'}</span>
          <span>四川省教育考试院数据口径</span>
        </div>
      </aside>

      <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-8 sm:px-8 lg:min-h-0 lg:px-12 lg:py-12">
        <div className="w-full max-w-[420px]">
          {children}
        </div>
      </main>
    </div>
  );
}
