# Stage 1 分数驱动选科 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Stage 1 表单的"选科"和"填分"两步合并，让学生在 9 个真实科目（语、数、外、物、史、化、生、政、地）输入框里直接输入分数，前端把 9 科表单语义层翻译为后端期望的 examType / firstChoice / reChoices / scoreFirstChoice / scoreSub1 / scoreSub2 / scoreChinese / scoreMath / scoreEnglish / totalScore 字段。

**Architecture:** 纯前端改动，单文件 + 一个新 mapping 模块。后端零改动。`to9Subjects(profile)` / `from9Subjects(form)` 两个纯函数承载所有翻译逻辑，可单独单测。`Stage1Fields` 组件用 `Form.Item` `shouldUpdate` 实现物理/历史和化生政地的互斥锁死。总分自动累加显示。

**Tech Stack:** Next.js 14 App Router + Ant Design 5 + React Hook Form (Form from antd) + jest + ts-jest（已有）。

**Spec:** `docs/superpowers/specs/2026-05-06-stage1-score-driven-subject-design.md`

---

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `apps/web/src/components/student/stage1-score-mapping.ts` | 新建 | `Subject9Form` 类型、`to9Subjects` / `from9Subjects` 纯函数、`validate6Subjects` 校验函数 |
| `apps/web/src/components/student/__tests__/stage1-score-mapping.test.ts` | 新建 | 上述纯函数的 jest 单元测试（6 用例） |
| `apps/web/src/app/(student)/student/profile/stage/[stage]/page.tsx` | 修改 | 重写 `Stage1Fields` 组件，stage 1 的 `useEffect` 回填和 `onSave` 提交分支 |

零修改：后端任何文件、`apps/web/src/components/student/stage-fields.ts`、stage 2 / stage 3 表单。

---

## Task 1: mapping 纯函数 + 单元测试（TDD）

**Files:**
- Create: `apps/web/src/components/student/stage1-score-mapping.ts`
- Create: `apps/web/src/components/student/__tests__/stage1-score-mapping.test.ts`

- [ ] **Step 1.1：写 6 个失败测试**

Create `apps/web/src/components/student/__tests__/stage1-score-mapping.test.ts`:

