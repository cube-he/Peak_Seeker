'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Select, Tag } from 'antd';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { tagForLevels, type EligibleLevel, type OptionLevels } from '@/lib/level-mismatch';
import type { PreferredMajorTier } from './types';

/**
 * 内部编辑态: 池子(tier=0) 单独存, 梯队 tier>=1 单独存.
 * onChange 时拼回 API shape ([{tier:0,majors}, {tier:1,majors}, ...]).
 */
interface EditorState {
  pool: string[];
  tiers: Array<{ tier: number; majors: string[] }>;
}

interface Props {
  value: PreferredMajorTier[];
  options: Array<{ label: string; value: string; levels?: OptionLevels | null }>;
  onChange: (next: PreferredMajorTier[]) => void;
  isLoading?: boolean;
  eligibleLevel?: EligibleLevel;
  examType?: string | null;
}

const POOL_ID = 'pool';
const tierContainerId = (tier: number) => `tier-${tier}`;

/** 把任意 shape 的 value 转成 EditorState. 池子 = tier=0 的 majors. */
export function coerceTierShape(value: unknown): PreferredMajorTier[] {
  // 保留旧 API 兼容: 返回 PreferredMajorTier[], 调用方自己 split pool / tiers.
  if (!Array.isArray(value) || value.length === 0) return [];
  if (typeof value[0] === 'string') {
    // 旧扁平 string[] → 全扔意向池 (tier=0)
    return [{ tier: 0, majors: (value as string[]).filter((m) => typeof m === 'string') }];
  }
  if (Array.isArray(value[0])) {
    // 旧嵌套 string[][] → 第一个数组当梯队 1, 第二个梯队 2 ...
    return (value as string[][]).map((majors, i) => ({
      tier: i + 1,
      majors: Array.isArray(majors) ? majors.filter((m) => typeof m === 'string') : [],
    }));
  }
  return (value as any[]).map((t, i) => ({
    tier: typeof t?.tier === 'number' ? t.tier : i + 1,
    majors: Array.isArray(t?.majors)
      ? t.majors.filter((m: unknown) => typeof m === 'string')
      : [],
  }));
}

/** EditorState → API shape (PreferredMajorTier[]).
 *  pool 非空时输出 tier=0 项 (持久化池子), 空则省略 (避免无意义的 dirty 标记).
 *  梯队按 tier 升序. */
function stateToTiers(state: EditorState): PreferredMajorTier[] {
  const sorted = state.tiers
    .slice()
    .sort((a, b) => a.tier - b.tier)
    .map((t) => ({ tier: t.tier, majors: [...t.majors] }));
  return state.pool.length > 0
    ? [{ tier: 0, majors: [...state.pool] }, ...sorted]
    : sorted;
}

/** 把 major 加进指定容器; 容器是梯队但 state 里还没有该梯队 → 自动创建并按 tier 升序插入.
 *  major 已存在(池子或任意梯队)则原样返回同引用. 纯函数, 供编辑器与测试复用. */
export function addMajorToContainer(
  state: EditorState,
  containerId: string,
  major: string,
): EditorState {
  if (!major) return state;
  const exists =
    state.pool.includes(major) || state.tiers.some((t) => t.majors.includes(major));
  if (exists) return state;
  if (containerId === POOL_ID) {
    return { ...state, pool: [...state.pool, major] };
  }
  const tierNum = Number(containerId.slice('tier-'.length));
  if (!Number.isFinite(tierNum)) return state;
  if (state.tiers.some((t) => t.tier === tierNum)) {
    return {
      ...state,
      tiers: state.tiers.map((t) =>
        t.tier === tierNum ? { ...t, majors: [...t.majors, major] } : t,
      ),
    };
  }
  return {
    ...state,
    tiers: [...state.tiers, { tier: tierNum, majors: [major] }].sort((a, b) => a.tier - b.tier),
  };
}

/** 渲染用梯队: state 无梯队时注入一个空梯队1(仅用于展示, 不写回 state / 不触发 onChange). */
export function displayTiers(state: EditorState): EditorState['tiers'] {
  return state.tiers.length > 0 ? state.tiers : [{ tier: 1, majors: [] }];
}

/** 拖拽移动: 把 major 从 src 容器移到 dst 容器.
 *  先从 src 删除, 再用 addMajorToContainer 加到 dst (dst 是尚未建立的梯队时自动创建).
 *  src===dst / 无 major / dst 非法(非池子且非 tier-<num>) → 原样返回, 防数据丢失. */
