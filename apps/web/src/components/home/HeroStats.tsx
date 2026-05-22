'use client';

import { useQuery } from '@tanstack/react-query';
import { statsApi, type HomepageStats } from '@/services/stats-api';
import { useCountUp } from './useCountUp';

/**
 * 数据未到 / 请求失败时的兜底常量。
 * 注意 admissionRecordCount 是原始记录数(144000),显示时再换算成"万"。
 */
const FALLBACK: HomepageStats = {
  universityCount: 2237,
  admissionRecordCount: 144000,
  majorCount: 1434,
  dataYearSpan: 4,
};

/** 单个统计格的展示值 */
interface StatCellData {
  /** count-up 的目标数值 */
  target: number;
  /** 保留小数位 */
  decimals: number;
  /** 数字后单位 */
  unit: string;
  /** 标签文案 */
  label: string;
  /** 是否高亮(accent 样式) */
  accent?: boolean;
}

/**
 * 把后端原始统计换算成 4 个展示格。
 * - 院校数 / 专业数:整数显示
 * - 录取记录:换算成"万",保留 1 位小数(144082 → 14.4)
 * - 年份跨度:整数显示
 */
function toCells(stats: HomepageStats): StatCellData[] {
  return [
    {
      target: stats.universityCount,
      decimals: 0,
      unit: '所',
      label: '在川招生院校',
    },
    {
      target: Math.round((stats.admissionRecordCount / 10000) * 10) / 10,
      decimals: 1,
      unit: '万 条',
      label: '录取记录',
    },
    {
      target: stats.majorCount,
      decimals: 0,
      unit: '个',
      label: '招生专业',
    },
    {
      target: stats.dataYearSpan,
      decimals: 0,
      unit: '年',
      label: '数据纵深',
      accent: true,
    },
  ];
}

/** 单个统计格 —— 进入视口时数字 count-up 到目标值 */
function StatCell({ cell, enabled }: { cell: StatCellData; enabled: boolean }) {
  // useCountUp 的 ref 用于视口探测,绑在格子根节点(div)
  const { ref, display } = useCountUp<HTMLDivElement>(cell.target, {
    decimals: cell.decimals,
    enabled,
  });
  return (
    <div
      ref={ref}
      className={`cell${cell.accent ? ' accent' : ''}`}
      role="listitem"
    >
      <div className="num">
        <span className="num-val">{display}</span>
        <span className="unit">{cell.unit}</span>
      </div>
      <div className="lbl">{cell.label}</div>
    </div>
  );
}

/**
 * Hero 左侧 4 统计条。数据来自后端 GET /stats/homepage;
 * 数据未到 / 失败时用兜底常量。数字 count-up 到真实值。
 */
export default function HeroStats() {
  const { data } = useQuery({
    queryKey: ['stats', 'homepage'],
    queryFn: () => statsApi.getHomepageStats(),
    staleTime: 60 * 60 * 1000,
  });

  // 数据到达前用兜底常量;count-up 在数据到达后会以真实值重新触发
  const stats = data ?? FALLBACK;
  const cells = toCells(stats);

  return (
    <div className="hero-stats" role="list" data-reveal-stagger>
      {cells.map((cell) => (
        // key 用 label(稳定);enabled 恒 true —— 兜底值也应有 count-up,
        // 数据到达后 useCountUp 检测到 target 变化会再 count 一次到真实值
        <StatCell key={cell.label} cell={cell} enabled />
      ))}
    </div>
  );
}