```ts
import {
  to9Subjects,
  from9Subjects,
  validate6Subjects,
  type Subject9Form,
} from '../stage1-score-mapping';

describe('stage1-score-mapping', () => {
  describe('to9Subjects (profile -> 9 科表单回填)', () => {
    it('物理类典型：物理 + 化学 + 生物', () => {
      const profile = {
        firstChoice: '物理',
        reChoices: ['化学', '生物'],
        scoreChinese: 120,
        scoreMath: 130,
        scoreEnglish: 125,
        scoreFirstChoice: 92,
        scoreSub1: 88,
        scoreSub2: 85,
      };
      expect(to9Subjects(profile)).toEqual({
        scoreChinese: 120,
        scoreMath: 130,
        scoreEnglish: 125,
        scorePhysics: 92,
        scoreChemistry: 88,
        scoreBiology: 85,
      });
    });

    it('历史类典型：历史 + 政治 + 地理', () => {
      const profile = {
        firstChoice: '历史',
        reChoices: ['政治', '地理'],
        scoreChinese: 115,
        scoreMath: 105,
        scoreEnglish: 130,
        scoreFirstChoice: 80,
        scoreSub1: 78,
        scoreSub2: 82,
      };
      expect(to9Subjects(profile)).toEqual({
        scoreChinese: 115,
        scoreMath: 105,
        scoreEnglish: 130,
        scoreHistory: 80,
        scorePolitics: 78,
        scoreGeography: 82,
      });
    });

    it('空 profile：返回空对象（所有字段 undefined）', () => {
      expect(to9Subjects({})).toEqual({});
    });

    it('缺再选数据：仅首选有值，化生政地全空', () => {
      const profile = {
        firstChoice: '物理',
        scoreFirstChoice: 95,
        scoreChinese: 120,
      };
      expect(to9Subjects(profile)).toEqual({
        scoreChinese: 120,
        scorePhysics: 95,
      });
    });
  });

  describe('from9Subjects (9 科表单 -> 后端 DTO 翻译)', () => {
    it('物理类典型：化学+生物 → sub1=化学,sub2=生物（化→生→政→地 顺序）', () => {
      const form: Subject9Form = {
        scoreChinese: 120,
        scoreMath: 130,
        scoreEnglish: 125,
        scorePhysics: 92,
        scoreChemistry: 88,
        scoreBiology: 85,
      };
      expect(from9Subjects(form)).toEqual({
        examType: 'PHYSICS',
        firstChoice: '物理',
        scoreFirstChoice: 92,
        reChoices: ['化学', '生物'],
        scoreSub1: 88,
        scoreSub2: 85,
        scoreChinese: 120,
        scoreMath: 130,
        scoreEnglish: 125,
        totalScore: 120 + 130 + 125 + 92 + 88 + 85, // 640
      });
    });

    it('历史类典型 + 跳过中间：政治+地理 → sub1=政治,sub2=地理', () => {
      const form: Subject9Form = {
        scoreChinese: 115,
        scoreMath: 105,
        scoreEnglish: 130,
        scoreHistory: 80,
        scorePolitics: 78,
        scoreGeography: 82,
      };
      expect(from9Subjects(form)).toEqual({
        examType: 'HISTORY',
        firstChoice: '历史',
        scoreFirstChoice: 80,
        reChoices: ['政治', '地理'],
        scoreSub1: 78,
        scoreSub2: 82,
        scoreChinese: 115,
        scoreMath: 105,
        scoreEnglish: 130,
        totalScore: 115 + 105 + 130 + 80 + 78 + 82, // 590
      });
    });

    it('再选顺序固定为 化→生→政→地（隐式 normalize）', () => {
      // 即使学生先填地理再填化学，输出 reChoices 仍按枚举顺序
      const form: Subject9Form = {
        scoreChinese: 100,
        scoreMath: 100,
        scoreEnglish: 100,
        scorePhysics: 90,
        scoreGeography: 75,
        scoreChemistry: 88,
      };
      const out = from9Subjects(form);
      expect(out.reChoices).toEqual(['化学', '地理']);
      expect(out.scoreSub1).toBe(88); // 化学
      expect(out.scoreSub2).toBe(75); // 地理
    });
  });

  describe('round-trip 一致性', () => {
    it('合规 profile 经 to → from 还原（modulo 再选顺序 normalize）', () => {
      const profile = {
        firstChoice: '物理',
        reChoices: ['化学', '生物'],
        scoreChinese: 120, scoreMath: 130, scoreEnglish: 125,
        scoreFirstChoice: 92, scoreSub1: 88, scoreSub2: 85,
      };
      const restored = from9Subjects(to9Subjects(profile));
      expect(restored.firstChoice).toBe(profile.firstChoice);
      expect(restored.reChoices).toEqual(profile.reChoices);
      expect(restored.scoreFirstChoice).toBe(profile.scoreFirstChoice);
      expect(restored.scoreSub1).toBe(profile.scoreSub1);
      expect(restored.scoreSub2).toBe(profile.scoreSub2);
      expect(restored.scoreChinese).toBe(profile.scoreChinese);
      expect(restored.scoreMath).toBe(profile.scoreMath);
      expect(restored.scoreEnglish).toBe(profile.scoreEnglish);
      expect(restored.totalScore).toBe(120 + 130 + 125 + 92 + 88 + 85);
    });
  });

  describe('validate6Subjects', () => {
    const completeForm: Subject9Form = {
      scoreChinese: 120, scoreMath: 130, scoreEnglish: 125,
      scorePhysics: 92, scoreChemistry: 88, scoreBiology: 85,
    };

    it('6 门齐全：通过', () => {
      expect(validate6Subjects(completeForm)).toBeNull();
    });

    it('缺英语：返回错误信息', () => {
      const f = { ...completeForm, scoreEnglish: undefined };
      expect(validate6Subjects(f)).toMatch(/语文.*数学.*英语/);
    });

    it('物理历史都没填：返回首选缺失错误', () => {
      const f = { ...completeForm, scorePhysics: undefined };
      expect(validate6Subjects(f)).toMatch(/物理.*历史/);
    });

    it('物理历史都填了：返回互斥错误', () => {
      const f = { ...completeForm, scoreHistory: 70 };
      expect(validate6Subjects(f)).toMatch(/只能填一门/);
    });

    it('再选只填了 1 门：返回再选数量错误', () => {
      const f = { ...completeForm, scoreBiology: undefined };
      expect(validate6Subjects(f)).toMatch(/再选.*2 门/);
    });

    it('再选填了 3 门：返回再选数量错误', () => {
      const f = { ...completeForm, scorePolitics: 70 };
      expect(validate6Subjects(f)).toMatch(/再选.*2 门/);
    });
  });
});
```