export function moveMajorBetweenContainers(
  state: EditorState,
  srcContainer: string,
  dstContainer: string,
  major: string,
): EditorState {
  if (!major || !srcContainer || srcContainer === dstContainer) return state;
  if (dstContainer !== POOL_ID) {
    if (!dstContainer.startsWith('tier-')) return state;
    if (!Number.isFinite(Number(dstContainer.slice('tier-'.length)))) return state;
  }
  const removed: EditorState =
    srcContainer === POOL_ID
      ? { pool: state.pool.filter((m) => m !== major), tiers: state.tiers }
      : {
          pool: state.pool,
          tiers: state.tiers.map((t) =>
            tierContainerId(t.tier) === srcContainer
              ? { ...t, majors: t.majors.filter((m) => m !== major) }
              : t,
          ),
        };
  return addMajorToContainer(removed, dstContainer, major);
}

/** PreferredMajorTier[] → EditorState. 防御 missing fields. */
function tiersToState(tiers: PreferredMajorTier[]): EditorState {
  const pool: string[] = [];
  const tierMap = new Map<number, string[]>();
  for (const t of tiers) {
    if (!t || typeof t.tier !== 'number') continue;
    const majors = Array.isArray(t.majors) ? t.majors.filter((m) => typeof m === 'string') : [];
    if (t.tier <= 0) {
      pool.push(...majors);
    } else {
      const existing = tierMap.get(t.tier) ?? [];
      tierMap.set(t.tier, [...existing, ...majors]);
    }
  }
  const tierList = Array.from(tierMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([tier, majors]) => ({ tier, majors }));
  return { pool, tiers: tierList };
}

/** submit 前规范化:
 *  - 跨梯队同专业去重 (按池子→梯队 1→梯队 2 顺序, 首次出现保留)
 *  - 删空梯队 (池子可空)
 *  - 梯队 renumber 1..N
 *  - 池子空时不输出 tier=0 项 (向后兼容: 旧调用方期望 normalize([])===[])
 *  - 池子非空时输出 tier=0 项, 持久化到 DB, 后端推荐时 ignored
 */
export function normalize(tiers: PreferredMajorTier[]): PreferredMajorTier[] {
  const state = tiersToState(tiers);
  const seen = new Set<string>();
  const pool: string[] = [];
  for (const m of state.pool) {
    if (typeof m === 'string' && m.trim() && !seen.has(m)) {
      seen.add(m);
      pool.push(m);
    }
  }
  const newTiers: Array<{ tier: number; majors: string[] }> = [];
  for (const t of state.tiers) {
    const majors: string[] = [];
    for (const m of t.majors) {
      if (typeof m === 'string' && m.trim() && !seen.has(m)) {
        seen.add(m);
        majors.push(m);
      }
    }
    if (majors.length > 0) newTiers.push({ tier: newTiers.length + 1, majors });
  }
  const out: PreferredMajorTier[] = newTiers.map((t) => ({ tier: t.tier, majors: t.majors }));
  if (pool.length > 0) out.unshift({ tier: 0, majors: pool });
  return out;
}

/** dnd-kit draggable id 编码:
 *  - 池子 chip: 'pool::<major>'
 *  - 梯队 chip: 'tier-<n>::<major>'
 *  解码: split '::' 取 container / major
 */
function encodeDragId(container: string, major: string) {
  return `${container}::${major}`;
}
function decodeDragId(id: string): { container: string; major: string } {
  const idx = id.indexOf('::');
  if (idx < 0) return { container: id, major: '' };
  return { container: id.slice(0, idx), major: id.slice(idx + 2) };
}

function MajorChip({
  dragId,
  major,
  onRemove,
  tag,
}: {
  dragId: string;
  major: string;
  onRemove: () => void;
  tag?: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
  });
  return (
    <span
      ref={setNodeRef}
      className={`pm-chip ${isDragging ? 'is-dragging' : ''}`}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
      }}
      // listeners 放外层 = 整个 chip 都是拖动 hit area, 不只是中间文字.
      // attributes 同样放外层让 ARIA 正确.
      {...listeners}
      {...attributes}
    >
      <span className="pm-chip-handle">
        {major}
        {tag ? <span className="pm-chip-level">{`（${tag}）`}</span> : null}
      </span>
      <button
        type="button"
        className="pm-chip-close"
        // PointerSensor 在 pointerdown 时已经开始追踪, 必须在 pointerdown 截断,
        // 否则点 × 删除时光标只要移动 4px 就会触发拖动.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`移除 ${major}`}
      >
        <CloseOutlined />
      </button>
    </span>
  );
}

function DropContainer({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`pm-drop ${className ?? ''} ${isOver ? 'is-over' : ''}`}
    >
      {children}
    </div>
  );
}

