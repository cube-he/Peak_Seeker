'use client';

import Link from 'next/link';

interface AuthLayoutProps {
  children: React.ReactNode;
  heroTitle: string;
  heroSubtitle: string;
  features?: { icon: string; title: string; description: string }[];
  socialProof?: string;
}

export default function AuthLayout({
  children,
  heroTitle,
  heroSubtitle,
  features,
  socialProof,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Brand Panel */}
      <div className="hidden lg:flex lg:w-[45%] bg-primary relative flex-col justify-between p-12 overflow-hidden">
        {/* 背景图：低 opacity 作为底纹 */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: `url('/images/bg-auth-panel.webp')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />

        <div className="relative z-10">
          {/* Brand Logo */}
          <Link href="/" className="no-underline">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-white/15 rounded-lg flex items-center justify-center">
                <span className="text-white font-serif font-bold text-lg">智</span>
              </div>
            </div>
            <h2 className="font-serif text-3xl font-bold text-white mt-4">智愿家</h2>
            <p className="text-accent-light/80 text-[13px] tracking-[3px] mt-2">智慧 · 志愿 · 专家</p>
          </Link>

          {/* Hero Text */}
          <h1 className="text-white font-serif font-extrabold text-4xl lg:text-5xl leading-tight mt-12 mb-6">
            {heroTitle}
          </h1>
          <p className="text-white/65 text-base leading-relaxed max-w-md mb-12">
            {heroSubtitle}
          </p>

          {/* Features */}
          {features && features.length > 0 && (
            <div className="space-y-5">
              {features.map((feat, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-accent-light text-sm mt-0.5">✓</span>
                  <div>
                    <h3 className="text-white/85 font-semibold text-sm mb-1">{feat.title}</h3>
                    <p className="text-white/55 text-xs leading-relaxed">{feat.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Social Proof */}
        <div className="relative z-10 mt-8">
          <div className="h-px bg-white/15 mb-6" />
          <p className="text-white/45 text-sm">
            {socialProof || '125万+ 家庭的共同选择'}
          </p>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8 lg:px-12 py-6 lg:py-12 bg-surface min-h-screen lg:min-h-0">
        <div className="w-full max-w-md mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