- [ ] **Step 1.2：运行测试，确认全部失败（找不到模块）**

Run:
```bash
cd apps/web && npx jest src/components/student/__tests__/stage1-score-mapping.test.ts
```

Expected: FAIL with "Cannot find module '../stage1-score-mapping'"

- [ ] **Step 1.3：实现最小代码让测试通过**

Create `apps/web/src/components/student/stage1-score-mapping.ts`:

```ts
/**
 * Stage 1 9 科分数 ↔ 后端槽位字段翻译层
 *
 * 后端期望字段：examType / firstChoice / reChoices / scoreFirstChoice / scoreSub1 / scoreSub2
 * 前端展示字段：scorePhysics / scoreHistory / scoreChemistry / scoreBiology / scorePolitics / scoreGeography
 *
 * 翻译规则：
 * - 物理/历史 互斥（同时只能有一个有值），决定 examType + firstChoice + scoreFirstChoice
 * - 化生政地 选 2，按固定枚举顺序 化→生→政→地 映射到 reChoices / scoreSub1 / scoreSub2
 * - 总分 = 6 个有值科目分数累加（裸分）
 */

export interface Subject9Form {
  scoreChinese?: number;
  scoreMath?: number;
  scoreEnglish?: number;
  scorePhysics?: number;
  scoreHistory?: number;
  scoreChemistry?: number;
  scoreBiology?: number;
  scorePolitics?: number;
  scoreGeography?: number;
}

const RE_SUBJECTS_ORDER = ['化学', '生物', '政治', '地理'] as const;
type ReSubject = (typeof RE_SUBJECTS_ORDER)[number];

const RE_KEY_MAP: Record<ReSubject, keyof Subject9Form> = {
  化学: 'scoreChemistry',
  生物: 'scoreBiology',
  政治: 'scorePolitics',
  地理: 'scoreGeography',
};

/** 后端 profile → 9 科表单（回填）。返回 undefined 字段不写入对象。 */
export function to9Subjects(profile: Record<string, any>): Subject9Form {
  const out: Subject9Form = {};
  if (profile.scoreChinese != null) out.scoreChinese = profile.scoreChinese;
  if (profile.scoreMath != null) out.scoreMath = profile.scoreMath;
  if (profile.scoreEnglish != null) out.scoreEnglish = profile.scoreEnglish;

  // 首选：根据 firstChoice 字符串决定回填到 物理 还是 历史 格
  if (profile.firstChoice === '物理' && profile.scoreFirstChoice != null) {
    out.scorePhysics = profile.scoreFirstChoice;
  }
  if (profile.firstChoice === '历史' && profile.scoreFirstChoice != null) {
    out.scoreHistory = profile.scoreFirstChoice;
  }

  // 再选：reChoices[0]/[1] 名称对应 sub1/sub2 分数
  const reChoices: unknown = profile.reChoices;
  if (Array.isArray(reChoices)) {
    if (typeof reChoices[0] === 'string' && reChoices[0] in RE_KEY_MAP && profile.scoreSub1 != null) {
      out[RE_KEY_MAP[reChoices[0] as ReSubject]] = profile.scoreSub1;
    }
    if (typeof reChoices[1] === 'string' && reChoices[1] in RE_KEY_MAP && profile.scoreSub2 != null) {
      out[RE_KEY_MAP[reChoices[1] as ReSubject]] = profile.scoreSub2;
    }
  }
  return out;
}

/** 9 科表单 → 后端 DTO 子集（提交时翻译）。要求 6 门已凑齐。 */
export function from9Subjects(form: Subject9Form): {
  examType: 'PHYSICS' | 'HISTORY';
  firstChoice: '物理' | '历史';
  scoreFirstChoice: number | undefined;
  reChoices: string[];
  scoreSub1: number | undefined;
  scoreSub2: number | undefined;
  scoreChinese: number | undefined;
  scoreMath: number | undefined;
  scoreEnglish: number | undefined;
  totalScore: number;
} {
  const isPhysics = form.scorePhysics != null;
  const reChoices = RE_SUBJECTS_ORDER.filter(
    (s) => form[RE_KEY_MAP[s]] != null,
  );
  const total =
    (form.scoreChinese ?? 0) +
    (form.scoreMath ?? 0) +
    (form.scoreEnglish ?? 0) +
    (form.scorePhysics ?? form.scoreHistory ?? 0) +
    reChoices.reduce((s, k) => s + (form[RE_KEY_MAP[k]] ?? 0), 0);
  return {
    examType: isPhysics ? 'PHYSICS' : 'HISTORY',
    firstChoice: isPhysics ? '物理' : '历史',
    scoreFirstChoice: isPhysics ? form.scorePhysics : form.scoreHistory,
    reChoices: [...reChoices],
    scoreSub1: reChoices[0] ? form[RE_KEY_MAP[reChoices[0]]] : undefined,
    scoreSub2: reChoices[1] ? form[RE_KEY_MAP[reChoices[1]]] : undefined,
    scoreChinese: form.scoreChinese,
    scoreMath: form.scoreMath,
    scoreEnglish: form.scoreEnglish,
    totalScore: total,
  };
}

/** 6 门齐全校验。通过返回 null，否则返回错误文案。 */
export function validate6Subjects(form: Subject9Form): string | null {
  if (form.scoreChinese == null || form.scoreMath == null || form.scoreEnglish == null) {
    return '请填写语文、数学、英语成绩';
  }
  const hasPhysics = form.scorePhysics != null;
  const hasHistory = form.scoreHistory != null;
  if (hasPhysics && hasHistory) return '物理和历史只能填一门';
  if (!hasPhysics && !hasHistory) return '请填写物理或历史的成绩（首选科目）';

  const reCount = RE_SUBJECTS_ORDER.filter((s) => form[RE_KEY_MAP[s]] != null).length;
  if (reCount !== 2) return '再选科目需填写 2 门（化/生/政/地）';

  return null;
}
```

