import Link from 'next/link';
import '../../app/(auth)/auth.css';

interface AuthFeature {
  /** Bold lead-in phrase. */
  strong: string;
  /** Remaining sentence after the bold phrase (include any leading separator). */
  text: string;
}

interface AuthLayoutProps {
  children: React.ReactNode;
  /** Left-panel background image (cover). */
  bgImage: string;
  /** Uppercase eyebrow label above the marketing heading. */
  eyebrow: string;
  /** Marketing heading — may contain <em> and <br />. */
  title: React.ReactNode;
  /** Marketing sub-paragraph. */
  subtitle: React.ReactNode;
  /** Three feature bullets. */
  features: AuthFeature[];
}

export default function AuthLayout({
  children,
  bgImage,
  eyebrow,
  title,
  subtitle,
  features,
}: AuthLayoutProps) {
  return (
    <div className="auth-page">
      <header className="auth-topbar">
        <span />
        <Link className="home-back" href="/">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>返回首页</span>
        </Link>
      </header>

      <main className="auth-shell">
        {/* LEFT — marketing panel */}
        <aside className="auth-left">
          <div className="auth-left-bg" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bgImage} alt="" />
          </div>

          <Link className="auth-brand fade-up" href="/" aria-label="返回智愿家首页">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="auth-brand-mark" src="/images/brand-mark.png" alt="" aria-hidden="true" />
            <span className="auth-brand-text">
              <span className="auth-brand-zh">智愿家</span>
              <span className="auth-brand-en">Zhiyuanjia · WillNest</span>
            </span>
          </Link>

          <div className="auth-marketing">
            <span className="eyebrow fade-up d1">
              <span className="dot" />
              {eyebrow}
            </span>

            <h1 className="fade-up d2">{title}</h1>
            <p className="sub fade-up d3">{subtitle}</p>

            <div className="auth-stats fade-up d4" role="list">
              <div className="cell" role="listitem">
                <div className="num">
                  2,237<span className="unit">所</span>
                </div>
                <div className="lbl">在川招生院校</div>
              </div>
              <div className="cell" role="listitem">
                <div className="num">
                  14.4<span className="unit">万 条</span>
                </div>
                <div className="lbl">录取记录</div>
              </div>
              <div className="cell" role="listitem">
                <div className="num">
                  4<span className="unit">年</span>
                </div>
                <div className="lbl">数据纵深</div>
                <div className="sb">2022 — 2025</div>
              </div>
            </div>

            <ul className="auth-features fade-up d5" role="list">
              {features.map((feat) => (
                <li className="feat" key={feat.strong}>
                  <span className="ic" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <span>
                    <strong>{feat.strong}</strong>
                    {feat.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* RIGHT — form panel */}
        <section className="auth-right">
          <div className="auth-form-wrap">{children}</div>
        </section>
      </main>
    </div>
  );
}
