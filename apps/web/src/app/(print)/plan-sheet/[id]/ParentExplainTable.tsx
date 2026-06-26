'use client';

import styles from './ParentExplainTable.module.css';
import type { ExportSheet, ExportMajor } from './types';

// 梯度中文 → CSS class(底色)
const GRADIENT_CLASS: Record<string, string> = { 冲: 'rush', 稳: 'stable', 保: 'safe' };

function dash(v: unknown) {
  return v === null || v === undefined || v === '' ? '—' : String(v);
}

function YearPlanCell({ major, year }: { major: ExportMajor; year: number }) {
  const plan = major.planByYear[year];
  const supp = major.suppByYear[year];
  return (
    <>
      {plan === null || plan === undefined ? '—' : plan}
      {supp ? <span className={styles.supp}>（征{supp.rounds}轮·{supp.count}人）</span> : null}
    </>
  );
}

export default function ParentExplainTable({ sheet }: { sheet: ExportSheet }) {
  const { years } = sheet;
  return (
    <div className={styles.sheet}>
      <h1 className={styles.title}>
        {sheet.student.name} · {sheet.plan.batchName ?? ''}志愿方案（家长版）
      </h1>
      <div className={styles.meta}>
        {sheet.student.examTypeLabel} · {dash(sheet.student.score)} 分 · 位次 {dash(sheet.student.rank)} · {sheet.plan.name}
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>顺位</th>
            <th>梯度</th>
            <th>院校名称</th>
            <th>院校代码</th>
            <th>办学性质</th>
            <th>学校标签</th>
            <th>所在城市</th>
            <th>院校排名</th>
            <th>专业组</th>
            <th>专业代码</th>
            <th>专业名称</th>
            <th>26计划</th>
            {years.map((y) => (
              <th key={`ph${y}`}>{String(y).slice(2)}计划</th>
            ))}
            {years.map((y) => (
              <th key={`sh${y}`}>{String(y).slice(2)}最低分</th>
            ))}
            <th>学制</th>
            <th>学费</th>
            <th className={styles.notesHead}>专业备注</th>
          </tr>
        </thead>
        <tbody>
          {sheet.groups.map((g, gi) => {
            const tone = GRADIENT_CLASS[g.gradientLabel] ?? 'rush';
            return g.majors.map((m, mi) => (
              <tr key={`${gi}-${mi}`} className={styles[tone]}>
                {mi === 0 && (
                  <>
                    <td rowSpan={g.majors.length} className={styles.merge}>
                      {String(g.sequence).padStart(2, '0')}
                    </td>
                    <td rowSpan={g.majors.length} className={`${styles.merge} ${styles.gradeCell}`}>
                      {g.gradientLabel}
                    </td>
                    <td rowSpan={g.majors.length} className={`${styles.merge} ${styles.uniName}`}>
                      {dash(g.universityName)}
                      {g.fallback ? <span className={styles.fallback}>·快照</span> : null}
                    </td>
                    <td rowSpan={g.majors.length} className={styles.merge}>{dash(g.universityCode)}</td>
                    <td rowSpan={g.majors.length} className={styles.merge}>{dash(g.schoolNature)}</td>
                    <td rowSpan={g.majors.length} className={styles.merge}>{dash(g.schoolTags)}</td>
                    <td rowSpan={g.majors.length} className={styles.merge}>{dash(g.city)}</td>
                    <td rowSpan={g.majors.length} className={styles.merge}>{dash(g.universityRank)}</td>
                    <td rowSpan={g.majors.length} className={styles.merge}>
                      {dash(g.groupCode)}
                      <div className={styles.groupPlan}>组招 {dash(g.groupPlanCount)} 人</div>
                    </td>
                  </>
                )}
                <td>{dash(m.majorCode)}</td>
                <td className={styles.majorName}>
                  {dash(m.majorName)}
                  {m.bookPageNumber != null ? (
                    <span className={styles.page}>P.{m.bookPageNumber}</span>
                  ) : null}
                </td>
                <td>{dash(m.planCount)}</td>
                {years.map((y) => (
                  <td key={`p${y}`}>
                    <YearPlanCell major={m} year={y} />
                  </td>
                ))}
                {years.map((y) => (
                  <td key={`s${y}`}>{dash(m.minScoreByYear[y])}</td>
                ))}
                <td>{dash(m.duration)}</td>
                <td>{dash(m.tuition)}</td>
                <td className={styles.notes}>{dash(m.planNotes)}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}