- [ ] **Step 1.4：运行测试，确认全部通过**

Run:
```bash
cd apps/web && npx jest src/components/student/__tests__/stage1-score-mapping.test.ts
```

Expected: PASS, 11 个测试全绿。

- [ ] **Step 1.5：跑全量测试确保无回归**

Run:
```bash
cd apps/web && npx jest
```

Expected: 所有原有测试 + 新测试 PASS。

- [ ] **Step 1.6：commit**

```bash
git add apps/web/src/components/student/stage1-score-mapping.ts \
        apps/web/src/components/student/__tests__/stage1-score-mapping.test.ts
git commit -m "feat(student): add 9-subject score mapping for stage1 form

Pure functions translating between the 9 real-subject form fields
(语数外+物史化生政地) and backend slot fields
(scoreFirstChoice/scoreSub1/scoreSub2 + firstChoice/reChoices).
Re-electives normalize to fixed enum order (化→生→政→地)."
```

---

## Task 2: 重写 Stage1Fields 组件 UI

**Files:**
- Modify: `apps/web/src/app/(student)/student/profile/stage/[stage]/page.tsx`（替换 `Stage1Fields()` 函数体）

**前置阅读**：当前 `Stage1Fields()` 实现位于 153-279 行。需要保留的字段：`realName / phone / parentPhone / gender / formFiller`。需要替换的：`examType / firstChoice / reChoices / totalScore` 下拉框 + 6 个分数输入框。

- [ ] **Step 2.1：在文件顶部追加 import**

Modify imports block (第 19-27 行附近)，添加：

```ts
import {
  Subject9Form,
  to9Subjects,
  from9Subjects,
  validate6Subjects,
} from '@/components/student/stage1-score-mapping';
```

- [ ] **Step 2.2：替换 Stage1Fields 函数体**

将 `function Stage1Fields() { ... }`（153-279 行）整体替换为：

