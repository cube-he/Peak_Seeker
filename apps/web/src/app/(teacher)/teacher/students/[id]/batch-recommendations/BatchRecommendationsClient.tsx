'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  batchRecommendationsApi,
  type BatchRecommendation,
  type BatchRecommendationsResponse,
  type StudentSummary,
} from '@/services/batch-recommendations-api';
import { BatchCard } from './BatchCard';
import { TIcon } from './icons';
import { EXAM_TYPE_LABEL, VERDICT_ORDER, fmtTime } from './maps';
import './batch-rec.css';

/**
 * 批次推荐页 (老师端) — WillNest 视觉系统复刻.
 * 严格按 docs/superpowers/specs/2026-06-04-batch-recommendation-page-redesign-brief.md 契约:
 *   §7 区块 / §8 枚举 / §9 边界态 / §10 交互 / §11 不可破坏契约.
 */
export function BatchRecommendationsClient({ studentId }: { studentId: number }) {
  const router = useRouter();
  const [data, setData] = useState<BatchRecommendationsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [kw, setKw] = useState('');

  useEffect(() => {
    batchRecommendationsApi
      .fetch(studentId)
      .then((r) => {
        setData(r);
        if (Array.isArray(r.preferredBatches) && r.preferredBatches.length > 0) {
          setSelected(new Set(r.preferredBatches));
        }
      })
      .catch((e) => setLoadError(String(e?.response?.data?.message ?? e?.message ?? e)));
  }, [studentId]);

  // —— 派生: 全选符合资格 (§7.5: 只含 ELIGIBLE + CONDITIONAL, 不含 DATA_PENDING) ——
  const eligibleForAll = useMemo(() => {
    if (!data) return [] as BatchRecommendation[];
    return data.batches.filter(b => b.verdict === 'ELIGIBLE' || b.verdict === 'CONDITIONAL');
  }, [data]);

  // —— 搜索 + 三段归属 (§7.6) ——
  const sectioned = useMemo(() => {
    if (!data) return { sel: [] as BatchRecommendation[], el: [] as BatchRecommendation[], ie: [] as BatchRecommendation[] };
    const q = kw.trim();
    const match = (b: BatchRecommendation) => !q || b.batchName.includes(q);
    const shown = data.batches.filter(match);
    const sel = shown.filter(b => selected.has(b.batchName));
    const el = shown
      .filter(b => !selected.has(b.batchName) && ['ELIGIBLE', 'CONDITIONAL', 'DATA_PENDING'].includes(b.verdict))
      .sort((a, b) => (VERDICT_ORDER[a.verdict] ?? 9) - (VERDICT_ORDER[b.verdict] ?? 9));
    const ie = shown.filter(b => !selected.has(b.batchName) && b.verdict === 'INELIGIBLE');
    return { sel, el, ie };
  }, [data, selected, kw]);

  // —— actions ——
  const toggleBatch = (name: string) => {
    setSelected(s => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name); else n.add(name);
      return n;
    });
    setSubmitError(null);
  };
  const selectAll = () => { setSelected(new Set(eligibleForAll.map(b => b.batchName))); setSubmitError(null); };
  const clearAll = () => { setSelected(new Set()); setSubmitError(null); };
  const goBack = () => router.push(`/teacher/students/${studentId}`);

  const handleSubmit = async () => {
    if (!data) return;
    if (selected.size === 0) { setSubmitError('至少选定 1 个批次'); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await batchRecommendationsApi.confirm(studentId, Array.from(selected), note || undefined);
      router.push(`/teacher/students/${studentId}`);
    } catch (e: any) {
      setSubmitError(String(e?.response?.data?.message ?? e?.message ?? e));
      setSubmitting(false);
    }
  };

  const handleUnlock = async () => {
    if (!confirm('确认解锁? 学生会回到「需修改资料」状态, 且会影响方案生成页的可用批次。')) return;
    setSubmitting(true);
    try {
      await batchRecommendationsApi.unlock(studentId);
      const fresh = await batchRecommendationsApi.fetch(studentId);
      setData(fresh);
      setSelected(new Set(fresh.preferredBatches ?? []));
      setSubmitError(null);
    } catch (e: any) {
      setSubmitError(String(e?.response?.data?.message ?? e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  // —— §9.1 加载中 ——
  if (!data && !loadError) {
    return (
      <div className="br-page">
        <div className="br-loading">
          <div className="br-spinner"/>
          <div className="skeleton-line">加载中…</div>
        </div>
      </div>
    );
  }
  // —— §9.2 API 加载失败 ——
  if (loadError) {
    return (
      <div className="br-page">
        <div className="br-error">
          <span className="ic"><TIcon.alert/></span>
          <div className="body">
            <div className="ttl">加载失败</div>
            <div className="msg">{loadError}</div>
          </div>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const locked = !!data.batchesConfirmedAt;
  const submitDisabled = submitting || selected.size === 0 || (data.intakeGap && data.intakeGap.ok === false);
  const submitLabel = data.intakeGap && data.intakeGap.ok === false ? '资料未完成 - 无法确认' : '确认并提交';

  return (
    <div className="br-page">
      {/* 面包屑 */}
      <div className="br-crumb">
        <button onClick={goBack}><TIcon.chevLeft/> 返回学生详情</button>
        <span className="sep">/</span>
        <span>批次推荐</span>
      </div>

      {/* §9.6 提交失败 - 顶部错误区 */}
      {submitError && (
        <div className="br-error">
          <span className="ic"><TIcon.alert/></span>
          <div className="body">
            <div className="ttl">提交失败</div>
            <div className="msg">{submitError}</div>
          </div>
        </div>
      )}

      {/* §7.1 学生概览条 */}
      <Overview student={data.student}/>

      {/* §7.2 锁定提示条 */}
      {locked && (
        <div className="br-lock">
          <span className="ic"><TIcon.shield/></span>
          <div className="body">
            <div className="ttl">已锁定 · 确认于 <span className="when">{fmtTime(data.batchesConfirmedAt)}</span></div>
            {data.student.intakeReviewComment && (
              <div className="cmt">上次备注：{data.student.intakeReviewComment}</div>
            )}
          </div>
          <button className="br-unlock-btn" onClick={handleUnlock} disabled={submitting}>
            <TIcon.upload/> 重新打开
          </button>
        </div>
      )}

      {/* §7.3 标题行 + 说明条 */}
      <div className="br-titlerow">
        <div>
          <span className="eyebrow">BATCH ELIGIBILITY</span>
          <h1>批次推荐</h1>
        </div>
        <span className="back-link" onClick={goBack}><TIcon.arrowRight/> 返回学生详情</span>
      </div>
      <div className="br-note">
        <span className="ic"><TIcon.info/></span>
        <div>
          勾选某批次 = 让方案生成可用该批次下<strong>所有「资格通过」</strong>的子类别 (例如本科批会包含普通类等)。
          点批次卡片可展开看子类别 + 相关政策文件。<strong>本页只判定「资格」, 不计算录取概率</strong>, 分数仅作过线参考。
        </div>
      </div>

      {/* §7.4 资料缺失警告框 */}
      {data.intakeGap && data.intakeGap.ok === false && (
        <div className="br-gapwarn">
          <span className="ic"><TIcon.alert/></span>
          <div className="body">
            <div className="ttl">学生关键资料未完成 — 当前判定可能不准</div>
            <div className="miss">
              <span>缺失字段:</span>
              {(data.intakeGap.missing ?? []).map(m => (
                <span className="mchip" key={m.field}>{m.label}</span>
              ))}
            </div>
            <div className="go" onClick={goBack}>→ 跳学生详情页催补资料</div>
          </div>
        </div>
      )}

      {/* §7.5 工具条 */}
      <div className="br-toolbar">
        <span className="br-search">
          <TIcon.search/>
          <input
            placeholder="搜批次名 (例如: 高职 / 本科批)"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
          />
        </span>
        <button className="br-tool-btn primary" onClick={selectAll} disabled={locked || submitting}>
          <TIcon.check/> 全选符合资格 <span className="n">{eligibleForAll.length}</span>
        </button>
        <button className="br-tool-btn" onClick={clearAll} disabled={locked || submitting || selected.size === 0}>
          <TIcon.close/> 清空已选
        </button>
      </div>

      {/* §7.6 三段 Section */}
      <Section seg="selected" title="已选批次" count={sectioned.sel.length}
        hint="勾选 / 取消会同步到方案生成页可用范围"
        emptyText='还没选, 在下方"符合填报条件"段勾选'
        batches={sectioned.sel}
        renderCard={(b) => (
          <BatchCard key={b.batchConfigId} batch={b} checked locked={locked} onToggleCheck={() => toggleBatch(b.batchName)}/>
        )}
      />
      <Section seg="eligible" title="符合填报条件" count={sectioned.el.length}
        hint="可勾选进推荐"
        emptyText="无"
        batches={sectioned.el}
        renderCard={(b) => (
          <BatchCard key={b.batchConfigId} batch={b} checked={false} locked={locked} onToggleCheck={() => toggleBatch(b.batchName)}/>
        )}
      />
      <Section seg="ineligible" title="不符合条件" count={sectioned.ie.length}
        hint="硬性资格未满足 — 通常不建议勾选"
        emptyText="无"
        batches={sectioned.ie}
        renderCard={(b) => (
          <BatchCard key={b.batchConfigId} batch={b} checked={false} locked={locked} onToggleCheck={() => toggleBatch(b.batchName)}/>
        )}
      />

      {/* §7.10 底部提交栏 (仅未锁定时显示) */}
      {!locked && (
        <div className="br-submit">
          <div className="br-submit-inner">
            <div className="br-chips-row">
              <span className="br-chips-lead">已选 <span className="n">{selected.size}</span> 个批次:</span>
              {selected.size === 0 ? (
                <span className="br-chips-empty">(未选)</span>
              ) : (
                Array.from(selected).map(name => (
                  <span className="br-chip" key={name}>
                    {name}
                    <button className="x" onClick={() => toggleBatch(name)} title="取消">
                      <TIcon.close/>
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* 曾确认过 → 覆盖警告 */}
            {data.preferredBatches && (
              <div className="br-override">
                <TIcon.alert/>
                <span>上次已确认, 提交会<strong>覆盖</strong>上次选择 + 影响方案生成页可用批次。</span>
              </div>
            )}

            <div className="br-submit-foot">
              <div className="br-note-field">
                <label>老师备注 (可选, 提交将覆盖上次备注)</label>
                <textarea
                  rows={2}
                  placeholder="例如: 学生想冲强基, 我担心保不住二本"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <button
                className="br-submit-btn"
                disabled={submitDisabled}
                onClick={handleSubmit}
                title={
                  data.intakeGap && data.intakeGap.ok === false
                    ? '学生关键资料未完成, 请先催学生补完'
                    : (selected.size === 0 ? '请至少选定 1 个批次' : '')
                }
              >
                <TIcon.check/> {submitLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* §7.1 学生概览条 */
function Overview({ student: s }: { student: StudentSummary }) {
  const name = s.realName || `学生 ${s.id}`;
  const examTxt = s.examType ? (EXAM_TYPE_LABEL[s.examType] ?? s.examType) : '—';
  const subjLine = (s.firstChoice && s.reChoices && s.reChoices.length)
    ? `${examTxt} · ${s.firstChoice} · ${s.reChoices.join('/')}`
    : examTxt;
  const fmtNum = (n: number | null | undefined) => (n == null ? '--' : n.toLocaleString());
  const idChip = s.examYear ? `S-${String(s.examYear).slice(-2)}-${String(s.id).padStart(3, '0')}` : `S-${String(s.id).padStart(3, '0')}`;
  // 位次档位地图跳转: 物理/历史 + 位次预填
  const rankMapTrack = s.examType === 'PHYSICS' ? '物理' : s.examType === 'HISTORY' ? '历史' : null;
  const rankMapHref = rankMapTrack && s.provincialRank != null
    ? `/teacher/insights/rank-map?track=${encodeURIComponent(rankMapTrack)}&rank=${s.provincialRank}`
    : '/teacher/insights/rank-map';

  return (
    <div className="br-overview">
      <span className="br-ov-avatar" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-light))', color: '#fff' }}>
        {name[0]}
      </span>
      <div className="br-ov-main">
        <div className="br-ov-name">
          {name}
          <span className="id-chip">{idChip}</span>
        </div>
        <div className="br-ov-subj">
          <span className="br-subj-pill">{examTxt}</span>
          <span>{subjLine}</span>
        </div>
      </div>
      <div className="br-ov-stats">
        <div className="br-ov-stat">
          <div className="k">总分</div>
          <div className="v gold">{s.totalScore == null ? '--' : s.totalScore}</div>
        </div>
        <div className="br-ov-stat">
          <div className="k">全省位次</div>
          <div className="v">
            {fmtNum(s.provincialRank)}
            {s.rankEstimated && s.provincialRank != null && (
              <span className="est">按 {s.rankSourceYear ?? '往年'} 估</span>
            )}
          </div>
        </div>
        <div className="br-ov-stat">
          <div className="k">高考年份</div>
          <div className="v">{s.examYear == null ? '--' : s.examYear}</div>
        </div>
        <div className="br-ov-stat" style={{ marginLeft: 'auto' }}>
          <a
            href={rankMapHref}
            style={{
              fontSize: 12,
              padding: '6px 12px',
              border: '1px solid var(--primary, #1677ff)',
              color: 'var(--primary, #1677ff)',
              borderRadius: 4,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            位次档位地图 →
          </a>
        </div>
      </div>
    </div>
  );
}

/* §7.6 段容器 */
function Section({
  seg, title, count, hint, emptyText, batches, renderCard,
}: {
  seg: 'selected' | 'eligible' | 'ineligible';
  title: string;
  count: number;
  hint: string;
  emptyText: string;
  batches: BatchRecommendation[];
  renderCard: (b: BatchRecommendation) => React.ReactNode;
}) {
  return (
    <section className={`br-section seg-${seg}`}>
      <div className="br-section-head">
        <span className="dot"/>
        <h2>{title}</h2>
        <span className="count">{count}</span>
        <span className="line"/>
        <span className="hint">{hint}</span>
      </div>
      {batches.length === 0 ? (
        <div className="br-section-empty">{emptyText}</div>
      ) : (
        <div className="br-section-cards">{batches.map(renderCard)}</div>
      )}
    </section>
  );
}
