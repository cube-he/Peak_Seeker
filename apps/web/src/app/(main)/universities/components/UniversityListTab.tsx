'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Drawer, Select, Spin, Table, Tooltip, message } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { universityService, type UniversityQueryParams, type UniversityListItem } from '@/services/university';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useStudentRank } from '@/stores/studentRankStore';
import { useUniversityFilters } from '@/stores/universityFilterStore';
import { useWorkStudent, useWorkStudentOptions } from '@/hooks/useWorkStudent';
import { useAuthStore } from '@/stores/authStore';
import { favoriteService } from '@/services/favorite';
import { studentApi } from '@/services/student-api';
import { FIELD_LABELS } from '@/components/student/stage-fields';
import { SubjectToggle } from './shared/SubjectToggle';
import { Empty } from './shared/Empty';
import { SearchIcon } from './shared/Icon';
import { ListCard } from './list/ListCard';
import { ListFiltersPanel } from './list/ListFiltersPanel';
import { SortCluster } from './list/SortCluster';

type ActiveFilter = { key: keyof UniversityQueryParams; label: string };
const FEATURE_LABEL: Record<string, string> = {
  is985: '985 工程',
  is211: '211 工程',
  isDoubleFirstClass: '双一流',
};

/**
 * 全部院校 tab。设计稿:
 * - 顶部 hero(总数 + 985/211/双一流 计数横排)
 * - card:科类切换 + 搜索框 + SortCluster + 可折叠 filter panel
 * - applied chips 行 + 找到 N 所
 * - ListCard 列表
 * - 分页
 */