```tsx
function Stage1Fields() {
  return (
    <>
      <Form.Item name="realName" label="姓名" rules={[{ required: true }]}>
        <Input placeholder="你的真实姓名" />
      </Form.Item>
      <Form.Item name="phone" label="手机号" rules={[{ required: true }]}>
        <Input placeholder="11 位手机号" />
      </Form.Item>
      <Form.Item
        name="parentPhone"
        label="家长手机号"
        rules={[{ required: true }]}
      >
        <Input placeholder="家长联系电话" />
      </Form.Item>
      <Form.Item name="gender" label="性别" rules={[{ required: true }]}>
        <Radio.Group>
          <Radio value="MALE">男</Radio>
          <Radio value="FEMALE">女</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="formFiller" label="填表人" rules={[{ required: true }]}>
        <Radio.Group>
          <Radio value="STUDENT">学生本人</Radio>
          <Radio value="PARENT">家长</Radio>
          <Radio value="TOGETHER">共同填写</Radio>
        </Radio.Group>
      </Form.Item>

      {/* ─── 高考成绩：9 科分数驱动选科 ─── */}
      <div className="mt-6 mb-2 text-sm font-semibold text-text">高考成绩</div>
      <p className="mb-3 text-xs text-text-secondary">
        填语数外 + 物理或历史 + 任选 2 门（化/生/政/地）。系统会自动识别你的科类和选考组合。
      </p>

      <div className="grid grid-cols-3 gap-4">
        <Form.Item name="scoreChinese" label="语文" rules={[{ required: true, message: '必填' }]}>
          <InputNumber min={0} max={150} className="w-full" />
        </Form.Item>
        <Form.Item name="scoreMath" label="数学" rules={[{ required: true, message: '必填' }]}>
          <InputNumber min={0} max={150} className="w-full" />
        </Form.Item>
        <Form.Item name="scoreEnglish" label="英语" rules={[{ required: true, message: '必填' }]}>
          <InputNumber min={0} max={150} className="w-full" />
        </Form.Item>
      </div>

      {/* 物理/历史 互斥锁死 */}
      <Form.Item
        noStyle
        shouldUpdate={(p, c) =>
          p.scorePhysics !== c.scorePhysics || p.scoreHistory !== c.scoreHistory
        }
      >
        {({ getFieldValue }) => {
          const hasPhysics = getFieldValue('scorePhysics') != null;
          const hasHistory = getFieldValue('scoreHistory') != null;
          return (
            <div className="grid grid-cols-2 gap-4">
              <Form.Item name="scorePhysics" label="物理">
                <InputNumber
                  min={0}
                  max={100}
                  className="w-full"
                  disabled={hasHistory}
                  placeholder={hasHistory ? '已选历史' : ''}
                />
              </Form.Item>
              <Form.Item name="scoreHistory" label="历史">
                <InputNumber
                  min={0}
                  max={100}
                  className="w-full"
                  disabled={hasPhysics}
                  placeholder={hasPhysics ? '已选物理' : ''}
                />
              </Form.Item>
            </div>
          );
        }}
      </Form.Item>

      {/* 化生政地：最多 2 个有值，第 3 个 disabled */}
      <Form.Item
        noStyle
        shouldUpdate={(p, c) =>
          p.scoreChemistry !== c.scoreChemistry ||
          p.scoreBiology !== c.scoreBiology ||
          p.scorePolitics !== c.scorePolitics ||
          p.scoreGeography !== c.scoreGeography
        }
      >
        {({ getFieldValue }) => {
          const reKeys = ['scoreChemistry', 'scoreBiology', 'scorePolitics', 'scoreGeography'] as const;
          const filledCount = reKeys.filter((k) => getFieldValue(k) != null).length;
          const lockOthers = filledCount >= 2;
          const isFilled = (k: string) => getFieldValue(k) != null;
          return (
            <div className="grid grid-cols-4 gap-4">
              <Form.Item name="scoreChemistry" label="化学">
                <InputNumber
                  min={0}
                  max={100}
                  className="w-full"
                  disabled={lockOthers && !isFilled('scoreChemistry')}
                />
              </Form.Item>
              <Form.Item name="scoreBiology" label="生物">
                <InputNumber
                  min={0}
                  max={100}
                  className="w-full"
                  disabled={lockOthers && !isFilled('scoreBiology')}
                />
              </Form.Item>
              <Form.Item name="scorePolitics" label="政治">
                <InputNumber
                  min={0}
                  max={100}
                  className="w-full"
                  disabled={lockOthers && !isFilled('scorePolitics')}
                />
              </Form.Item>
              <Form.Item name="scoreGeography" label="地理">
                <InputNumber
                  min={0}
                  max={100}
                  className="w-full"
                  disabled={lockOthers && !isFilled('scoreGeography')}
                />
              </Form.Item>
            </div>
          );
        }}
      </Form.Item>

      {/* 总分自动累加显示 */}
      <Form.Item
        noStyle
        shouldUpdate={(p, c) =>
          p.scoreChinese !== c.scoreChinese ||
          p.scoreMath !== c.scoreMath ||
          p.scoreEnglish !== c.scoreEnglish ||
          p.scorePhysics !== c.scorePhysics ||
          p.scoreHistory !== c.scoreHistory ||
          p.scoreChemistry !== c.scoreChemistry ||
          p.scoreBiology !== c.scoreBiology ||
          p.scorePolitics !== c.scorePolitics ||
          p.scoreGeography !== c.scoreGeography
        }
      >
        {({ getFieldsValue }) => {
          const v = getFieldsValue([
            'scoreChinese', 'scoreMath', 'scoreEnglish',
            'scorePhysics', 'scoreHistory',
            'scoreChemistry', 'scoreBiology', 'scorePolitics', 'scoreGeography',
          ]) as Subject9Form;
          const total =
            (v.scoreChinese ?? 0) + (v.scoreMath ?? 0) + (v.scoreEnglish ?? 0) +
            (v.scorePhysics ?? v.scoreHistory ?? 0) +
            (v.scoreChemistry ?? 0) + (v.scoreBiology ?? 0) +
            (v.scorePolitics ?? 0) + (v.scoreGeography ?? 0);
          return (
            <div className="mt-2 mb-2 rounded-md bg-surface-2 px-4 py-3 text-base">
              总分（自动累加）：<span className="font-semibold">{total}</span> 分
            </div>
          );
        }}
      </Form.Item>

      <p className="text-xs text-text-faint">
        提示：填好成绩后，系统会自动用一分一段表算出全省位次（位次仅老师可看；如有政策加分，老师录入后参与位次计算）。
      </p>
    </>
  );
}
```

