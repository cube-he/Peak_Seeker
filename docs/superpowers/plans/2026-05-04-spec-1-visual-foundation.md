# Spec-1 Visual Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add university logos and 冲/稳/保/垫 ranking-tier coloring to scores, majors detail, universities detail hero, and student plans pages, driven by `predictedMinRank` from spec-0.

**Architecture:** Pure-function classifier in shared utils (`apps/web/src/utils/`), three reusable presentational components (`UniversityLogo`, `RankTierBadge`, `RankDistance`), one composite row (`AdmissionRow`), one banner each for low-confidence and hero. Backend extends `university.findById` and `major.findOne` to inject prediction data via a shared helper. Threshold constants live in a single file for easy tuning.

**Tech Stack:** React 18 + Next.js 14 (apps/web), Tailwind, Ant Design (existing). NestJS + Prisma 7 + MariaDB adapter (apps/server). Jest unit tests.

Spec: `docs/superpowers/specs/2026-05-04-spec-1-visual-foundation-design.md`

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `apps/web/src/utils/admission-thresholds.ts` | TIER_THRESHOLDS / RATIO_THRESHOLDS / HISTORY_SCIENCE_MULTIPLIER constants |
| Create | `apps/web/src/utils/classify-rank.ts` | classifyRank / getTier / isHistorical pure functions |
| Create | `apps/web/src/utils/__tests__/classify-rank.test.ts` | Unit tests |
| Create | `apps/web/src/components/university/UniversityLogo.tsx` | Real image with onError fallback to pastel hash |
| Create | `apps/web/src/components/admission/RankTierBadge.tsx` | 4-tier pill badge + unknown gray |
| Create | `apps/web/src/components/admission/RankDistance.tsx` | Signed distance number with tier color |
| Create | `apps/web/src/components/admission/AdmissionRow.tsx` | Single-row card composing Logo + info + RankDistance + RankTierBadge |
| Create | `apps/web/src/components/admission/LowConfidenceBanner.tsx` | Page-top banner shown when any item has confidence='low' |
| Create | `apps/web/src/components/admission/HeroBanner.tsx` | Detail page hero subtitle banner |
| Create | `apps/server/src/modules/admission/lookup-predictions.dto.ts` | DTO for batch lookup endpoint |
| Modify | `apps/server/src/modules/admission/admission.service.ts` | Add `lookupPredictionsByKeys` method (helper used by other modules) |
| Modify | `apps/server/src/modules/admission/admission.controller.ts` | Add `POST /admissions/lookup-predictions` endpoint |
| Modify | `apps/server/src/modules/university/university.service.ts` | `findById` injects `bestPrediction` based on user's subject |
| Modify | `apps/server/src/modules/university/university.controller.ts` | Accept `?subject=物理|历史` query param on findById |
| Modify | `apps/server/src/modules/major/major.service.ts` | `findOne` injects `predictedMinRank` per enrollmentPlan row |
| Modify | `packages/shared/src/types/admission.ts` | Add `LookupPredictionsRequest/Response` types |
| Modify | `apps/web/src/services/admission.ts` | Add `lookupPredictions` method |
| Modify | `apps/web/src/services/university.ts` | Pass `subject` query param when fetching detail |
| Modify | `apps/web/src/app/(main)/scores/page.tsx` | Replace Table rows with AdmissionRow; add LowConfidenceBanner |
| Modify | `apps/web/src/app/(main)/majors/[id]/page.tsx` | Replace `universityColumns` table with AdmissionRow list |
| Modify | `apps/web/src/app/(main)/universities/[id]/page.tsx` | Add UniversityLogo to hero + HeroBanner |
| Modify | `apps/web/src/app/(student)/student/plans/[id]/page.tsx` | Render plan items as AdmissionRow with prediction lookup |

---

## Task 1: Threshold Constants

**Files:**
- Create: `apps/web/src/utils/admission-thresholds.ts`

- [ ] **Step 1: Create file with all thresholds**

Create `apps/web/src/utils/admission-thresholds.ts`:

```typescript
/**
 * 冲/稳/保/垫 染色阈值。
 *
 * 数值基于 spec-0.5 v2 sanity report 的实测 MAE：
 *   985 MAE 652, 211 MAE 1944, 普通本科 4912, 专科 10118.
 * "stable" 半宽 ≈ 2× MAE，让"稳"区间表示模型不确定性内的合理浮动。
 *
 * 调整阈值：直接编辑此文件 → commit → deploy。git 留版本历史。
 */

export type Tier = '985' | '211' | '普通本科' | '专科';

export interface TierThresholds {
  /** |diff| < stable → 稳 */
  stable: number;
  /** stable ≤ |diff| < safe → 保 (diff>0) 或 冲 (diff<0) */
  safe: number;
  /** |diff| ≥ elite → 垫 (diff>0) */
  elite: number;
}

export const TIER_THRESHOLDS: Record<Tier, TierThresholds> = {
  '985':     { stable: 1500,  safe: 5000,  elite: 15000 },
  '211':     { stable: 4000,  safe: 12000, elite: 30000 },
  '普通本科': { stable: 10000, safe: 30000, elite: 80000 },
  '专科':    { stable: 20000, safe: 60000, elite: 150000 },
};

/** 历史科 MAPE (14.74%) 是物理科 (6.36%) 的 ~2.3x；阈值放宽 1.5x 缓冲。 */
export const HISTORY_SCIENCE_MULTIPLIER = 1.5;

/** 相对比例阈值（与绝对阈值并行判定，取风险更高的档）。 */
export const RATIO_THRESHOLDS = {
  /** ratio < rushMax → 冲 */
  rushMax: -0.10,
  /** rushMax ≤ ratio < stableMax → 稳 */
  stableMax: 0.15,
  /** stableMax ≤ ratio < safeMax → 保；否则 → 垫 */
  safeMax: 0.50,
};
```

- [ ] **Step 2: TS check**

```bash
cd apps/web
pnpm tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/Administrator/Documents/VolunteerHelper
git add apps/web/src/utils/admission-thresholds.ts
git commit -m "feat(spec-1): add admission threshold constants

MAE-derived from spec-0.5 v2 sanity report.
Single file for easy tuning — edit + deploy + version-controlled."
```

---

## Task 2: classifyRank Pure Function + Tests (TDD)

**Files:**
- Create: `apps/web/src/utils/classify-rank.ts`
- Create: `apps/web/src/utils/__tests__/classify-rank.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/utils/__tests__/classify-rank.test.ts`:

```typescript
import { classifyRank, getTier, isHistorical } from '../classify-rank';

describe('getTier', () => {
  it('985 wins over 211', () => {
    expect(getTier({ is985: true, is211: true, batch: '本科批A段' })).toBe('985');
  });
  it('211 wins when 985 false', () => {
    expect(getTier({ is985: false, is211: true, batch: '本科批A段' })).toBe('211');
  });
  it('专科 batch maps to 专科', () => {
    expect(getTier({ is985: false, is211: false, batch: '高职(专科)批' })).toBe('专科');
    expect(getTier({ is985: false, is211: false, batch: '本科专科' })).toBe('专科');
  });
  it('default to 普通本科', () => {
    expect(getTier({ is985: false, is211: false, batch: '本科批B段' })).toBe('普通本科');
  });
});

describe('isHistorical', () => {
  it('returns true for 历史 / 历史类 / 文科', () => {
    expect(isHistorical('历史')).toBe(true);
    expect(isHistorical('历史类')).toBe(true);
    expect(isHistorical('文科')).toBe(true);
  });
  it('returns false for 物理 / 理科 / empty', () => {
    expect(isHistorical('物理')).toBe(false);
    expect(isHistorical('理科')).toBe(false);
    expect(isHistorical('')).toBe(false);
  });
});

describe('classifyRank', () => {
  // tier=普通本科, predictedRank vs userRank=50000
  const TIER = '普通本科';

  it('returns unknown when predictedRank is null', () => {
    expect(classifyRank(50000, null, TIER, false)).toBe('unknown');
  });

  it('rush: predicted way below user (negative diff)', () => {
    // predicted=20000, user=50000 → diff=-30000 → |diff| > stable (10000) → rush
    expect(classifyRank(50000, 20000, TIER, false)).toBe('rush');
  });

  it('stable: small positive diff within stable threshold', () => {
    // predicted=55000, user=50000 → diff=+5000 → |diff| < stable(10000) → stable
    expect(classifyRank(50000, 55000, TIER, false)).toBe('stable');
  });

  it('safe: diff in [stable, safe) range', () => {
    // predicted=70000, user=50000 → diff=+20000 → stable<=diff<safe(30000) → safe
    expect(classifyRank(50000, 70000, TIER, false)).toBe('safe');
  });

  it('elite: diff >= safe but ratio still < safeMax 0.50', () => {
    // predicted=72000, user=50000 → diff=+22000 → ratio=0.44 → safe (ratio wins NOT, abs is safe; risker = safe)
    expect(classifyRank(50000, 72000, TIER, false)).toBe('safe');
  });

  it('elite: very large positive diff', () => {
    // predicted=200000, user=50000 → diff=150000 → abs elite, ratio 3.0 → elite
    expect(classifyRank(50000, 200000, TIER, false)).toBe('elite');
  });

  it('rush by ratio when absolute too small (low userRank scenario)', () => {
    // tier=985, user=2000, predicted=1700 → diff=-300, |diff|<stable(1500) → abs says stable.
    // ratio = -300/2000 = -0.15 < -10% → rush. Risker = rush.
    expect(classifyRank(2000, 1700, '985', false)).toBe('rush');
  });

  it('historical multiplier widens stable band', () => {
    // tier=普通本科, user=50000, predicted=64000 → diff=14000 → without multiplier: safe.
    // With 1.5x multiplier: stable band 10000*1.5=15000 → diff<15000 → stable.
    // ratio = 14000/50000 = 0.28 → stableMax(0.15) <= ratio < safeMax(0.50) → safe.
    // Risker between stable and safe = stable... wait, safe is risker than stable in our convention.
    // RISK_ORDER = ['rush', 'stable', 'safe', 'elite'] (rush highest risk, elite lowest).
    // Risker = lower index. abs=stable(idx 1), ratio=safe(idx 2) → min(1,2)=1 → 'stable'.
    expect(classifyRank(50000, 64000, '普通本科', true)).toBe('stable');
  });

  it('userRank zero/negative degenerates to ratio of 0 (no division by zero)', () => {
    // user=0 → ratio uses Math.max(1, userRank) = 1, ratio=predicted/1
    // This should still classify deterministically; predicted=10000 → ratio=10000 → elite via ratio
    expect(classifyRank(0, 10000, TIER, false)).toBe('elite');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
cd apps/web
pnpm jest src/utils/__tests__/classify-rank.test.ts
```
Expected: FAIL with module not found.

- [ ] **Step 3: Implement**

Create `apps/web/src/utils/classify-rank.ts`:

```typescript
import {
  TIER_THRESHOLDS,
  HISTORY_SCIENCE_MULTIPLIER,
  RATIO_THRESHOLDS,
  type Tier,
} from './admission-thresholds';

export type RankTier = 'rush' | 'stable' | 'safe' | 'elite' | 'unknown';

const RISK_ORDER: RankTier[] = ['rush', 'stable', 'safe', 'elite'];

/**
 * Derive university tier for a given (university flags, batch) row.
 * Order: 985 > 211 > 专科 > 普通本科.
 */
export function getTier(input: {
  is985: boolean;
  is211: boolean;
  batch: string;
}): Tier {
  if (input.is985) return '985';
  if (input.is211) return '211';
  if (input.batch.includes('专科') || input.batch.includes('高职')) return '专科';
  return '普通本科';
}

/** True if the subject string represents history/arts track. */
export function isHistorical(subjects: string): boolean {
  return /历史|文科/.test(subjects);
}

/**
 * Classify a (userRank, predictedRank) into 4 tiers + unknown.
 *
 * Dual-criterion: absolute diff vs tier thresholds, AND relative ratio vs RATIO_THRESHOLDS.
 * Take the risker tier (rush > stable > safe > elite by RISK_ORDER index).
 *
 * Returns 'unknown' when predictedRank is null (insufficient model data).
 */
export function classifyRank(
  userRank: number,
  predictedRank: number | null,
  tier: Tier,
  historical: boolean,
): RankTier {
  if (predictedRank == null) return 'unknown';

  const diff = predictedRank - userRank; // positive = user's rank is lower (better) than school's
  const ratio = diff / Math.max(1, userRank);

  const t = TIER_THRESHOLDS[tier];
  const m = historical ? HISTORY_SCIENCE_MULTIPLIER : 1;
  const absStable = t.stable * m;
  const absSafe = t.safe * m;

  let absTier: RankTier;
  if (diff < -absStable) absTier = 'rush';
  else if (diff < absStable) absTier = 'stable';
  else if (diff < absSafe) absTier = 'safe';
  else absTier = 'elite';

  let ratioTier: RankTier;
  if (ratio < RATIO_THRESHOLDS.rushMax) ratioTier = 'rush';
  else if (ratio < RATIO_THRESHOLDS.stableMax) ratioTier = 'stable';
  else if (ratio < RATIO_THRESHOLDS.safeMax) ratioTier = 'safe';
  else ratioTier = 'elite';

  // Take risker (lower index in RISK_ORDER)
  const absIdx = RISK_ORDER.indexOf(absTier);
  const ratioIdx = RISK_ORDER.indexOf(ratioTier);
  return RISK_ORDER[Math.min(absIdx, ratioIdx)];
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/web
pnpm jest src/utils/__tests__/classify-rank.test.ts
```
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Administrator/Documents/VolunteerHelper
git add apps/web/src/utils/classify-rank.ts apps/web/src/utils/__tests__/classify-rank.test.ts
git commit -m "feat(spec-1): add classifyRank/getTier/isHistorical pure functions

