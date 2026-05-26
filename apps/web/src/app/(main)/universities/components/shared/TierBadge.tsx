import { TIER_TXT, type Tier } from '../../lib/tier';

/** 冲/稳/保 单字 pill。CSS class 来自 styles.css 的 .tier-rush / .tier-stable / .tier-safe。
 *  设计 css mapping: stable→safe色, safe→stable色(stable=稳色蓝, safe=保色绿 — 跟变量名反一道)
 *  → 这里跟设计稿一致直接套即可。 */
export function TierBadge({ tier }: { tier?: Tier | null }) {
  if (!tier) return null;
  return <span className={`tier tier-${tier}`}>{TIER_TXT[tier]}</span>;
}

/** 当前 user 跟院校最低位次的差距 chip。
 *  diff > 0 (院校位次比 user 大) → 用户更前 → ↓ 绿;
 *  diff < 0 → user 不够 → ↑ 红 */
export function RankDistance({
  uniRank,
  userRank,
}: {
  uniRank?: number | null;
  userRank?: number | null;
}) {
  if (uniRank == null || userRank == null) return null;
  const diff = uniRank - userRank;
  const cls = diff > 0 ? 'down' : diff < 0 ? 'up' : '';
  const arrow = diff > 0 ? '↓' : diff < 0 ? '↑' : '·';
  return (
    <span className={`dist ${cls}`}>
      距你 {arrow} {Math.abs(diff).toLocaleString()} 名
    </span>
  );
}