**改动要点说明**：
- 删除「科类」`Select` / 「首选科目」自动同步 `Form.Item` / 「再选科目」`Select mode=multiple` / 「高考总分」`InputNumber`
- 删除 6 个抽象槽位输入框（`totalScore / scoreFirstChoice / scoreSub1 / scoreSub2`）
- 替换为 9 个具体科目 `InputNumber`，按"语数外 / 物史 / 化生政地"三组栅格排布
- 物理/历史用 `shouldUpdate` 实时计算 disabled 状态
- 化生政地用 `shouldUpdate` 计算"已填 ≥ 2 时锁住未填的"
- 总分用 `shouldUpdate` + `getFieldsValue` 实时累加
- `formFiller` 移到分数前（语义上"基本信息"应该聚集），保持表单流顺畅
- 不影响 `realName / phone / parentPhone / gender` 字段

- [ ] **Step 2.3：本地启动 dev server 目视检查 UI**

```bash
cd apps/web && pnpm dev
```

打开 `http://localhost:3000/student/profile/stage/1`（或线上 `http://132.232.245.53:3004/student/profile/stage/1`）。

Expected:
- 9 个分数输入框按 3+2+4 栅格排列
- 物理输入 50 → 历史框立即变灰且 placeholder="已选物理"
- 化学+生物各填 → 政治+地理变灰
- 输入随便几个分数 → 总分实时累加显示

此步**不**点保存（提交逻辑还没接好）。

- [ ] **Step 2.4：commit（仅 UI 改动）**

```bash
git add apps/web/src/app/\(student\)/student/profile/stage/\[stage\]/page.tsx
git commit -m "feat(student): rewrite Stage1Fields with 9-subject score inputs

Replace exam-type dropdown + re-elective multi-select + 6 abstract score
slots with 9 real-subject InputNumber fields. Physics/history mutex
locking via shouldUpdate. Re-elective slots lock at 2 filled. Total
score auto-sums and displays read-only.

NOTE: submit/load logic still uses old fields — wired up in next commits."
```

---

## Task 3: stage 1 回填逻辑（profile → 9 科表单）

**Files:**
- Modify: `apps/web/src/app/(student)/student/profile/stage/[stage]/page.tsx:60-66`（替换 `useEffect` 内部）

- [ ] **Step 3.1：修改回填 `useEffect`**

将 60-66 行的：

```ts
  useEffect(() => {
    if (!profile || !fields) return;
    const initial: Record<string, any> = {};
    for (const f of fields) initial[f] = profile[f];
    initial.dataVersion = profile.dataVersion ?? 0;
    form.setFieldsValue(initial);
  }, [profile, fields, form]);
```

替换为：

```ts
  useEffect(() => {
    if (!profile || !fields) return;
    const initial: Record<string, any> = {};
    if (stage === '1') {
      // stage 1 走 9 科语义层：先回填非分数字段，再用 to9Subjects 解构槽位为具体科目
      const nonScoreFields = ['realName', 'phone', 'parentPhone', 'gender', 'formFiller'];
      for (const f of nonScoreFields) initial[f] = profile[f];
      Object.assign(initial, to9Subjects(profile));
    } else {
      for (const f of fields) initial[f] = profile[f];
    }
    initial.dataVersion = profile.dataVersion ?? 0;
    form.setFieldsValue(initial);
  }, [profile, fields, form, stage]);
```