export function UniversityListTab() {
  const filters = useUniversityFilters((s) => s.filters);
  const setFilters = useUniversityFilters((s) => s.setFilters);
  const [keywordInput, setKeywordInput] = useState(filters.keyword ?? '');
  const debouncedKeyword = useDebouncedValue(keywordInput, 300);
  const examType = useStudentRank((s) => s.examType);
  const setExamType = useStudentRank((s) => s.setExamType);
  const studentRank = useStudentRank((s) => s.rank);

  // ===== 工作台学生上下文 (与专业库共享): 选定学生后位次/科类自动注入, 手填模式兜底 =====
  const {
    isTeacher,
    studentId: workStudentId,
    setStudentId: setWorkStudentId,
    student: workStudent,
    name: workStudentName,
    lane: workLane,
    rank: workRank,
    refetch: refetchWorkStudent,
  } = useWorkStudent();
  const studentOptions = useWorkStudentOptions(isTeacher);
  const effRank: number | null = workRank ?? studentRank ?? null;
  const effExamType = (workLane ?? examType) as '物理' | '历史';

  // 位次清空时重置依赖位次的排序/筛选
  useEffect(() => {
    if (effRank != null) return;
    setFilters((prev) => {
      if (prev.sortBy !== 'tier' && prev.tierFilter == null) return prev;
      return {
        ...prev,
        sortBy: prev.sortBy === 'tier' ? 'name' : prev.sortBy,
        sortOrder: prev.sortBy === 'tier' ? 'asc' : prev.sortOrder,
        tierFilter: undefined,
      };
    });
  }, [effRank, setFilters]);

  // 意向院校 (preferredUniversities, string[] 院校名) — 加入即落库
  const uniPool: string[] = Array.isArray(workStudent?.preferredUniversities)
    ? workStudent.preferredUniversities
    : [];
  const addUniToPool = async (u: UniversityListItem) => {
    if (!workStudentId) return;
    if (uniPool.includes(u.name)) {
      message.info(`「${u.name}」已在意向院校`);
      return;
    }
    try {
      await studentApi.update(workStudentId, { preferredUniversities: [...uniPool, u.name] } as any);
      message.success(`已把「${u.name}」加入${workStudentName ? ` ${workStudentName} 的` : ''}意向院校`);
      refetchWorkStudent();
    } catch {
      message.error('保存失败，请重试');
    }
  };

  // ===== 收藏 (与 /favorites 同体系, type=university) =====
  const { isLoggedIn } = useAuthStore();
  const queryClient = useQueryClient();
  const { data: favData } = useQuery({
    queryKey: ['favorites', 'university'],
    queryFn: () => favoriteService.getList('university'),
    enabled: isLoggedIn,
  });
  const favByUniId = useMemo(() => {
    const map = new Map<number, number>();
    const list = (favData as any)?.data ?? favData ?? [];
    for (const f of Array.isArray(list) ? list : []) {
      if (f.universityId) map.set(f.universityId, f.id);
    }
    return map;
  }, [favData]);
  const toggleFav = async (u: UniversityListItem) => {
    if (!isLoggedIn) {
      message.info('登录后即可收藏院校');
      return;
    }
    const favId = favByUniId.get(u.id);
    try {
      if (favId) {
        await favoriteService.remove(favId);
        message.success(`已取消收藏「${u.name}」`);
      } else {
        await favoriteService.add({ type: 'university', universityId: u.id });
        message.success(`已收藏「${u.name}」`);
      }
      queryClient.invalidateQueries({ queryKey: ['favorites', 'university'] });
    } catch {
      message.error('收藏操作失败，请重试');
    }
  };

  // ===== 对比 (2-4 所) =====
  const [compareList, setCompareList] = useState<UniversityListItem[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const toggleCompare = (u: UniversityListItem) => {
    setCompareList((prev) => {
      if (prev.some((c) => c.id === u.id)) return prev.filter((c) => c.id !== u.id);
      if (prev.length >= 4) {
        message.warning('最多同时对比 4 所院校');
        return prev;
      }
      return [...prev, u];
    });
  };

  useEffect(() => {
    setFilters((prev) => ({ ...prev, keyword: debouncedKeyword || undefined, page: 1 }));
  }, [debouncedKeyword, setFilters]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['universities', filters, effExamType, effRank],
    queryFn: () =>
      universityService.getList({
        ...filters,
        examType: effExamType,
        userRank: effRank ?? undefined,
      }),
  });

  const universities = data?.data || [];
  const total = data?.pagination?.total || 0;
  const pageSize = filters.pageSize ?? 12;
  const page = filters.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 985/211/双一流 横排: 走真实统计接口 (后端 1 天缓存), 加载前用历史值占位
  const { data: statsData } = useQuery({
    queryKey: ['university-stats'],
    queryFn: () => universityService.getStats(),
    staleTime: 3600_000,
  });
  const elite985 = statsData?.n985 ?? 39;
  const elite211 = statsData?.n211 ?? 116;
  const eliteDfc = statsData?.nDoubleFirstClass ?? 147;

  const applied = useMemo<ActiveFilter[]>(() => {
    const items: ActiveFilter[] = [];
    if (filters.province) items.push({ key: 'province', label: filters.province });
    if (filters.city) items.push({ key: 'city', label: filters.city });
    if (filters.type) items.push({ key: 'type', label: filters.type });
    if (filters.nature) items.push({ key: 'nature', label: filters.nature });
    if (filters.level) items.push({ key: 'level', label: filters.level });
    if (filters.is985) items.push({ key: 'is985', label: FEATURE_LABEL.is985 });
    if (filters.is211) items.push({ key: 'is211', label: FEATURE_LABEL.is211 });
    if (filters.isDoubleFirstClass) items.push({ key: 'isDoubleFirstClass', label: FEATURE_LABEL.isDoubleFirstClass });
    if (filters.tierFilter) {
      const m = { rush: '冲一冲', stable: '稳一稳', safe: '保一保' } as const;
      items.push({ key: 'tierFilter', label: `录取概率:${m[filters.tierFilter as keyof typeof m]}` });
    }
    if (filters.hasTag) items.push({ key: 'hasTag', label: filters.hasTag });
    return items;
  }, [filters]);

  const removeFilter = (key: keyof UniversityQueryParams) => {
    const next: UniversityQueryParams = { ...filters, [key]: undefined, page: 1 };
    if (key === 'province') next.city = undefined;
    setFilters(next);
  };

  const clearAll = () => {
    setFilters({
      page: 1,
      pageSize,
      keyword: filters.keyword,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });
  };

  // 分页按钮序列(...省略中间页)
  const pageButtons = useMemo(() => {
    const items: Array<number | 'gap'> = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
        items.push(i);
      } else if (i === 2 || i === totalPages - 1) {
        items.push('gap');
      }
    }
    return items;
  }, [page, totalPages]);

  return (
    <div className="fade-up">
      {/* —— Page hero —— */}
      <div
        style={{
          padding: '24px 0 18px',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 18,
          flexWrap: 'wrap',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-heading)',
            fontWeight: 600,
            fontSize: 24,
            color: 'var(--text)',
            letterSpacing: '-.005em',
            lineHeight: 1.2,
          }}
        >
          <span style={{ color: 'var(--accent)' }}>{total.toLocaleString()}</span>
          <span style={{ marginLeft: 8, color: 'var(--text-tertiary)', fontSize: 15, fontWeight: 400 }}>
            所院校 · 在川招生
          </span>
        </h1>
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <EliteCount value={elite985} label="所 985" />
          <EliteCount value={elite211} label="所 211" />
          <EliteCount value={eliteDfc} label="所双一流" />
        </div>
      </div>

      {/* —— 老师工作台: 选定学生后位次/科类自动注入, 冲稳保筛选直接生效 —— */}
      {isTeacher && (
        <div
          style={{
            padding: '12px 18px',
            marginBottom: 14,
            background: 'var(--accent-fixed)',
            border: '1px solid rgba(184,134,11,.25)',
            borderRadius: 12,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>为学生选学校</span>
          <Select
            showSearch
            allowClear
            size="small"
            placeholder="选择学生（可按姓名搜索）"
            style={{ minWidth: 240 }}
            options={studentOptions}
            value={workStudentId ?? undefined}
            optionFilterProp="label"
            onChange={(v) => setWorkStudentId(v ?? null)}
          />
          {workStudentId && workStudent ? (
            <>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {workLane ? `${workLane}类` : ''}
                {workRank ? ` · 位次 ${workRank.toLocaleString()}` : ''}
                {` · 意向院校 ${uniPool.length} 所`}
                <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>位次/科类已按学生注入</span>
              </span>
              {workStudent.progress &&
                (workStudent.progress.isRecommendable ? (
                  <Link href={`/teacher/plans/generate/${workStudentId}`}>
                    <Button size="small" type="primary">去生成方案 →</Button>
                  </Link>
                ) : (
                  <Tooltip
                    title={`还缺: ${(workStudent.progress.missingFieldsForRecommend ?? [])
                      .map((f: string) => FIELD_LABELS[f] ?? f)
                      .join('、')}`}
                  >
                    <Link href={`/teacher/students/${workStudentId}`}>
                      <Button size="small" danger>
                        资料缺 {(workStudent.progress.missingFieldsForRecommend ?? []).length} 项 · 去补全
                      </Button>
                    </Link>
                  </Tooltip>
                ))}
            </>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              选择学生后位次/科类自动注入，院校卡片可一键加入其意向院校
            </span>
          )}
        </div>
      )}

      {/* —— Toolbar card —— */}
      <div
        style={{
          padding: '14px 18px',
          marginBottom: 16,
          background: 'var(--surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <SubjectToggle
            value={effExamType}
            onChange={
              workLane
                ? () => message.info(`已按学生科类（${workLane}类）锁定，清除学生后可手动切换`)
                : setExamType
            }
          />
          <div style={{ width: 1, height: 22, background: 'var(--border)', alignSelf: 'center' }} />
          <div style={{ position: 'relative', flex: '1 1 300px', minWidth: 240 }}>
            <span
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                width: 14,
                height: 14,
                pointerEvents: 'none',
              }}
            >
              <SearchIcon />
            </span>
            <input
              type="text"
              placeholder="搜索学校 / 城市 / 关键词,例如:成都、医科、政法"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 34px',
                fontSize: 13.5,
                border: '1px solid var(--border)',
                background: 'var(--surface-dim)',
                color: 'var(--text)',
                borderRadius: 8,
                outline: 'none',
                height: 36,
                transition: 'all .2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--primary)';
                e.target.style.background = '#fff';
                e.target.style.boxShadow = '0 0 0 3px rgba(30,58,95,.10)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border)';
                e.target.style.background = 'var(--surface-dim)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>
          <SortCluster filters={filters} setFilters={setFilters} />
        </div>
        <ListFiltersPanel filters={filters} setFilters={setFilters} studentRank={effRank} />
      </div>

      {/* —— Applied chips + 总数 —— */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          找到{' '}
          <strong style={{ fontFamily: 'var(--font-heading)', fontSize: 18, color: 'var(--text)' }}>{total}</strong>{' '}
          所院校
          <span style={{ color: 'var(--text-faint)', marginLeft: 8 }}>
            第 {page} 页 / 共 {totalPages} 页 · 每页 {pageSize} 所
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {applied.length === 0 ? (
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-faint)',
                padding: '3px 10px',
                border: '1px dashed var(--border)',
                borderRadius: 999,
              }}
            >
              未限定条件
            </span>
          ) : (
            <>
              {applied.map((a) => (
                <button
                  key={a.key as string}
                  type="button"
                  className="applied-chip"
                  onClick={() => removeFilter(a.key)}
                >
                  {a.label}
                  <span className="x">×</span>
                </button>
              ))}
              <button
                type="button"
                onClick={clearAll}
                style={{
                  background: 'transparent',
                  border: 0,
                  fontSize: 11.5,
                  color: 'var(--text-muted)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                清除全部
              </button>
            </>
          )}
        </div>
      </div>

      {/* —— List —— */}
      {isLoading ? (
        <div className="card" style={{ padding: 80, display: 'flex', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      ) : isError ? (
        <div className="card" style={{ padding: 24 }}>
          <Alert
            type="error"
            showIcon
            message="院校数据加载失败"
            description={(error as Error)?.message || '请稍后刷新重试。'}
          />
        </div>
      ) : universities.length === 0 ? (
        <Empty msg="暂无匹配的院校,试试放宽筛选条件" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {universities.map((uni: UniversityListItem) => (
            <ListCard
              key={uni.id}
              uni={uni}
              userRank={effRank}
              examType={effExamType}
              favorited={favByUniId.has(uni.id)}
              onToggleFav={toggleFav}
              inCompare={compareList.some((c) => c.id === uni.id)}
              onToggleCompare={toggleCompare}
              poolEnabled={isTeacher && !!workStudentId}
              inPool={uniPool.includes(uni.name)}
              onAddToPool={addUniToPool}
            />
          ))}
        </div>
      )}

      {/* —— Pagination —— */}
      {totalPages > 1 && (
        <div className="pagn">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => {
              setFilters({ ...filters, page: page - 1 });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            ‹ 上一页
          </button>
          {pageButtons.map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className="gap">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={p === page ? 'is-active' : ''}
                onClick={() => {
                  setFilters({ ...filters, page: p });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            disabled={page === totalPages}
            onClick={() => {
              setFilters({ ...filters, page: page + 1 });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            下一页 ›
          </button>
        </div>
      )}

      {/* —— 对比浮条 —— */}
      {compareList.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--primary)',
            color: '#fff',
            borderRadius: 999,
            padding: '8px 16px',
            boxShadow: '0 8px 24px rgba(0,0,0,.25)',
          }}
        >
          {compareList.map((c) => (
            <span
              key={c.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(255,255,255,.15)',
                borderRadius: 999,
                padding: '2px 10px',
                fontSize: 12,
              }}
            >
              {c.name}
              <span style={{ cursor: 'pointer', fontSize: 10 }} onClick={() => toggleCompare(c)}>✕</span>
            </span>
          ))}
          <button
            type="button"
            disabled={compareList.length < 2}
            onClick={() => setCompareOpen(true)}
            style={{
              border: 0,
              borderRadius: 999,
              padding: '4px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: compareList.length >= 2 ? 'pointer' : 'not-allowed',
              background: compareList.length >= 2 ? 'var(--accent)' : 'rgba(255,255,255,.2)',
              color: compareList.length >= 2 ? '#fff' : 'rgba(255,255,255,.5)',
            }}
          >
            对比 ({compareList.length})
          </button>
          <button
            type="button"
            onClick={() => setCompareList([])}
            style={{ border: 0, background: 'transparent', color: 'rgba(255,255,255,.6)', fontSize: 12, cursor: 'pointer' }}
          >
            清空
          </button>
        </div>
      )}

      {/* —— 对比抽屉: 指标做行、院校做列 —— */}
      <Drawer
        title={`院校对比 (${compareList.length})`}
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        width={Math.min(300 + compareList.length * 220, 1180)}
      >
        <Table
          size="small"
          bordered
          pagination={false}
          rowKey="metric"
          columns={[
            { title: '指标', dataIndex: 'metric', width: 110, fixed: 'left' as const },
            ...compareList.map((u, i) => ({
              title: (
                <Link href={`/universities/${u.id}`} style={{ color: 'var(--primary)' }}>
                  {u.name}
                </Link>
              ),
              dataIndex: `v${i}`,
              width: 200,
              render: (v: any) => (v == null || v === '' ? <span style={{ color: 'var(--text-muted)' }}>--</span> : v),
            })),
          ]}
          dataSource={buildUniCompareRows(compareList, effExamType)}
        />
      </Drawer>
    </div>
  );
}

// 对比行: 值取列表接口已返回的字段 (含在川物化统计), 无额外请求
function buildUniCompareRows(list: UniversityListItem[], examType: '物理' | '历史') {
  const rows: Array<[string, (u: UniversityListItem) => any]> = [
    ['标签', (u) => [u.is985 && '985', u.is211 && '211', u.isDoubleFirstClass && '双一流'].filter(Boolean).join(' / ') || '—'],
    ['类型', (u) => u.type],
    ['省市', (u) => (u.province && u.city && u.province !== u.city ? `${u.province} · ${u.city}` : u.province ?? u.city)],
    ['办学性质', (u) => u.runningNature],
    ['层次', (u) => u.level],
    ['软科排名', (u) => (u.softRanking != null ? `${u.softRankList ?? ''} #${u.softRanking}` : null)],
    [`${examType}类最低分`, (u) => u.latestAdmission?.minScore],
    [`${examType}类最低位次`, (u) => u.latestAdmission?.minRank?.toLocaleString()],
    ['预测最低位次', (u) => u.predictedMinRank?.toLocaleString()],
    ['在川计划', (u) => (u.scPlanCount != null ? `${u.scPlanCount} 人 · ${u.scGroupCount ?? '-'} 组` : null)],
    ['招生批次', (u) => u.scBatches],
    ['去年征集', (u) => (u.scSupplCount ? `${u.scSupplCount} 人（未录满）` : null)],
  ];
  return rows.map(([metric, fn]) => {
    const row: Record<string, any> = { metric };
    list.forEach((u, i) => {
      row[`v${i}`] = fn(u);
    });
    return row;
  });
}

function EliteCount({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <strong style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-heading)' }}>
        {value}
      </strong>{' '}
      {label}
    </span>
  );
}
