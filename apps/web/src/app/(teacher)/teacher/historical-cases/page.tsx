'use client';

/**
 * 教师工作台 · 历史案例 (列表)
 * 复刻自 `WillNest Design System/teacher/views/history.jsx` 的 ViewHistory.
 * className: stat-cluster / hf-bar / h-tbl.
 * 详情页 [id]/page.tsx 暂保留现有 antd 版本 (工作量大且功能完整).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Spin } from 'antd';
import {
  historicalCasesApi,
  type HistoricalCaseListItem,
} from '@/services/historical-cases-api';
import { PageHeader, TIcon } from '@/components/willnest';

const EXAM_TXT: Record<string, string> = {
  PHYSICS: '物理类',
  HISTORY: '历史类',
};

export default function HistoricalCasesPage() {
  const [year, setYear] = useState<string>('all');
  const [exam, setExam] = useState<'all' | 'PHYSICS' | 'HISTORY'>('all');
  const [scoreMin, setScoreMin] = useState<string>('');
  const [scoreMax, setScoreMax] = useState<string>('');
  const [kw, setKw] = useState<string>('');
  const page = 1;
  const pageSize = 200;

  // stats 不带年份过滤拿一次, 供 stat-cluster 顶部展示
  const { data: stats } = useQuery({
    queryKey: ['historical-stats'],
    queryFn: () => historicalCasesApi.stats(undefined),
  });

  const { data: listData, isLoading } = useQuery({
    queryKey: ['historical-list', year, exam, scoreMin, scoreMax, kw, page],
    queryFn: () =>
      historicalCasesApi.list({
        examYear: year === 'all' ? undefined : Number(year),
        examType: exam === 'all' ? undefined : exam,
        scoreFrom: scoreMin ? Number(scoreMin) : undefined,
        scoreTo: scoreMax ? Number(scoreMax) : undefined,
        keyword: kw.trim() || undefined,
        page,
        pageSize,
      }),
  });

  const filtered: HistoricalCaseListItem[] = (listData as any)?.data ?? [];

  // 年份过滤桶: backend stats 里有 byExamYear 字段可用, 没有则 fallback 静态
  const yearCounts = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = { all: stats?.total ?? 0 };
    const byYear = (stats as any)?.byExamYear ?? {};
    Object.entries(byYear).forEach(([y, c]) => {
      m[String(y)] = Number(c);
    });
    return m;
  }, [stats]);

  const years: (string | number)[] = useMemo(() => {
    const byYear = stats?.byExamYear ?? {};
    const ys = Object.keys(byYear)
      .map(Number)
      .filter((value) => Number.isInteger(value))
      .sort((a, b) => b - a);
    return ['all', ...ys];
  }, [stats]);

  return (
    <div className="view-transition">
      <PageHeader
        eyebrow="ARCHIVE"
        title="历史案例"
        meta={
          <>
            <span>往届学生的志愿填报 + 录取结果归档</span>
            <span className="dot" />
            <span>用于参考相似分数学生填了哪、录取在哪</span>
          </>
        }
        fresh=""
      />

      {/* —— 统计概览 4 chip —— */}
      <div className="stat-cluster fade-up d1">
        <div className="scell t-primary">
          <div className="k">案例总数</div>
          <div className="v">
            {stats?.total ?? '--'}
            <span className="small">条</span>
          </div>
          <div className="sub">
            {year === 'all' ? '全部年份归档' : `${year} 届 · ${yearCounts[year] ?? 0} 条`}
          </div>
        </div>
        <div className="scell t-safe">
          <div className="k">物理类 / 历史类</div>
          <div className="v">
            {stats?.byExamType.PHYSICS ?? 0}
            <span className="small">/ {stats?.byExamType.HISTORY ?? 0}</span>
          </div>
          <div className="sub">按 2024 选考改革后科类</div>
        </div>
        <div className="scell t-accent">
          <div className="k">平均分差</div>
          <div className="v">
            {stats?.avgScoreDiff != null && stats.avgScoreDiff >= 0 ? '+' : ''}
            {stats?.avgScoreDiff ?? '--'}
            <span className="small">分</span>
          </div>
          <div className="sub">
            有效样本 {stats?.sampleSize ?? 0} 条 · 录取分 vs 学生分
          </div>
        </div>
        <div className="scell t-primary">
          <div className="k">高频录取院校 Top 3</div>
          <ul>
            {(stats?.topUniversities ?? []).slice(0, 3).map((u) => (
              <li key={u.name}>
                <span className="uniName">{u.name}</span>
                <span className="cnt">{u.count} 条</span>
              </li>
            ))}
            {(!stats || stats.topUniversities.length === 0) && (
              <li>
                <span className="uniName">暂无</span>
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* —— 过滤栏 —— */}
      <div className="hf-bar fade-up d2">
        <div className="group">
          <span className="group-label">年份</span>
          {years.map((y) => (
            <button
              key={y}
              type="button"
              className={`yr-chip ${String(year) === String(y) ? 'is-active' : ''}`}
              onClick={() => setYear(String(y))}
            >
              {y === 'all' ? '全部' : `${y} 届`}
              <span className="n">{yearCounts[String(y)] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="group">
          <span className="group-label">科类</span>
          <select value={exam} onChange={(e) => setExam(e.target.value as any)}>
            <option value="all">不限</option>
            <option value="PHYSICS">物理类</option>
            <option value="HISTORY">历史类</option>
          </select>
        </div>
        <div className="group">
          <span className="group-label">分数</span>
          <input
            placeholder="下限"
            value={scoreMin}
            onChange={(e) => setScoreMin(e.target.value)}
          />
          <span style={{ color: 'var(--text-muted)' }}>—</span>
          <input
            placeholder="上限"
            value={scoreMax}
            onChange={(e) => setScoreMax(e.target.value)}
          />
        </div>
        <div className="group" style={{ marginLeft: 'auto' }}>
          <span className="group-label">关键词</span>
          <span className="input-wrap">
            <TIcon.search />
            <input
              className="kw"
              placeholder="姓名 / 大学 / 专业"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
            />
          </span>
        </div>
      </div>

      {/* —— 数据表 —— */}
      {isLoading ? (
        <div className="view-transition" style={{ padding: 80, textAlign: 'center' }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <div className="h-tbl fade-up d3">
            <div className="h-tbl-head">
              <span>学生</span>
              <span>选科</span>
              <span>总分</span>
              <span>位次</span>
              <span>录取大学</span>
              <span>专业组</span>
              <span>录取专业</span>
              <span>批次</span>
              <span>分差</span>
              <span>顺位</span>
              <span>老师</span>
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                没有符合条件的案例 · 试试调整年份或分数范围
              </div>
            ) : (
              filtered.map((c) => {
                const ar = c.admissionResult;
                const name = c.user?.realName ?? c.user?.username ?? '学生';
                const teacherName =
                  c.teacher?.user?.realName ?? c.teacher?.user?.username ?? '—';
                const subjects = `${c.firstChoice ?? '--'}/${
                  Array.isArray(c.reChoices) ? c.reChoices.join('') : '--'
                }`;
                const isEarly = ar?.batchName?.includes('提前') ?? false;
                const diff = ar?.scoreDiff;
                return (
                  <Link
                    href={`/teacher/historical-cases/${c.id}`}
                    className="h-tbl-row"
                    key={c.id}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <span className="name">
                      {name}
                      {c.examYear ? (
                        <span
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: 10.5,
                            marginLeft: 4,
                            fontFamily: 'var(--font-body)',
                            fontWeight: 400,
                          }}
                        >
                          {c.examYear}
                        </span>
                      ) : null}
                    </span>
                    <div className="subj">
                      <div>
                        <span className="em">
                          {c.examType ? EXAM_TXT[c.examType] : '—'}
                        </span>
                      </div>
                      <div>{subjects}</div>
                    </div>
                    <span className="score">{c.totalScore ?? '--'}</span>
                    <span className="rank">
                      {c.provincialRank != null
                        ? c.provincialRank.toLocaleString()
                        : '--'}
                    </span>
                    <span className="uname">{ar?.admittedUniName ?? '未录取'}</span>
                    <span>
                      {ar?.admittedMajorGroupCode ? (
                        <span className="grp">{ar.admittedMajorGroupCode}</span>
                      ) : (
                        '—'
                      )}
                    </span>
                    <span className="major">{ar?.admittedMajorName ?? '—'}</span>
                    <span>
                      {ar?.batchName ? (
                        <span className={`batch ${isEarly ? 'early' : ''}`}>
                          {ar.batchName}
                        </span>
                      ) : (
                        '—'
                      )}
                    </span>
                    <span className={`diff ${(diff ?? 0) >= 0 ? 'up' : 'down'}`}>
                      {diff == null ? '—' : (diff >= 0 ? '+' : '') + diff}
                    </span>
                    <span className="order">{ar?.sequenceNo ?? '—'}</span>
                    <span className="teacher">
                      <span className="av">{teacherName.charAt(0)}</span>
                      {teacherName}
                    </span>
                  </Link>
                );
              })
            )}
          </div>

          <div
            style={{
              marginTop: 20,
              display: 'flex',
              justifyContent: 'center',
              gap: 4,
              fontSize: 12.5,
              color: 'var(--text-tertiary)',
            }}
          >
            <span>共 {filtered.length} 条</span>
          </div>
        </>
      )}
    </div>
  );
}