**说明**：stage 2 / stage 3 行为完全不变（走 else 分支）；stage 1 改为只回填非分数字段 + 9 科分数字段（其他后端字段如 `examType / firstChoice / reChoices / scoreFirstChoice / scoreSub1 / scoreSub2 / totalScore` 不写入 form，提交时统一通过 `from9Subjects` 重新生成）。

- [ ] **Step 3.2：手动验证回填**

打开 `http://localhost:3000/student/profile/stage/1`：

Expected (假设当前账号 profile 中 firstChoice='物理', reChoices=['化学','生物'], scoreFirstChoice=92, scoreSub1=88, scoreSub2=85, scoreChinese=120, scoreMath=130, scoreEnglish=125)：
- 语文格 = 120, 数学 = 130, 英语 = 125
- 物理格 = 92，历史格空且 disabled
- 化学 = 88，生物 = 85，政治/地理空且 disabled
- 总分显示 = 640

如果是新账号空 profile：9 个格全空，所有都可填。

- [ ] **Step 3.3：commit**

```bash
git add apps/web/src/app/\(student\)/student/profile/stage/\[stage\]/page.tsx
git commit -m "feat(student): wire stage1 profile load via to9Subjects

Stage 1 now decodes backend slot fields (firstChoice/reChoices/sub1/sub2)
into the 9 real-subject form fields on initial load. Stage 2/3 behavior
unchanged."
```

---

## Task 4: stage 1 提交逻辑 + 校验

**Files:**
- Modify: `apps/web/src/app/(student)/student/profile/stage/[stage]/page.tsx:104-108`（替换 `onSave`）

- [ ] **Step 4.1：修改 `onSave` 函数**

将 104-108 行的：

```ts
  const onSave = () => {
    form.validateFields().then((values) => {
      saveMutation.mutate(values as UpdateStudentDto);
    });
  };
```

替换为：

```ts
  const onSave = () => {
    form.validateFields().then((values) => {
      if (stage === '1') {
        // stage 1: 9 科 → 6 门齐全校验 → 翻译为后端槽位字段
        const subj9 = {
          scoreChinese: values.scoreChinese,
          scoreMath: values.scoreMath,
          scoreEnglish: values.scoreEnglish,
          scorePhysics: values.scorePhysics,
          scoreHistory: values.scoreHistory,
          scoreChemistry: values.scoreChemistry,
          scoreBiology: values.scoreBiology,
          scorePolitics: values.scorePolitics,
          scoreGeography: values.scoreGeography,
        } as Subject9Form;
        const err = validate6Subjects(subj9);
        if (err) {
          void message.error(err);
          return;
        }
        const translated = from9Subjects(subj9);
        const payload: UpdateStudentDto = {
          dataVersion: values.dataVersion,
          realName: values.realName,
          phone: values.phone,
          parentPhone: values.parentPhone,
          gender: values.gender,
          formFiller: values.formFiller,
          ...translated,
        };
        saveMutation.mutate(payload);
        return;
      }
      saveMutation.mutate(values as UpdateStudentDto);
    });
  };
```

**说明**：
- stage 1 增加一道 `validate6Subjects` 校验，失败弹 `message.error` 不提交。
- 通过校验后用 `from9Subjects` 把 9 科翻译为后端 DTO，再 merge 非分数字段 + `dataVersion` 一并提交。
- stage 2 / stage 3 行为完全不变。

**注意**：`formFiller` 在 `UpdateStudentDto` 类型里如果不存在，会触发 TS 错误。检查 `UpdateStudentDto` 是否包含 `formFiller`：

```bash
grep -n "formFiller" apps/web/src/services/student-api.ts
```

如果没有，则去掉 payload 中的 `formFiller: values.formFiller`，让原 form values 带过去（antd 的 form 也不强制按 DTO 提交）。或者直接在 payload 末尾扩展 `...{ formFiller: values.formFiller } as any`。在 commit 前确认。

- [ ] **Step 4.2：手动验证保存**

在 dev server 上：

**Case A（新数据）**：空表单只填语数外 + 物理 + 化学/生物。
1. 点保存 → 后端写入 `examType=PHYSICS, firstChoice=物理, reChoices=[化学,生物], scoreFirstChoice=<物理分>, scoreSub1=<化学分>, scoreSub2=<生物分>, totalScore=6 科和`
2. 刷新页面 → 9 科正确回显

