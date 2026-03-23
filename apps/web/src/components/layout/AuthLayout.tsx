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
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left Brand Panel */}
      <div className="hidden md:flex md:w-1/2 lg:w-[45%] bg-primary relative flex-col justify-between p-12 overflow-hidden">
        {/* Grid Pattern Overlay */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.3) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative z-10">
          {/* Brand Logo */}
          <Link href="/" className="no-underline">
            <div className="flex items-center gap-3 mb-16">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <span className="text-white font-bold text-lg">S</span>
              </div>
              <span className="text-white font-headline font-bold text-lg">
                Summit Intelligence
              </span>
            </div>
          </Link>

          {/* Hero Text */}
          <h1 className="text-white font-headline font-extrabold text-4xl lg:text-5xl leading-tight mb-6">
            {heroTitle}
          </h1>
          <p className="text-white/70 text-base leading-relaxed max-w-md mb-12">
            {heroSubtitle}
          </p>

          {/* Features */}
          {features && features.length > 0 && (
            <div className="space-y-6">
              {features.map((feat, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-white/80 text-lg">{feat.icon}</span>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-sm mb-1">{feat.title}</h3>
                    <p className="text-white/60 text-xs leading-relaxed">{feat.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Social Proof */}
        {socialProof && (
          <div className="relative z-10 mt-12">
            <div className="h-px bg-white/20 mb-6" />
            <p className="text-white/60 text-sm">{socialProof}</p>
          </div>
        )}
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 bg-surface-container-lowest min-h-screen md:min-h-0">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}