Dual-criterion classifier (absolute + relative), risker-wins.
Historical subject multiplier compensates 2.3x higher MAPE."
```

---

## Task 3: UniversityLogo Component

**Files:**
- Create: `apps/web/src/components/university/UniversityLogo.tsx`

- [ ] **Step 1: Implement**

Create `apps/web/src/components/university/UniversityLogo.tsx`:

```typescript
'use client';

import { useState } from 'react';

const PASTEL_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#c5d9e8', fg: '#1e3a5f' }, // 蓝
  { bg: '#e8d4b8', fg: '#6b4520' }, // 琥珀
  { bg: '#d4c5e8', fg: '#4a2d70' }, // 紫
  { bg: '#cce0d4', fg: '#1e4a30' }, // 绿
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % PASTEL_PALETTE.length;
}

function firstChar(name: string): string {
  const stripped = name.replace(/^(中国|中央|北京|上海)/, '');
  return stripped[0] ?? name[0] ?? '?';
}

interface UniversityLogoProps {
  name: string;
  logoUrl?: string | null;
  size?: number;
}

export default function UniversityLogo({ name, logoUrl, size = 40 }: UniversityLogoProps) {
  const [errored, setErrored] = useState(false);
  const showImage = !!logoUrl && !errored;

  const palette = PASTEL_PALETTE[hashName(name)];
  const radius = Math.round(size * 0.2);
  const fontSize = Math.round(size * 0.45);

  return (
    <div
      className="flex-shrink-0 flex items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: showImage ? '#f0eee6' : palette.bg,
        color: palette.fg,
      }}
      aria-label={name}
    >
      {showImage ? (
        <img
          src={logoUrl!}
          alt={name}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          onError={() => setErrored(true)}
        />
      ) : (
        <span
          style={{
            fontFamily: "'Crimson Pro', Georgia, serif",
            fontWeight: 600,
            fontSize,
          }}
        >
          {firstChar(name)}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TS check**

```bash
cd apps/web
pnpm tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/Administrator/Documents/VolunteerHelper
git add apps/web/src/components/university/UniversityLogo.tsx
git commit -m "feat(spec-1): add UniversityLogo with pastel hash fallback

Real image first; onError → 4-color hash palette + first non-prefix char."
```

---

## Task 4: RankTierBadge + RankDistance

**Files:**
- Create: `apps/web/src/components/admission/RankTierBadge.tsx`
- Create: `apps/web/src/components/admission/RankDistance.tsx`

- [ ] **Step 1: Implement RankTierBadge**

Create `apps/web/src/components/admission/RankTierBadge.tsx`:

```typescript
import type { RankTier } from '@/utils/classify-rank';

const STYLES: Record<RankTier, { bg: string; fg: string; label: string }> = {
  rush:    { bg: '#fef0ee', fg: '#c53030', label: '冲' },
  stable:  { bg: '#ebf2f8', fg: '#2c5282', label: '稳' },
  safe:    { bg: '#e8f1ec', fg: '#276749', label: '保' },
  elite:   { bg: '#f5edd6', fg: '#b8860b', label: '垫' },
  unknown: { bg: '#f0eee6', fg: '#87867f', label: '暂无预测' },
};

export default function RankTierBadge({ tier }: { tier: RankTier }) {
  const s = STYLES[tier];
  return (
    <span
      className="font-semibold px-2.5 py-1 rounded-full text-xs whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}
```

- [ ] **Step 2: Implement RankDistance**

Create `apps/web/src/components/admission/RankDistance.tsx`:

```typescript
import type { RankTier } from '@/utils/classify-rank';

const COLOR_BY_TIER: Record<RankTier, string> = {
  rush:    '#c53030',
  stable:  '#2c5282',
  safe:    '#276749',
  elite:   '#b8860b',
  unknown: '#87867f',
};

interface RankDistanceProps {
  /** predictedRank - userRank, or null when unknown */
  diff: number | null;
  tier: RankTier;
}

/** Format number with sign and locale separator: 1234 → "+1,234"; -1234 → "-1,234". */
function formatDiff(diff: number): string {
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '±';
  return `${sign}${Math.abs(diff).toLocaleString()}`;
}

export default function RankDistance({ diff, tier }: RankDistanceProps) {
  if (diff == null) return null;
  return (
    <span
      className="font-semibold text-sm"
      style={{
        color: COLOR_BY_TIER[tier],
        fontFamily: "'Crimson Pro', Georgia, serif",
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {formatDiff(diff)}
    </span>
  );
}
```

- [ ] **Step 3: TS check**

```bash
cd apps/web
pnpm tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Administrator/Documents/VolunteerHelper
git add apps/web/src/components/admission/
git commit -m "feat(spec-1): add RankTierBadge + RankDistance components

Pill badge for 4 tiers + unknown gray.
Signed-distance number with tier color, serif tabular-nums."
```

---

## Task 5: AdmissionRow Composite Component

**Files:**
- Create: `apps/web/src/components/admission/AdmissionRow.tsx`

- [ ] **Step 1: Implement**

Create `apps/web/src/components/admission/AdmissionRow.tsx`:

```typescript
'use client';

import Link from 'next/link';
import UniversityLogo from '@/components/university/UniversityLogo';
import RankTierBadge from './RankTierBadge';
import RankDistance from './RankDistance';
import { classifyRank, getTier, isHistorical, type RankTier } from '@/utils/classify-rank';

const BAR_COLOR_BY_TIER: Record<RankTier, string> = {
  rush:    '#c53030',
  stable:  '#2c5282',
  safe:    '#276749',
  elite:   '#b8860b',
  unknown: '#d1cfc5',
};

export interface AdmissionRowData {
  university: {
    id: number;
    name: string;
    logoUrl?: string | null;
    is985: boolean;
    is211: boolean;
    isDoubleFirstClass?: boolean;
  };
  major?: { id: number; name: string } | null;
  majorName?: string;
  groupCode: string;
  batch: string;
  recruitType: string;
  subjects: string;
  predictedMinRank: { point: number } | null;
}

interface AdmissionRowProps {
  data: AdmissionRowData;
  /** User's rank from useUserStore. When null, all rows render as 'unknown'. */
  userRank: number | null;
}

export default function AdmissionRow({ data, userRank }: AdmissionRowProps) {
  const u = data.university;
  const predictedPoint = data.predictedMinRank?.point ?? null;

  const tier: RankTier = userRank == null
    ? 'unknown'
    : classifyRank(
        userRank,
        predictedPoint,
        getTier({ is985: u.is985, is211: u.is211, batch: data.batch }),
        isHistorical(data.subjects),
      );

  const diff = userRank != null && predictedPoint != null ? predictedPoint - userRank : null;

  const tagBadges: string[] = [];
  if (u.is985) tagBadges.push('985');
  else if (u.is211) tagBadges.push('211');
  if (u.isDoubleFirstClass && !u.is985 && !u.is211) tagBadges.push('双一流');

  const majorDisplay = data.major?.name ?? data.majorName ?? '—';

  return (
    <div
      className="bg-surface rounded-lg shadow-card relative overflow-hidden mb-2"
      style={{ borderLeft: `3px solid ${BAR_COLOR_BY_TIER[tier]}` }}
    >
      <div className="flex items-center gap-3 py-3 px-4">
        <UniversityLogo name={u.name} logoUrl={u.logoUrl} size={40} />

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Link
            href={`/universities/${u.id}`}
            className="font-serif font-semibold text-[15px] text-primary whitespace-nowrap hover:text-primary-light"
          >
            {u.name}
          </Link>
          {tagBadges.map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-dim text-text-secondary flex-shrink-0">
              {t}
            </span>
          ))}
          <span className="text-xs text-text-tertiary truncate min-w-0">
            {majorDisplay} · {data.subjects} · 组{data.groupCode}
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          <RankDistance diff={diff} tier={tier} />
          <RankTierBadge tier={tier} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TS check**

```bash
cd apps/web
pnpm tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/Administrator/Documents/VolunteerHelper
git add apps/web/src/components/admission/AdmissionRow.tsx
git commit -m "feat(spec-1): add AdmissionRow composite component

Single-row card: 3px tier-colored left bar + 40px logo + university link
+ tags + major/subjects/groupCode meta + RankDistance + RankTierBadge.
Reused across scores, majors detail, plans pages."
```

---

## Task 6: LowConfidenceBanner + HeroBanner

**Files:**
- Create: `apps/web/src/components/admission/LowConfidenceBanner.tsx`
- Create: `apps/web/src/components/admission/HeroBanner.tsx`

- [ ] **Step 1: LowConfidenceBanner**

Create `apps/web/src/components/admission/LowConfidenceBanner.tsx`:

```typescript
interface LowConfidenceBannerProps {
  /** Hide the banner if the result set has no low-confidence items. */
  show: boolean;
}

export default function LowConfidenceBanner({ show }: LowConfidenceBannerProps) {
  if (!show) return null;
  return (
    <div className="bg-[#fef9e7] border-l-[3px] border-l-[#d4a843] px-4 py-2 rounded mb-4">
      <span className="text-xs text-[#6b4520]">
        ⚠ 当前预测基于 2024-2025 两年新高考数据，2026 招生计划尚未公布。结果仅供参考。
      </span>
    </div>
  );
}
```

- [ ] **Step 2: HeroBanner**

Create `apps/web/src/components/admission/HeroBanner.tsx`:

```typescript
import RankTierBadge from './RankTierBadge';
import { classifyRank, getTier, isHistorical, type RankTier } from '@/utils/classify-rank';

const BG_COLOR_BY_TIER: Record<RankTier, string> = {
  rush:    '#fef0ee',
  stable:  '#ebf2f8',
  safe:    '#e8f1ec',
  elite:   '#f5edd6',
  unknown: '#f0eee6',
};

interface HeroBannerProps {
  university: { is985: boolean; is211: boolean };
  /** The "best prediction" for this university, in the user's selected subject. */
  prediction: {
    point: number;
    confidence: 'high' | 'medium' | 'low';
    subjects: string;
    batch: string;
  } | null;
  userRank: number | null;
}

export default function HeroBanner({ university, prediction, userRank }: HeroBannerProps) {
  let tier: RankTier;
  let body: string;

  if (prediction == null) {
    tier = 'unknown';
    body = '当前数据不足以预估录取位次';
  } else if (userRank == null) {
    tier = 'unknown';
    body = `该校最低组 ${prediction.point.toLocaleString()} 名 — 输入你的位次以查看冲稳保`;
  } else {
    tier = classifyRank(
      userRank,
      prediction.point,
      getTier({ is985: university.is985, is211: university.is211, batch: prediction.batch }),
      isHistorical(prediction.subjects),
    );
    const diff = prediction.point - userRank;
    if (diff < 0) {
      body = `最低组 ${prediction.point.toLocaleString()} 名 — 你需要再涨 ${Math.abs(diff).toLocaleString()} 名`;
    } else if (tier === 'elite') {
      body = `最低组 ${prediction.point.toLocaleString()} 名 — 远高于你的位次`;
    } else {
      body = `最低组 ${prediction.point.toLocaleString()} 名 — 高出 ${diff.toLocaleString()} 名`;
    }
  }

  const showLowConf = prediction?.confidence === 'low';

  return (
    <div
      className="mt-4 px-4 py-3 rounded flex items-center gap-3"
      style={{ background: BG_COLOR_BY_TIER[tier] }}
    >
      <RankTierBadge tier={tier} />
      <span className="text-sm text-text">{body}</span>
      {showLowConf && (
        <span className="text-[11px] text-text-muted ml-auto">仅供参考</span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: TS check**

```bash
cd apps/web
pnpm tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Administrator/Documents/VolunteerHelper
git add apps/web/src/components/admission/LowConfidenceBanner.tsx apps/web/src/components/admission/HeroBanner.tsx
git commit -m "feat(spec-1): add LowConfidenceBanner + HeroBanner

Page-top yellow banner for low-confidence predictions.
Hero subtitle banner with full-sentence diff and tier color background."
```

---

## Task 7: Backend — Shared Predictions Lookup Helper

**Files:**
- Modify: `apps/server/src/modules/admission/admission.service.ts`

- [ ] **Step 1: Add `lookupPredictionsByKeys` method**

In `apps/server/src/modules/admission/admission.service.ts`, after the existing `findAggregated` method add:

```typescript
  /**
   * Batch lookup of RankPrediction by natural-key tuples.
   * Used by other services (university, major, plans) that need to inject
   * predictedMinRank without rebuilding the query each time.
   *
   * Returns a Map from "uniId|groupCode|batch|recruitType|subjects" → PredictedMinRank.
   */
  async lookupPredictionsByKeys(
    keys: Array<{
      universityId: number;
      groupCode: string;
      batch: string;
      recruitType: string;
      subjects: string;
    }>,
    targetYearOverride?: number,
  ): Promise<Map<string, {
    point: number;
    conservative: number;
    optimistic: number;
    basisYears: number[];
    confidence: string;
    targetYear: number;
  }>> {
    if (keys.length === 0) return new Map();

    const targetYear = targetYearOverride ?? (await this.getTargetYear());

    const preds = await this.prisma.rankPrediction.findMany({
      where: {
        targetYear,
        OR: keys.map((k) => ({
          universityId: k.universityId,
          groupCode: k.groupCode,
          batch: k.batch,
          recruitType: k.recruitType,
          subjects: k.subjects,
        })),
      },
    });

    const result = new Map<string, any>();
    for (const p of preds) {
      const k = [p.universityId, p.groupCode, p.batch, p.recruitType, p.subjects].join('|');
      result.set(k, {
        point: p.pointRank!,
        conservative: p.conservativeRank!,
        optimistic: p.optimisticRank!,
        basisYears: p.basisYears as number[],
        confidence: p.confidence,
        targetYear: p.targetYear,
      });
    }
    return result;
  }

  /** Read targetYear from config — exposed as method so other services can call. */
  async getTargetYear(): Promise<number> {
    return getTargetYear();
  }
```

Verify that `getTargetYear` is the existing module-level function (added in spec-0 T10). If it's currently file-private, lift it or duplicate it as a public helper. Since the spec-0 implementation defines `getTargetYear` at module scope, the wrapper above can just call it.

- [ ] **Step 2: Build**

```bash
cd apps/server
pnpm build
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/Administrator/Documents/VolunteerHelper
git add apps/server/src/modules/admission/admission.service.ts
git commit -m "feat(spec-1): add lookupPredictionsByKeys + getTargetYear methods

Shared helper for other services (university/major/plan) to inject
predictedMinRank without rebuilding the query."
```

---

## Task 8: Backend — Shared Type for Lookup

**Files:**
- Modify: `packages/shared/src/types/admission.ts`

- [ ] **Step 1: Append types**

Append to `packages/shared/src/types/admission.ts`:

```typescript
// 批量查 prediction 的请求
export interface LookupPredictionsRequest {
  keys: Array<{
    universityId: number;
    groupCode: string;
    batch: string;
    recruitType: string;
    subjects: string;
  }>;
  targetYear?: number;
}

// 批量查 prediction 的响应（顺序与 request.keys 一致；找不到的返回 null）
export interface LookupPredictionsResponse {
  predictions: Array<PredictedMinRank | null>;
}
```

- [ ] **Step 2: Build shared package**

```bash
cd packages/shared
pnpm build
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/Administrator/Documents/VolunteerHelper
git add packages/shared/src/types/admission.ts
git commit -m "feat(spec-1): add LookupPredictionsRequest/Response shared types"
```

---

## Task 9: Backend — Batch Lookup Endpoint

**Files:**
- Create: `apps/server/src/modules/admission/dto/lookup-predictions.dto.ts`
- Modify: `apps/server/src/modules/admission/admission.controller.ts`

- [ ] **Step 1: Create DTO**

Create `apps/server/src/modules/admission/dto/lookup-predictions.dto.ts`:

```typescript
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, ValidateNested, ArrayMaxSize } from 'class-validator';

export class PredictionKeyDto {
  @IsInt()
  universityId: number;

  @IsString()
  groupCode: string;

  @IsString()
  batch: string;

  @IsString()
  recruitType: string;

  @IsString()
  subjects: string;
}

export class LookupPredictionsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PredictionKeyDto)
  keys: PredictionKeyDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  targetYear?: number;
}
```

- [ ] **Step 2: Add endpoint to controller**

In `apps/server/src/modules/admission/admission.controller.ts`, add at the end of the class:

```typescript
import { Body, Post } from '@nestjs/common';
import { LookupPredictionsDto } from './dto/lookup-predictions.dto';

  // ... existing endpoints ...

  @Post('lookup-predictions')
  @ApiOperation({ summary: '批量查询 RankPrediction 按自然键' })
  async lookupPredictions(@Body() dto: LookupPredictionsDto) {
    const map = await this.admissionService.lookupPredictionsByKeys(dto.keys, dto.targetYear);
    const predictions = dto.keys.map((k) => {
      const compositeKey = [k.universityId, k.groupCode, k.batch, k.recruitType, k.subjects].join('|');
      return map.get(compositeKey) ?? null;
    });
    return { predictions };
  }
```

Make sure the `@Body` and `@Post` imports are present at the top of the file (some controllers already import them; verify).

- [ ] **Step 3: Build**

```bash
cd apps/server
pnpm build
```
Expected: success.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Administrator/Documents/VolunteerHelper
git add apps/server/src/modules/admission/dto/lookup-predictions.dto.ts apps/server/src/modules/admission/admission.controller.ts
git commit -m "feat(spec-1): add POST /admissions/lookup-predictions endpoint

Batch lookup; max 200 keys per request. Returns predictions array
in the same order as the request keys (null for missing)."
```

---

## Task 10: Backend — University findById Injects bestPrediction

**Files:**
- Modify: `apps/server/src/modules/university/university.service.ts`
- Modify: `apps/server/src/modules/university/university.module.ts`
- Modify: `apps/server/src/modules/university/university.controller.ts`

- [ ] **Step 1: Inject AdmissionService into UniversityService**

In `apps/server/src/modules/university/university.module.ts`, add `AdmissionModule` to imports if not already present:

```typescript
import { AdmissionModule } from '../admission/admission.module';
// In @Module decorator, add to imports array:
//   imports: [..., AdmissionModule],
```

In `apps/server/src/modules/university/university.service.ts`, modify the constructor:

```typescript
import { AdmissionService } from '../admission/admission.service';

@Injectable()
export class UniversityService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private admissionService: AdmissionService,
  ) {}
  // ...
}
```

If `AdmissionService` isn't exported from the admission module's `providers/exports` array, add it there.

- [ ] **Step 2: Modify findById to accept subject param + inject bestPrediction**

Replace the existing `findById(id: number)` method body in `university.service.ts` with:

```typescript
  async findById(id: number, subject?: string) {
    const cacheKey = `university:${id}:subject:${subject ?? 'none'}`;
    const cached = await this.redis.getCache(cacheKey);
    if (cached) return cached;

    const university = await this.prisma.university.findUnique({
      where: { id },
      include: {
        enrollmentPlans: {
          orderBy: { year: 'desc' },
          take: 100,
        },
        admissionRecords: {
          orderBy: { year: 'desc' },
          take: 100,
        },
      },
    });

    if (!university) {
      throw new NotFoundException('院校不存在');
    }

    const qiangjiAdmissions = await this.prisma.qiangjiAdmission.findMany({
      where: { school: university.name },
      orderBy: [{ major: 'asc' }, { year: 'desc' }],
    });

    // bestPrediction: among普通类本科/普通类高职(专科) recruitTypes that match user's subject,
    // pick the one with the smallest pointRank (hardest to get into = "best benchmark").
    let bestPrediction: any = null;
    if (subject) {
      const targetYear = await this.admissionService.getTargetYear();
      const candidates = await this.prisma.rankPrediction.findMany({
        where: {
          universityId: id,
          targetYear,
          subjects: subject,
          recruitType: { in: ['普通类本科', '普通类高职(专科)'] },
        },
        orderBy: { pointRank: 'asc' },
        take: 1,
      });
      if (candidates.length > 0) {
        const p = candidates[0];
        bestPrediction = {
          point: p.pointRank,
          conservative: p.conservativeRank,
          optimistic: p.optimisticRank,
          basisYears: p.basisYears,
          confidence: p.confidence,
          targetYear: p.targetYear,
          subjects: p.subjects,
          batch: p.batch,
        };
      }
    }

    const result = { ...university, qiangjiAdmissions, bestPrediction };
    await this.redis.setCache(cacheKey, result, 3600);
    return result;
  }
```

- [ ] **Step 3: Modify controller to accept subject query param**

In `apps/server/src/modules/university/university.controller.ts`, modify the `findById` route handler:

```typescript
@Get(':id')
async findById(@Param('id') id: string, @Query('subject') subject?: string) {
  return this.universityService.findById(Number(id), subject);
}
```

If the existing handler signature differs, follow its pattern.

- [ ] **Step 4: Build**

```bash
cd apps/server
pnpm build
```
Expected: success.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Administrator/Documents/VolunteerHelper
git add apps/server/src/modules/university/
git commit -m "feat(spec-1): university.findById accepts ?subject= and injects bestPrediction

Picks the smallest pointRank among 普通类 recruitments matching user's subject.
Cache key includes subject so different subjects don't share entries."
```

---

## Task 11: Backend — Major findOne Injects per-row predictedMinRank

**Files:**
- Modify: `apps/server/src/modules/major/major.module.ts`
- Modify: `apps/server/src/modules/major/major.service.ts`

- [ ] **Step 1: Inject AdmissionService**

In `apps/server/src/modules/major/major.module.ts`, add `AdmissionModule` to imports:

```typescript
import { AdmissionModule } from '../admission/admission.module';
// imports: [..., AdmissionModule],
```

In `apps/server/src/modules/major/major.service.ts`, add to constructor:

```typescript
import { AdmissionService } from '../admission/admission.service';

constructor(
  private prisma: PrismaService,
  private redis: RedisService,
  private admissionService: AdmissionService,
) {}
```

- [ ] **Step 2: Modify findOne (or equivalent) to attach predictedMinRank to each enrollmentPlan**

In `apps/server/src/modules/major/major.service.ts`, locate the method that returns the major with `enrollmentPlans`. After fetching the major, before returning, add:

```typescript
// After: const major = await this.prisma.major.findUnique({ where: { id }, include: { enrollmentPlans: { include: { university: true } } } });

if (major && major.enrollmentPlans?.length > 0) {
  const keys = major.enrollmentPlans
    .filter((ep) => ep.universityId && ep.subjects)
    .map((ep) => ({
      universityId: ep.universityId,
      groupCode: ep.groupCode,
      batch: ep.batch,
      recruitType: ep.recruitType,
      subjects: ep.subjects,
    }));
  const predMap = await this.admissionService.lookupPredictionsByKeys(keys);
  for (const ep of major.enrollmentPlans) {
    const k = [ep.universityId, ep.groupCode, ep.batch, ep.recruitType, ep.subjects].join('|');
    (ep as any).predictedMinRank = predMap.get(k) ?? null;
  }
}
```

If the method name differs (e.g. `findById`), apply to that one. Inspect the file to confirm.

- [ ] **Step 3: Build**

```bash
cd apps/server
pnpm build
```
Expected: success.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Administrator/Documents/VolunteerHelper
git add apps/server/src/modules/major/
git commit -m "feat(spec-1): major.findOne injects predictedMinRank per enrollmentPlan row

Uses admissionService.lookupPredictionsByKeys batch helper."
```

---

## Task 12: Frontend — Admission Service lookupPredictions

**Files:**
- Modify: `apps/web/src/services/admission.ts`
- Modify: `apps/web/src/services/university.ts`

- [ ] **Step 1: Add lookupPredictions to admission service**

In `apps/web/src/services/admission.ts`, append:

```typescript
import type { LookupPredictionsRequest, LookupPredictionsResponse } from '@volunteer-helper/shared';

// Inside the existing service object:
  lookupPredictions(req: LookupPredictionsRequest): Promise<LookupPredictionsResponse> {
    return api.post('/admissions/lookup-predictions', req) as any;
  },
```

If the file uses an object with multiple methods (current style), insert this method into that object.

- [ ] **Step 2: Pass subject param to university.getById**

In `apps/web/src/services/university.ts`, locate `getById(id)`:

```typescript
getById(id: number, subject?: string): Promise<any> {
  return api.get(`/universities/${id}`, { params: subject ? { subject } : undefined }) as any;
},
```

- [ ] **Step 3: TS check**

```bash
cd apps/web
pnpm tsc --noEmit
```
Expected: no new errors. The shared package may need rebuild first if importing latest types fails.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Administrator/Documents/VolunteerHelper
git add apps/web/src/services/admission.ts apps/web/src/services/university.ts
git commit -m "feat(spec-1): add lookupPredictions service + university subject param"
```

---

## Task 13: Frontend — Scores Page Uses AdmissionRow

**Files:**
- Modify: `apps/web/src/app/(main)/scores/page.tsx`

- [ ] **Step 1: Replace columns rendering with AdmissionRow list**

This is a substantial rewrite. The existing scores page uses an antd `Table` with custom columns. Replace the table-based render with a list of `AdmissionRow` components, preserving the existing query form, filter sidebar, and pagination.

In `apps/web/src/app/(main)/scores/page.tsx`:

1. Add imports near the top:
```typescript
import AdmissionRow from '@/components/admission/AdmissionRow';
import LowConfidenceBanner from '@/components/admission/LowConfidenceBanner';
import { useUserStore } from '@/stores/userStore';
```
(useUserStore is already imported in this file — verify and don't duplicate.)

2. After the `useQuery` for `result` and before the existing `<Table>`, replace the **table body section** (the `<Table>` element) with:

```tsx
{result?.data && result.data.length > 0 && (
  <>
    <LowConfidenceBanner
      show={result.data.some((item: any) => item.predictedMinRank?.confidence === 'low')}
    />
    <div>
      {result.data.map((item: AggregatedAdmissionItem) => (
        <AdmissionRow
          key={`${item.university.id}:${item.majorCode}:${item.groupCode}:${item.batch}:${item.recruitType}`}
          data={{
            university: {
              id: item.university.id,
              name: item.university.name,
              logoUrl: (item.university as any).logoUrl,
              is985: item.university.is985,
              is211: item.university.is211,
              isDoubleFirstClass: item.university.isDoubleFirstClass,
            },
            major: item.major ? { id: item.major.id, name: item.major.name } : null,
            majorName: item.majorName,
            groupCode: item.groupCode,
            batch: item.batch,
            recruitType: item.recruitType,
            subjects: item.subjects,
            predictedMinRank: item.predictedMinRank,
          }}
          userRank={examInfo.rank}
        />
      ))}
    </div>
  </>
)}
```

3. **Important**: Keep the existing `Table` element commented out for one commit so reviewers can see the diff is additive in spirit. Actually no — delete it cleanly. Just remove the entire `<Table ... />` block and the column definitions above (`const columns = [...]`).

4. Keep the existing pagination, but render it below the AdmissionRow list:
```tsx
{result?.pagination?.total > 0 && (
  <div className="flex justify-center mt-6">
    <Pagination
      current={currentPage}
      pageSize={currentPageSize}
      total={result.pagination.total}
      showSizeChanger
      showQuickJumper
      onChange={(p, ps) => { setCurrentPage(p); setCurrentPageSize(ps); }}
    />
  </div>
)}
```

5. Make sure `examInfo` is available — look for `const { examInfo } = useUserStore();` in the file. If absent, add it.

- [ ] **Step 2: Verify university shape includes logoUrl**

The `UniversitySummary` type in `packages/shared/src/types/admission.ts` may not yet include `logoUrl`. If it doesn't, add it:

```typescript
export interface UniversitySummary {
  id: number;
  name: string;
  code: string;
  province: string;
  city: string;
  type: string | null;
  runningNature: string | null;
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
  logoUrl?: string | null; // <-- ADD
}
```

And update `apps/server/src/modules/admission/admission.service.ts` `findAggregated` to select `logoUrl` in the university include (look for `select: { id: true, name: true, ... }` and add `logoUrl: true`).

Rebuild shared:
```bash
cd packages/shared && pnpm build
cd ../../apps/server && pnpm build
```

- [ ] **Step 3: TS + build check**

```bash
cd apps/web
pnpm tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Administrator/Documents/VolunteerHelper
git add apps/web/src/app/\(main\)/scores/page.tsx packages/shared/src/types/admission.ts apps/server/src/modules/admission/admission.service.ts
git commit -m "feat(spec-1): scores page renders AdmissionRow list with rank coloring

Replaces antd Table with stacked AdmissionRow cards.
Adds LowConfidenceBanner above the list when any item is low-conf.
Selects logoUrl in aggregated query for logo display."
```

---

## Task 14: Frontend — Universities Detail Hero

**Files:**
- Modify: `apps/web/src/app/(main)/universities/[id]/page.tsx`

- [ ] **Step 1: Add UniversityLogo + HeroBanner to hero**

Locate the "Hero Header Card" div (around line 252 in current file). Replace its inner content:

```tsx
import UniversityLogo from '@/components/university/UniversityLogo';
import HeroBanner from '@/components/admission/HeroBanner';
import { useUserStore } from '@/stores/userStore';

// Inside the page component, after the existing useQuery hooks:
const { examInfo } = useUserStore();
const userSubject = examInfo.subjects?.[0]; // primary subject

const { data: university, isLoading } = useQuery({
  queryKey: ['university', id, userSubject],
  queryFn: () => universityService.getById(id, userSubject),
  enabled: !!id,
});

// In the JSX, replace the existing hero <div className="rounded-xl bg-surface shadow-card p-6 md:p-8 mb-4"> block with:

<div className="rounded-xl bg-surface shadow-card p-6 md:p-8 mb-4">
  <div className="flex items-start gap-5 flex-wrap">
    <UniversityLogo name={u.name} logoUrl={u.logoUrl} size={80} />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <h1 className="font-serif text-[32px] font-semibold text-text m-0">{u.name}</h1>
        <Space size={4}>
          {u.is985 && <span className="text-xs px-2 py-0.5 rounded-full bg-surface-dim text-text-secondary">985</span>}
          {u.is211 && <span className="text-xs px-2 py-0.5 rounded-full bg-surface-dim text-text-secondary">211</span>}
          {u.isDoubleFirstClass && <span className="text-xs px-2 py-0.5 rounded-full bg-surface-dim text-text-secondary">双一流</span>}
        </Space>
      </div>
      <div className="flex items-center gap-1 text-sm text-text-tertiary">
        <EnvironmentOutlined />
        {[u.province, u.city, u.type, u.level, u.runningNature].filter(Boolean).join(' · ')}
        {u.ranking && <span className="ml-2">· 全国排名 #{u.ranking}</span>}
      </div>
    </div>
    <div className="w-[280px]">
      <RankInput variant="compact" className="!bg-surface !border-border" />
    </div>
  </div>

  <HeroBanner
    university={{ is985: u.is985, is211: u.is211 }}
    prediction={u.bestPrediction}
    userRank={examInfo.rank}
  />
</div>
```

The existing `RankInput` is preserved on the right; existing `RankingCard / SatisfactionCard / EmploymentCard` in the tab body are not changed.

- [ ] **Step 2: TS check**

```bash
cd apps/web
pnpm tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/Administrator/Documents/VolunteerHelper
git add apps/web/src/app/\(main\)/universities/\[id\]/page.tsx
git commit -m "feat(spec-1): universities detail hero with logo + rank banner

80px UniversityLogo at left of name.
HeroBanner subtitle below header showing 冲/稳/保/垫 + diff sentence.
Query passes user's subject to backend for accurate bestPrediction."
```

---

## Task 15: Frontend — Majors Detail "开设院校" Tab

**Files:**
- Modify: `apps/web/src/app/(main)/majors/[id]/page.tsx`

- [ ] **Step 1: Replace universityColumns Table with AdmissionRow list**

Locate the `universities` tab (around line 122). Replace the antd `<Table columns={universityColumns} dataSource={m.enrollmentPlans} />` with:

```tsx
import AdmissionRow from '@/components/admission/AdmissionRow';
import LowConfidenceBanner from '@/components/admission/LowConfidenceBanner';

// In the tabItems array, replace the universities tab body:
{
  key: 'universities',
  label: <span><BankOutlined className="mr-1" />开设院校 ({m.enrollmentPlans?.length || 0})</span>,
  children: (
    <div className="px-4 py-2">
      <LowConfidenceBanner
        show={(m.enrollmentPlans ?? []).some((ep: any) => ep.predictedMinRank?.confidence === 'low')}
      />
      {(m.enrollmentPlans ?? []).length === 0 ? (
        <div className="text-center text-text-muted py-12">暂无开设院校数据</div>
      ) : (
        m.enrollmentPlans.map((ep: any) => (
          <AdmissionRow
            key={ep.id}
            data={{
              university: {
                id: ep.universityId,
                name: ep.university?.name ?? '',
                logoUrl: ep.university?.logoUrl,
                is985: ep.university?.is985 ?? false,
                is211: ep.university?.is211 ?? false,
                isDoubleFirstClass: ep.university?.isDoubleFirstClass ?? false,
              },
              majorName: m.name,
              groupCode: ep.groupCode ?? '',
              batch: ep.batch ?? '',
              recruitType: ep.recruitType ?? '',
              subjects: ep.subjects ?? '',
              predictedMinRank: ep.predictedMinRank,
            }}
            userRank={examInfo.rank}
          />
        ))
      )}
    </div>
  ),
},
```

Add `const { examInfo } = useUserStore();` near the top of the page component if not already present.

You can keep the original `universityColumns` definition if it's still referenced anywhere else; otherwise delete it cleanly.

- [ ] **Step 2: Verify backend selects logoUrl + flags in major service**

In `apps/server/src/modules/major/major.service.ts`, the `findOne`/`findById` query that includes `enrollmentPlans` should select the necessary university fields. Verify the include looks like:

```typescript
enrollmentPlans: {
  include: {
    university: {
      select: { id: true, name: true, logoUrl: true, is985: true, is211: true, isDoubleFirstClass: true },
    },
  },
},
```

If existing include is `university: true`, change to the explicit select above.

- [ ] **Step 3: TS check + build**

```bash
cd apps/web && pnpm tsc --noEmit
cd ../server && pnpm build
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Administrator/Documents/VolunteerHelper
git add apps/web/src/app/\(main\)/majors/\[id\]/page.tsx apps/server/src/modules/major/major.service.ts
git commit -m "feat(spec-1): majors detail '开设院校' tab uses AdmissionRow

Backend major.findOne selects university logoUrl + tier flags + injects
predictedMinRank per enrollmentPlan."
```

---

## Task 16: Frontend — Student Plans Page

**Files:**
- Modify: `apps/web/src/app/(student)/student/plans/[id]/page.tsx`

- [ ] **Step 1: Inspect current plan items rendering**

Read the file to find how plan items are currently rendered (likely a list of selected universities/majors). Identify the data shape — fields available per item include `universityId, groupCode, batch, recruitType, subjects, majorName`.

- [ ] **Step 2: Add prediction lookup query**

Add a TanStack Query that calls `admissionService.lookupPredictions` for all plan items. After plan data loads:

```tsx
import { admissionService } from '@/services/admission';

// Assuming `plan.items` is the array of plan entries with the shape above:
const predictionKeys = (plan?.items ?? []).map((it: any) => ({
  universityId: it.universityId,
  groupCode: it.groupCode,
  batch: it.batch,
  recruitType: it.recruitType,
  subjects: it.subjects,
}));

const { data: predData } = useQuery({
  queryKey: ['plan-predictions', predictionKeys],
  queryFn: () => admissionService.lookupPredictions({ keys: predictionKeys }),
  enabled: predictionKeys.length > 0,
});

const predictionByIndex = predData?.predictions ?? [];
```

- [ ] **Step 3: Render items as AdmissionRow**

Replace the existing per-item rendering with:

```tsx
{plan.items.map((it: any, idx: number) => (
  <AdmissionRow
    key={it.id ?? idx}
    data={{
      university: {
        id: it.universityId,
        name: it.universityName ?? '',
        logoUrl: it.universityLogoUrl ?? null,
        is985: it.is985 ?? false,
        is211: it.is211 ?? false,
        isDoubleFirstClass: it.isDoubleFirstClass ?? false,
      },
      majorName: it.majorName,
      groupCode: it.groupCode,
      batch: it.batch,
      recruitType: it.recruitType,
      subjects: it.subjects,
      predictedMinRank: predictionByIndex[idx] ?? null,
    }}
    userRank={examInfo.rank}
  />
))}
```

If the plan items shape differs, map fields accordingly. The minimum required fields are `universityId, universityName, is985, is211, groupCode, batch, recruitType, subjects, majorName`.

- [ ] **Step 4: TS check**

```bash
cd apps/web
pnpm tsc --noEmit
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Administrator/Documents/VolunteerHelper
git add apps/web/src/app/\(student\)/student/plans/\[id\]/page.tsx
git commit -m "feat(spec-1): student plan page renders items as AdmissionRow

Uses POST /admissions/lookup-predictions for batch prediction lookup."
```

---

## Task 17: Smoke Test (Optional but Recommended)

**Files:**
- Create: `apps/web/__tests__/admission-row.test.tsx` (only if jest-dom + RTL are configured for web)

- [ ] **Step 1: Check if web has React Testing Library**

```bash
cd apps/web
cat package.json | grep -E "testing-library|jsdom"
```
If RTL is not present, **skip this task**. Don't add new test framework dependencies — manual smoke testing on staging will suffice.

If RTL is present:

- [ ] **Step 2: Add minimal smoke test**

```typescript
import { render, screen } from '@testing-library/react';
import AdmissionRow from '@/components/admission/AdmissionRow';

describe('AdmissionRow', () => {
  const baseData = {
    university: { id: 1, name: '四川大学', logoUrl: null, is985: true, is211: true },
    majorName: '计算机',
    groupCode: '101',
    batch: '本科批A段',
    recruitType: '普通类本科',
    subjects: '物理',
    predictedMinRank: { point: 1620 } as any,
  };

  it('renders 冲 badge for ranking lower than user', () => {
    render(<AdmissionRow data={baseData} userRank={5000} />);
    expect(screen.getByText('冲')).toBeInTheDocument();
  });

  it('renders 暂无预测 when prediction is null', () => {
    render(<AdmissionRow data={{ ...baseData, predictedMinRank: null }} userRank={5000} />);
    expect(screen.getByText('暂无预测')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run + commit if green; otherwise skip**

```bash
cd apps/web
pnpm test
```

If green:
```bash
git add apps/web/__tests__/
git commit -m "test(spec-1): smoke test AdmissionRow renders 冲 + 暂无预测"
```

If RTL not configured: skip cleanly without commit.

---

## Self-Review

| Spec section | Implemented in tasks |
|---|---|
| 2 (落地页面 4 处) | T13 (scores), T14 (universities hero), T15 (majors), T16 (plans) |
| 3.1 阈值常量 | T1 |
| 3.2 classifyRank 双口径 | T2 |
| 3.3 getTier | T2 |
| 3.4 isHistorical | T2 |
| 4.1 卡片布局 (D 方案) | T5 |
| 4.2 hero 横幅 (B 方案) | T6 (HeroBanner) + T14 (落地) |
| 4.3 logo fallback (Y 方案) | T3 |
| 5.1 confidence banner (P1-C) | T6 + applied in T13/T15 |
| 5.2 unknown tier (P2-A) | T4 (badge styles) + T5 (left bar gray) |
| 6 文件结构 | All tasks; matches spec table |
| 7.1 scores 数据流 | T13 |
| 7.2 majors 后端 join | T11 |
| 7.3 plan 批量 lookup | T9 (endpoint) + T16 (consume) |
| 7.4 universities bestPrediction | T10 |
| 8 用户位次缺失 | T5 (AdmissionRow.userRank null → 'unknown') + T6 (HeroBanner) |
| 9 后端补充 | T7-T11 |

**Placeholder scan**: searched for TBD/TODO/"implement later" — none. The "If RTL not present, skip" in T17 is intentional and explicit.

**Type consistency**:
- `RankTier` defined in T2; used in T4, T5, T6 ✓
- `Tier` defined in T1; used in T2 (classifyRank, getTier) ✓
- `AdmissionRowData` shape defined in T5; consumed in T13/T15/T16 ✓
- `lookupPredictionsByKeys` defined in T7; called in T9 (controller), T10 (university), T11 (major), T12 (frontend service), T16 (plan page) ✓
- `bestPrediction` shape defined in T10; consumed in T14 (HeroBanner prediction prop) ✓
- `getTier` signature consistent across T2/T5/T6 (`{is985, is211, batch}`) ✓

---

## Plan complete

Saved to `docs/superpowers/plans/2026-05-04-spec-1-visual-foundation.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks
2. **Inline Execution** — execute tasks in this session using executing-plans

Which approach?
