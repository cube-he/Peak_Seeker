/**
 * 各 tab 顶部的"导引区":eyebrow + h1(带高亮数字) + lead 文案。
 * styles.css 提供 .page-head / .page-head .eyebrow / .page-head h1 / .page-head h1 .num / .page-head .lead
 */
import type { ReactNode } from 'react';

interface PageHeadProps {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
}

export function PageHead({ eyebrow, title, lead }: PageHeadProps) {
  return (
    <div className="page-head">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      {lead && <p className="lead">{lead}</p>}
    </div>
  );
}
