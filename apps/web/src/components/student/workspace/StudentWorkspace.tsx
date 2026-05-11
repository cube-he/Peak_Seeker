'use client';

interface StudentWorkspaceProps {
  rail: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

interface StudentWorkspacePanelProps {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function StudentWorkspace({
  rail,
  aside,
  children,
  className = '',
}: StudentWorkspaceProps) {
  const columnsClass = aside
    ? 'lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_300px]'
    : 'lg:grid-cols-[250px_minmax(0,1fr)]';

  return (
    <div
      className={`grid w-full gap-5 ${columnsClass} ${className}`}
    >
      <aside aria-label="学生工作台导航" className="hidden lg:block">
        {rail}
      </aside>
      <main className="min-w-0" role="main">
        {children}
      </main>
      {aside ? (
        <aside aria-label="学生工作台辅助信息" className="hidden xl:block">
          <div className="sticky top-20 space-y-4">{aside}</div>
        </aside>
      ) : null}
    </div>
  );
}

export function StudentWorkspacePanel({
  title,
  action,
  children,
  className = '',
}: StudentWorkspacePanelProps) {
  return (
    <section className={`rounded-xl bg-surface px-5 py-4 shadow-card ${className}`}>
      {title || action ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? (
            <h2 className="m-0 font-serif text-base font-semibold text-text">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