**Case B（缺字段）**：只填语文，点保存。
Expected: 弹出红字错误 `"请填写语文、数学、英语成绩"`，未发起请求。

**Case C（再选只 1 门）**：填齐语数外 + 物理 + 仅化学。点保存。
Expected: 弹出红字错误 `"请填写 2 门再选科目（化/生/政/地）的成绩"`。

**Case D（已有数据原样保存）**：profile 已合规，进入页面不修改任何字段，点保存。
Expected: 保存成功；数据库槽位字段值不变（除 `dataVersion` +1）。可在数据库直查或观察 Network → /students/me PUT 请求 body 验证 reChoices 顺序仍是 `['化学','生物']`（按枚举固定）。

- [ ] **Step 4.3：commit**

```bash
git add apps/web/src/app/\(student\)/student/profile/stage/\[stage\]/page.tsx
git commit -m "feat(student): wire stage1 save via validate6Subjects + from9Subjects

Stage 1 now validates 6-subject completeness (语数外+物/史选1+再选2) before
submit; failure shows error message and aborts. On success, translates the
9-subject form into backend slot fields. Stage 2/3 behavior unchanged."
```

---

## Task 5: 手动回归 + 收尾

**Files:** 无代码改动（仅验证）。

- [ ] **Step 5.1：跑全量测试**

```bash
cd apps/web && npx jest
```

Expected: 全绿，含新增 11 个 mapping 测试。

- [ ] **Step 5.2：跑 typecheck（如有）**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误。如果报 `formFiller` 不在 `UpdateStudentDto` 上，按 Step 4.1 注释处理。

- [ ] **Step 5.3：跑 lint（如有）**

```bash
cd apps/web && pnpm lint 2>/dev/null || npx eslint src --ext .ts,.tsx
```

Expected: 无新增 error/warning。

- [ ] **Step 5.4：浏览器端到端回归**

`http://132.232.245.53:3004/student/profile/stage/1`：

| 场景 | 预期 |
|---|---|
| 新账号空 profile | 9 格全空、可填、总分=0 |
| 已有合规账号回填 | 6 个有值格正确显示，未选 2 个 disabled |
| 物理填值 | 历史立即灰且清空 |
| 物理清空 | 历史解锁 |
| 化生政地填 2 个 | 另外 2 个灰 |
| 修改任意分数 | 总分实时变 |
| 保存 6 门齐全 | message 成功 + Network 请求 body 含正确槽位字段 |
| 保存缺英语 | 红字错误 + 不发请求 |
| 保存物理+历史都填（如能绕过锁死） | 红字 `物理和历史只能填一门` |
| stage 2 / stage 3 | 行为完全不变 |

- [ ] **Step 5.5：刷新 commit hash 确认（不要新 commit）**

```bash
git log --oneline -5
```

Expected: 看到本计划的 4 个 commit + 之前的 spec commit。

如果 Step 5.1-5.3 中发现遗留问题，单独修复后 commit。本任务不产生新功能 commit。

---

## Self-Review Notes

**Spec coverage**：
- §4.1 视觉布局 → Task 2 Step 2.2 ✓
- §4.2 互斥锁死 + 总分累加 → Task 2 Step 2.2 (shouldUpdate) ✓
- §4.3 错误信息 → Task 1 Step 1.3 (validate6Subjects) + Task 4 Step 4.1 ✓
- §5.1 from9Subjects 翻译 → Task 1 Step 1.3 ✓
- §5.2 to9Subjects 回填 → Task 1 Step 1.3 ✓
- §5.3 往返一致性测试 → Task 1 Step 1.1 (round-trip 用例) ✓
- §6 模块边界（单 page.tsx + 新 mapping 模块） → Task 1+2+3+4 ✓
- §7.1 6 个测试用例 → Task 1 实际 11 个用例（覆盖更细） ✓
- §7.2 组件测试（推荐非阻断） → 不做（项目 jest config 是 node env，且 spec 标注非阻断）
- §7.3 手动回归 → Task 5 Step 5.4 ✓
- §10 完成判定 7 项 → Task 5 全覆盖 ✓

**Type consistency**：`Subject9Form` / `to9Subjects` / `from9Subjects` / `validate6Subjects` 在所有任务中名称一致。`UpdateStudentDto` 来自 `@/services/student-api`，第 1 行已 import。

**Placeholder scan**：无 TBD/TODO/"add validation"/"similar to"。Task 4 Step 4.1 有一个真实的运行时检查（`formFiller` 是否在 DTO），不是占位符——是要执行的小动作。