export default function PreferredMajorTierEditor({
  value,
  options,
  onChange,
  isLoading,
  eligibleLevel = null,
  examType = null,
}: Props) {
  // 把外部 value (PreferredMajorTier[]) → 内部 EditorState
  const [state, setState] = useState<EditorState>(() => tiersToState(value ?? []));
  const [adding, setAdding] = useState<string | null>(null); // container id 或 null
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // 防止外部 value 变了 (后端 refresh 或其他 form.setFieldsValue) 跟内部 state 失同步.
  // 用 JSON.stringify 比较, 避免无限循环 (我们 emit 后 outer onChange 会 round-trip 回来).
  const lastEmittedRef = useRef<string>('');
  useEffect(() => {
    const incoming = JSON.stringify(value ?? []);
    if (incoming === lastEmittedRef.current) return;
    setState(tiersToState(value ?? []));
  }, [value]);

  const emit = useCallback(
    (next: EditorState) => {
      setState(next);
      const apiShape = stateToTiers(next);
      lastEmittedRef.current = JSON.stringify(apiShape);
      onChange(apiShape);
    },
    [onChange],
  );

  // 跨所有 container 已选, 用于 Select 过滤 + 拖动去重
  const selectedSet = useMemo(
    () => new Set([...state.pool, ...state.tiers.flatMap((t) => t.majors)]),
    [state],
  );

  // 名字 → 层次不匹配标记 (本/专科对不上时显示, 给 chip 和下拉用)
  const tagOf = useMemo(() => {
    const map = new Map<string, '本科' | '专科' | null>();
    for (const o of options) map.set(o.value, tagForLevels(o.levels, examType, eligibleLevel));
    return (name: string) => map.get(name) ?? null;
  }, [options, examType, eligibleLevel]);

  // —— actions ——
  // keepOpen: 多选连续添加模式 — 选完不收起下拉, 老师可一次加多个专业 (blur 才关闭)
  const addMajor = (containerId: string, major: string, keepOpen = false) => {
    if (!major || selectedSet.has(major)) {
      if (!keepOpen) setAdding(null);
      return;
    }
    emit(addMajorToContainer(state, containerId, major));
    if (!keepOpen) setAdding(null);
  };

  const removeMajor = (containerId: string, major: string) => {
    if (containerId === POOL_ID) {
      emit({ ...state, pool: state.pool.filter((m) => m !== major) });
    } else {
      emit({
        ...state,
        tiers: state.tiers.map((t) =>
          tierContainerId(t.tier) === containerId
            ? { ...t, majors: t.majors.filter((m) => m !== major) }
            : t,
        ),
      });
    }
  };

  const addTier = () => {
    const nextTier = state.tiers.length > 0
      ? Math.max(...state.tiers.map((t) => t.tier)) + 1
      : 1;
    emit({
      ...state,
      tiers: [...state.tiers, { tier: nextTier, majors: [] }],
    });
  };

  const removeTier = (tier: number) => {
    // 占位梯队(尚未写入 state)上的"删除梯队"是 no-op, 不触发 onChange (防 spurious dirty)
    if (!state.tiers.some((t) => t.tier === tier)) return;
    // 删除梯队时, 把该梯队的专业回收到池子, 避免数据丢失
    const target = state.tiers.find((t) => t.tier === tier);
    const recovered = target ? target.majors : [];
    emit({
      pool: [...state.pool, ...recovered.filter((m) => !state.pool.includes(m))],
      tiers: state.tiers
        .filter((t) => t.tier !== tier)
        .map((t, i) => ({ ...t, tier: i + 1 })),
    });
  };

  // —— dnd handlers ——
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over) return;
    const { container: srcContainer, major } = decodeDragId(String(active.id));
    const dstContainer = String(over.id);
    if (!srcContainer || !major || srcContainer === dstContainer) return;
    emit(moveMajorBetweenContainers(state, srcContainer, dstContainer, major));
  };

  const activeMajor = activeDragId ? decodeDragId(activeDragId).major : null;

  // —— render ——
  const renderAddSelector = (containerId: string) => {
    if (adding !== containerId) {
      return (
        <Button
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          onClick={() => setAdding(containerId)}
        >
          加专业
        </Button>
      );
    }
    return (
      <Select
        showSearch
        autoFocus
        // 强制保持下拉打开 = 多选的关键。
        // 选中一个专业后它被 selectedSet 从 options 过滤掉, antd 在 multiple 模式下
        // 会因"当前高亮项消失"自动收起下拉, 收起又触发 setAdding(null) 把添加器弹回按钮,
        // 于是永远只能选一个。受控 open 让 antd 无法自动关, 可连续多选。
        open
        size="small"
        mode="multiple"
        // 受控空值: 选中即转入容器 Tag 列表, 不在 Select 内累积; 下拉保持打开可连续多选
        value={[]}
        style={{ minWidth: 240 }}
        placeholder="搜索专业, 可连续选多个"
        options={options
          .filter((o) => !selectedSet.has(o.value))
          .map((o) => {
            const t = tagOf(o.value);
            return t ? { ...o, label: `${o.label}（${t}）` } : o;
          })}
        optionFilterProp="label"
        loading={isLoading}
        onSelect={(v) => addMajor(containerId, v as string, true)}
        // 收起整个添加器: 点下拉/控件以外才真失焦 (选中项不会触发 blur, antd 内部 preventDefault)
        onBlur={() => setAdding(null)}
      />
    );
  };

  return (
    <DndContext
      sensors={sensors}
      // pointerWithin 而非 closestCenter: 教师端页面祖先 (.fade-up/.view-transition)
      // 有 identity transform + animation-fill:both, 会建立 fixed 包含块并扰乱
      // closestCenter 的矩形中心测算, 导致 drop 永远落到第一个 droppable(意向池),
      // 梯队拖不进。pointerWithin 直接按指针落点判定 droppable, 免疫祖先 transform。
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="pm-editor">
        {/* —— 意向池 (tier=0): 拖拽暂存区, 不再是默认落点 —— */}
        <DropContainer id={POOL_ID} className="pm-pool">
          <div className="pm-section-head">
            <div>
              <span className="pm-section-title">意向池（暂存）</span>
              <span className="pm-section-hint">从梯队拖到这里暂存 · 不参与方案推荐</span>
            </div>
          </div>
          <div className="pm-chips">
            {state.pool.length === 0 ? (
              <span className="pm-empty">直接在下方梯队「加专业」即可；不确定的可拖到这里暂存</span>
            ) : (
              state.pool.map((m) => (
                <MajorChip
                  key={m}
                  dragId={encodeDragId(POOL_ID, m)}
                  major={m}
                  tag={tagOf(m)}
                  onRemove={() => removeMajor(POOL_ID, m)}
                />
              ))
            )}
          </div>
        </DropContainer>

        {/* —— 梯队 (tier>=1): 默认落点; 无梯队时自动显示空梯队1 —— */}
        {displayTiers(state).map((t) => {
          const cid = tierContainerId(t.tier);
          return (
            <DropContainer key={t.tier} id={cid} className="pm-tier">
              <div className="pm-section-head">
                <div>
                  <span className="pm-section-title">梯队 {t.tier}</span>
                  <span className="pm-section-hint">
                    {t.tier === 1 ? '最想去 / 冲一冲' : `第 ${t.tier} 优先`}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {renderAddSelector(cid)}
                  <Button
                    size="small"
                    type="text"
                    danger
                    onClick={() => removeTier(t.tier)}
                  >
                    删除梯队
                  </Button>
                </div>
              </div>
              <div className="pm-chips">
                {t.majors.length === 0 ? (
                  <span className="pm-empty">点「加专业」选择, 或从意向池拖入</span>
                ) : (
                  t.majors.map((m) => (
                    <MajorChip
                      key={m}
                      dragId={encodeDragId(cid, m)}
                      major={m}
                      tag={tagOf(m)}
                      onRemove={() => removeMajor(cid, m)}
                    />
                  ))
                )}
              </div>
            </DropContainer>
          );
        })}

        <Button
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addTier}
          style={{ width: 'fit-content' }}
        >
          加梯队
        </Button>
      </div>

      {/* 拖动时的浮层显示。必须 portal 到 body: DragOverlay 用 position:fixed,
          而教师端页面祖先 (.fade-up/.view-transition) 的入场动画 fill-mode:both
          会残留 identity transform,劫持 fixed 的定位基准 → 碰撞矩形整体错位,
          drop 永远命中第一个 droppable (意向池)。portal 后不受页面 CSS 影响。
          wn-teacher-scope 跟着挂在 overlay 上,否则 .pm-chip-overlay 样式失效。 */}
      {typeof document !== 'undefined'
        ? createPortal(
            <DragOverlay className="wn-teacher-scope">
              {activeMajor ? (
                <Tag color="green" className="pm-chip-overlay">
                  {activeMajor}
                </Tag>
              ) : null}
            </DragOverlay>,
            document.body,
          )
        : null}
    </DndContext>
  );
}
