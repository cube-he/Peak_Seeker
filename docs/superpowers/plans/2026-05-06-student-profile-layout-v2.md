# Student Profile Layout v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make profile page compact (~78% height reduction) by upgrading control types, multi-column layout, collapsible sections, single-line progress, and toast save status.

**Architecture:** Extract `useAutoSave` hook from existing AutoSaveField. Build 7 new typed AutoSave* wrappers + reuse existing AutoSaveField. Convert SaveStatusBar to antd `message` toast. Convert profile page from 7 cards to Collapse with compact progress.

**Tech Stack:** TypeScript, React 18, Next.js 15 App Router, antd, zustand, Jest.

**Spec:** [`docs/superpowers/specs/2026-05-06-student-profile-layout-v2-design.md`](../specs/2026-05-06-student-profile-layout-v2-design.md)

**Key field type corrections (from schema audit):**
- `height`/`weight`: Decimal(5,1) → `<InputNumber step=0.1>`
- `tuitionBudget`: enum {LOW,MEDIUM,HIGH,UNLIMITED} → `<Radio.Group>` (NOT InputNumber)
- `priorityMode`: enum {UNIVERSITY_FIRST,MAJOR_FIRST,CITY_FIRST,BALANCED} → Radio
- `stayPreference`: enum {LOCAL_ONLY,PREFER_LOCAL,NO_PREFERENCE,PREFER_OUTSIDE} → Radio
- `formFiller`: enum {STUDENT,PARENT,TOGETHER} → Radio

---

## File Structure

```
apps/web/src/components/student/auto-save/   (new dir)
├── useAutoSave.ts                  ← extract from existing AutoSaveField
├── AutoSaveField.tsx               ← MOVED + use hook
├── AutoSaveNumber.tsx              (new)
├── AutoSaveSwitch.tsx              (new)
├── AutoSaveRadio.tsx               (new)
├── AutoSaveCheckbox.tsx            (new)
├── AutoSaveSelect.tsx              (new)
├── AutoSaveTextArea.tsx            (new)
├── AutoSaveCascader.tsx            (new)
└── __tests__/                      ← move existing AutoSaveField test + add 7

apps/web/src/components/student/CompactProgress.tsx (new)
apps/web/src/components/student/SaveStatusBar.tsx   (rewrite to toast)
apps/web/src/components/student/sections/*Section.tsx (7 rewrite)
apps/web/src/app/(student)/student/profile/page.tsx  (rewrite to Collapse)
```

Old `AutoSaveField.tsx` at `components/student/AutoSaveField.tsx` is moved into the `auto-save/` subdirectory. All importers updated.

---

### Task 1: Extract useAutoSave hook + move AutoSaveField

**Files:**
- Create: `apps/web/src/components/student/auto-save/useAutoSave.ts`
- Move: `apps/web/src/components/student/AutoSaveField.tsx` → `apps/web/src/components/student/auto-save/AutoSaveField.tsx`
- Move: `apps/web/src/components/student/__tests__/AutoSaveField.test.tsx` → `apps/web/src/components/student/auto-save/__tests__/AutoSaveField.test.tsx`

- [ ] **Step 1: Create useAutoSave.ts**

```ts
'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

const DEBOUNCE_MS = 1500;

function makeDebounced<T extends (...args: any[]) => any>(fn: T, wait: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  debounced.cancel = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };
  return debounced;
}

export function useAutoSave(fieldKey: string) {
  const setSaving = useStudentSaveStore((s) => s.setSaving);
  const setSaved = useStudentSaveStore((s) => s.setSaved);
  const setError = useStudentSaveStore((s) => s.setError);

  const send = useCallback(
    async (val: unknown) => {
      setSaving();
      try {
        await studentApi.patchMyProfile({ [fieldKey]: val } as any);
        setSaved();
      } catch (e) {
        setError((e as Error).message ?? '保存失败');
      }
    },
    [fieldKey, setSaving, setSaved, setError],
  );

  const debouncedSend = useMemo(
    () => makeDebounced((val: unknown) => { void send(val); }, DEBOUNCE_MS),
    [send],
  );

  useEffect(() => () => { debouncedSend.cancel(); }, [debouncedSend]);

  return { commit: debouncedSend, cancel: debouncedSend.cancel };
}
```

- [ ] **Step 2: Move + rewrite AutoSaveField.tsx**

Create `apps/web/src/components/student/auto-save/AutoSaveField.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Input } from 'antd';
import { useAutoSave } from './useAutoSave';

interface Props {
  fieldKey: string;
  defaultValue?: string;
  placeholder?: string;
}

export default function AutoSaveField({ fieldKey, defaultValue = '', placeholder }: Props) {
  const [value, setValue] = useState(defaultValue);
  const { commit } = useAutoSave(fieldKey);
  return (
    <Input
      value={value}
      placeholder={placeholder}
      onChange={(e) => { setValue(e.target.value); commit(e.target.value); }}
    />
  );
}
```

Then DELETE the old file:
```bash
git rm apps/web/src/components/student/AutoSaveField.tsx
```

- [ ] **Step 3: Move existing test**

```bash
mkdir -p apps/web/src/components/student/auto-save/__tests__
git mv apps/web/src/components/student/__tests__/AutoSaveField.test.tsx apps/web/src/components/student/auto-save/__tests__/AutoSaveField.test.tsx
```

In the moved test file, change the import:
```tsx
import AutoSaveField from '../AutoSaveField';
```

- [ ] **Step 4: Update all import paths in repo**

```bash
grep -rl "from '@/components/student/AutoSaveField'" apps/web/src/ 2>/dev/null
grep -rl "from '../AutoSaveField'" apps/web/src/components/student/sections/ 2>/dev/null
```

For each match, update import path to `'@/components/student/auto-save/AutoSaveField'` (absolute) or `'../auto-save/AutoSaveField'` (from sections).

- [ ] **Step 5: Run tests + tsc**

```bash
cd apps/web && pnpm jest AutoSaveField -v && pnpm tsc --noEmit 2>&1 | head -20
```

Expected: 4 tests pass, no new tsc errors related to import paths.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/student/ apps/web/src/components/student/auto-save/
git commit -m "refactor(web): extract useAutoSave hook + move AutoSaveField to subdir"
```

---

### Task 2: AutoSaveNumber + AutoSaveSwitch + AutoSaveTextArea (RED+GREEN combined)

**Files:**
- Create: `apps/web/src/components/student/auto-save/AutoSaveNumber.tsx`
- Create: `apps/web/src/components/student/auto-save/AutoSaveSwitch.tsx`
- Create: `apps/web/src/components/student/auto-save/AutoSaveTextArea.tsx`
- Create: corresponding 3 test files in `__tests__/`

- [ ] **Step 1: Create AutoSaveNumber + test**

```tsx
// AutoSaveNumber.tsx
'use client';
import { useState } from 'react';
import { InputNumber } from 'antd';
import { useAutoSave } from './useAutoSave';

interface Props {
  fieldKey: string;
  defaultValue?: number | null;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
}

export default function AutoSaveNumber({ fieldKey, defaultValue, step = 1, min, max, placeholder }: Props) {
  const [value, setValue] = useState<number | null>(defaultValue ?? null);
  const { commit } = useAutoSave(fieldKey);
  return (
    <InputNumber
      value={value}
      onChange={(v) => { setValue(v as number | null); commit(v); }}
      step={step}
      min={min}
      max={max}
      placeholder={placeholder}
      style={{ width: '100%' }}
    />
  );
}
```

```tsx
// __tests__/AutoSaveNumber.test.tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent, act } from '@testing-library/react';
import AutoSaveNumber from '../AutoSaveNumber';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

jest.mock('@/services/student-api', () => ({
  studentApi: { patchMyProfile: jest.fn() },
}));
const mockedPatch = studentApi.patchMyProfile as jest.Mock;

describe('AutoSaveNumber', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedPatch.mockReset();
    mockedPatch.mockResolvedValue({ data: {} });
    act(() => useStudentSaveStore.getState().reset());
  });
  afterEach(() => jest.useRealTimers());

  it('renders defaultValue', () => {
    render(<AutoSaveNumber fieldKey="totalScore" defaultValue={650} />);
    expect(screen.getByRole('spinbutton')).toHaveValue('650');
  });

  it('debounces and PATCHes the numeric value', async () => {
    render(<AutoSaveNumber fieldKey="totalScore" defaultValue={null} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '650' } });
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(mockedPatch).toHaveBeenCalledWith({ totalScore: 650 });
  });
});
```

- [ ] **Step 2: Create AutoSaveSwitch + test**

```tsx
// AutoSaveSwitch.tsx
'use client';
import { useState } from 'react';
import { Switch } from 'antd';
import { useAutoSave } from './useAutoSave';

interface Props {
  fieldKey: string;
  defaultValue?: boolean | null;
  checkedChildren?: string;
  unCheckedChildren?: string;
}

export default function AutoSaveSwitch({ fieldKey, defaultValue, checkedChildren = '是', unCheckedChildren = '否' }: Props) {
  const [value, setValue] = useState<boolean>(defaultValue === true);
  const { commit } = useAutoSave(fieldKey);
  return (
    <Switch
      checked={value}
      onChange={(v) => { setValue(v); commit(v); }}
      checkedChildren={checkedChildren}
      unCheckedChildren={unCheckedChildren}
    />
  );
}
```

```tsx
// __tests__/AutoSaveSwitch.test.tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent, act } from '@testing-library/react';
import AutoSaveSwitch from '../AutoSaveSwitch';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

jest.mock('@/services/student-api', () => ({
  studentApi: { patchMyProfile: jest.fn() },
}));
const mockedPatch = studentApi.patchMyProfile as jest.Mock;

describe('AutoSaveSwitch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedPatch.mockReset();
    mockedPatch.mockResolvedValue({ data: {} });
    act(() => useStudentSaveStore.getState().reset());
  });
  afterEach(() => jest.useRealTimers());

  it('toggles and commits boolean true', async () => {
    render(<AutoSaveSwitch fieldKey="isRural" defaultValue={false} />);
    fireEvent.click(screen.getByRole('switch'));
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(mockedPatch).toHaveBeenCalledWith({ isRural: true });
  });

  it('treats null defaultValue as false', () => {
    render(<AutoSaveSwitch fieldKey="isRural" defaultValue={null} />);
    expect(screen.getByRole('switch')).not.toBeChecked();
  });
});
```

- [ ] **Step 3: Create AutoSaveTextArea + test**

```tsx
// AutoSaveTextArea.tsx
'use client';
import { useState } from 'react';
import { Input } from 'antd';
import { useAutoSave } from './useAutoSave';

interface Props {
  fieldKey: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
}

export default function AutoSaveTextArea({ fieldKey, defaultValue = '', placeholder, rows = 3 }: Props) {
  const [value, setValue] = useState(defaultValue);
  const { commit } = useAutoSave(fieldKey);
  return (
    <Input.TextArea
      value={value}
      placeholder={placeholder}
      autoSize={{ minRows: rows, maxRows: 8 }}
      onChange={(e) => { setValue(e.target.value); commit(e.target.value); }}
    />
  );
}
```

```tsx
// __tests__/AutoSaveTextArea.test.tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent, act } from '@testing-library/react';
import AutoSaveTextArea from '../AutoSaveTextArea';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

jest.mock('@/services/student-api', () => ({
  studentApi: { patchMyProfile: jest.fn() },
}));
const mockedPatch = studentApi.patchMyProfile as jest.Mock;

describe('AutoSaveTextArea', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedPatch.mockReset();
    mockedPatch.mockResolvedValue({ data: {} });
    act(() => useStudentSaveStore.getState().reset());
  });
  afterEach(() => jest.useRealTimers());

  it('commits text after debounce', async () => {
    render(<AutoSaveTextArea fieldKey="careerPlan" defaultValue="" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '考研' } });
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(mockedPatch).toHaveBeenCalledWith({ careerPlan: '考研' });
  });
});
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd apps/web && pnpm jest auto-save -v 2>&1 | tail -10
cd apps/web && pnpm tsc --noEmit 2>&1 | tail -5
```

Expected: AutoSaveField + Number + Switch + TextArea tests all green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/student/auto-save/
git commit -m "feat(web): AutoSaveNumber + AutoSaveSwitch + AutoSaveTextArea"
```

---

### Task 3: AutoSaveRadio + AutoSaveCheckbox + AutoSaveSelect

**Files:**
- Create: `apps/web/src/components/student/auto-save/AutoSaveRadio.tsx`
- Create: `apps/web/src/components/student/auto-save/AutoSaveCheckbox.tsx`
- Create: `apps/web/src/components/student/auto-save/AutoSaveSelect.tsx`
- Create: corresponding 3 test files

- [ ] **Step 1: AutoSaveRadio + test**

```tsx
// AutoSaveRadio.tsx
'use client';
import { useState } from 'react';
import { Radio } from 'antd';
import { useAutoSave } from './useAutoSave';

interface Option { label: string; value: string; }
interface Props {
  fieldKey: string;
  options: Option[];
  defaultValue?: string | null;
}

export default function AutoSaveRadio({ fieldKey, options, defaultValue }: Props) {
  const [value, setValue] = useState<string | null>(defaultValue ?? null);
  const { commit } = useAutoSave(fieldKey);
  return (
    <Radio.Group
      value={value}
      onChange={(e) => { setValue(e.target.value); commit(e.target.value); }}
      options={options}
      optionType="button"
      buttonStyle="solid"
    />
  );
}
```

```tsx
// __tests__/AutoSaveRadio.test.tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent, act } from '@testing-library/react';
import AutoSaveRadio from '../AutoSaveRadio';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

jest.mock('@/services/student-api', () => ({
  studentApi: { patchMyProfile: jest.fn() },
}));
const mockedPatch = studentApi.patchMyProfile as jest.Mock;

describe('AutoSaveRadio', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedPatch.mockReset();
    mockedPatch.mockResolvedValue({ data: {} });
    act(() => useStudentSaveStore.getState().reset());
  });
  afterEach(() => jest.useRealTimers());

  it('commits selected option value', async () => {
    render(
      <AutoSaveRadio
        fieldKey="examType"
        options={[
          { label: '物理类', value: 'PHYSICS' },
          { label: '历史类', value: 'HISTORY' },
        ]}
        defaultValue={null}
      />,
    );
    fireEvent.click(screen.getByText('物理类'));
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(mockedPatch).toHaveBeenCalledWith({ examType: 'PHYSICS' });
  });
});
```

- [ ] **Step 2: AutoSaveCheckbox + test**

```tsx
// AutoSaveCheckbox.tsx
'use client';
import { useState } from 'react';
import { Checkbox } from 'antd';
import type { CheckboxValueType } from 'antd/es/checkbox/Group';
import { useAutoSave } from './useAutoSave';

interface Option { label: string; value: string; }
interface Props {
  fieldKey: string;
  options: Option[];
  defaultValue?: string[] | null;
  maxCount?: number;
}

export default function AutoSaveCheckbox({ fieldKey, options, defaultValue, maxCount }: Props) {
  const [value, setValue] = useState<string[]>(defaultValue ?? []);
  const { commit } = useAutoSave(fieldKey);
  return (
    <Checkbox.Group
      value={value}
      onChange={(vals) => {
        const next = vals as string[];
        if (maxCount && next.length > maxCount) return;
        setValue(next);
        commit(next);
      }}
      options={options}
    />
  );
}
```

```tsx
// __tests__/AutoSaveCheckbox.test.tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent, act } from '@testing-library/react';
import AutoSaveCheckbox from '../AutoSaveCheckbox';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

jest.mock('@/services/student-api', () => ({
  studentApi: { patchMyProfile: jest.fn() },
}));
const mockedPatch = studentApi.patchMyProfile as jest.Mock;

describe('AutoSaveCheckbox', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedPatch.mockReset();
    mockedPatch.mockResolvedValue({ data: {} });
    act(() => useStudentSaveStore.getState().reset());
  });
  afterEach(() => jest.useRealTimers());

  it('commits array of selected values', async () => {
    render(
      <AutoSaveCheckbox
        fieldKey="reChoices"
        options={[
          { label: '化学', value: 'CHEM' },
          { label: '生物', value: 'BIO' },
          { label: '政治', value: 'POL' },
          { label: '地理', value: 'GEO' },
        ]}
        defaultValue={[]}
      />,
    );
    fireEvent.click(screen.getByLabelText('化学'));
    fireEvent.click(screen.getByLabelText('生物'));
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(mockedPatch).toHaveBeenLastCalledWith({ reChoices: ['CHEM', 'BIO'] });
  });
});
```

- [ ] **Step 3: AutoSaveSelect + test**

```tsx
// AutoSaveSelect.tsx
'use client';
import { useState } from 'react';
import { Select } from 'antd';
import { useAutoSave } from './useAutoSave';

interface Props {
  fieldKey: string;
  defaultValue?: string[] | string | null;
  mode?: 'multiple' | 'tags';
  options?: { label: string; value: string }[];
  placeholder?: string;
}

export default function AutoSaveSelect({ fieldKey, defaultValue, mode = 'tags', options, placeholder }: Props) {
  const [value, setValue] = useState<string[] | string | undefined>(
    defaultValue == null ? undefined : (defaultValue as any),
  );
  const { commit } = useAutoSave(fieldKey);
  return (
    <Select
      mode={mode}
      value={value as any}
      onChange={(v) => { setValue(v); commit(v); }}
      options={options}
      placeholder={placeholder}
      style={{ width: '100%' }}
      tokenSeparators={[',', '，']}
    />
  );
}
```

```tsx
// __tests__/AutoSaveSelect.test.tsx
/** @jest-environment jsdom */
import { render, act } from '@testing-library/react';
import AutoSaveSelect from '../AutoSaveSelect';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

jest.mock('@/services/student-api', () => ({
  studentApi: { patchMyProfile: jest.fn() },
}));

describe('AutoSaveSelect', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (studentApi.patchMyProfile as jest.Mock).mockReset();
    (studentApi.patchMyProfile as jest.Mock).mockResolvedValue({ data: {} });
    act(() => useStudentSaveStore.getState().reset());
  });
  afterEach(() => jest.useRealTimers());

  it('renders without crashing with array defaultValue', () => {
    const { container } = render(
      <AutoSaveSelect fieldKey="preferredCities" defaultValue={['成都', '北京']} mode="tags" />,
    );
    expect(container).toBeInTheDocument();
  });

  // Note: antd Select's interaction is hard to simulate in jsdom; smoke test is sufficient.
});
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd apps/web && pnpm jest auto-save -v 2>&1 | tail -10
cd apps/web && pnpm tsc --noEmit 2>&1 | tail -5
```

Expected: all auto-save tests green; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/student/auto-save/
git commit -m "feat(web): AutoSaveRadio + AutoSaveCheckbox + AutoSaveSelect"
```

---

### Task 4: SKIPPED (no Cascader needed)

After audit: existing `CountyCascader` is just a text Input, and there is no province/city/county dataset bundled. Adding one would require ~3000 lines of region data. Decision: **HukouSection uses 3 separate AutoSaveField inputs** for 省/市/县, matching the existing pattern. AutoSaveCascader component is NOT created.

The HukouSection in Task 7 below has been updated accordingly (3 text fields per address group).

### Task 4 (REPLACED): AutoSaveCascader (reuse CountyCascader) — SKIPPED

**Files:**
- Create: `apps/web/src/components/student/auto-save/AutoSaveCascader.tsx`
- Create: `apps/web/src/components/student/auto-save/__tests__/AutoSaveCascader.test.tsx`

- [ ] **Step 1: Read existing CountyCascader to understand its API**

```bash
head -50 apps/web/src/components/student/CountyCascader.tsx
```

If CountyCascader is already controlled (value+onChange) and emits an array `[province, city, county]`, we can wrap it. If it's tightly coupled to a Form.Item, we need to expose a simpler API.

- [ ] **Step 2: Create AutoSaveCascader**

```tsx
// AutoSaveCascader.tsx
'use client';
import { useState } from 'react';
import { Cascader } from 'antd';
import { useAutoSave } from './useAutoSave';
// import options data from existing source — investigate during implementation
// Likely: import { CHINA_REGION_OPTIONS } from '../CountyCascader' or a separate data file

interface Props {
  /** Three field keys that map to the three levels [省, 市, 县] */
  fieldKeys: [string, string, string];
  defaultValue?: [string?, string?, string?];
  options: any[];  // Cascader's options shape
  placeholder?: string;
}

/**
 * Cascader that PATCHes 3 fields at once when the user picks (省, 市, 县).
 * For provenance-grouped fields, all 3 fields belong to the same group
 * (hukou: province/city/county OR examLocation: examLocationProvince/City/County)
 * so 3 PATCHes still result in 1 provenance update on the backend (last-write-wins
 * but timestamps converge within milliseconds).
 *
 * To minimize PATCH count, we build a single PATCH payload of 3 fields per change.
 */
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

export default function AutoSaveCascader({ fieldKeys, defaultValue = [], options, placeholder }: Props) {
  const [value, setValue] = useState<(string | undefined)[]>(defaultValue ?? []);
  const setSaving = useStudentSaveStore((s) => s.setSaving);
  const setSaved = useStudentSaveStore((s) => s.setSaved);
  const setError = useStudentSaveStore((s) => s.setError);

  const handleChange = async (vals: (string | number)[] | undefined) => {
    const v = (vals ?? []).map((x) => String(x));
    setValue(v);
    setSaving();
    try {
      await studentApi.patchMyProfile({
        [fieldKeys[0]]: v[0] ?? null,
        [fieldKeys[1]]: v[1] ?? null,
        [fieldKeys[2]]: v[2] ?? null,
      } as any);
      setSaved();
    } catch (e) {
      setError((e as Error).message ?? '保存失败');
    }
  };

  return (
    <Cascader
      value={value as any}
      onChange={handleChange}
      options={options}
      placeholder={placeholder}
      changeOnSelect
      style={{ width: '100%' }}
    />
  );
}
```

Note: This component does NOT use `useAutoSave` hook because it commits 3 fields atomically without debounce (Cascader user clicks, doesn't type — debounce不必要). PATCH happens synchronously per click.

- [ ] **Step 3: Smoke test**

```tsx
// __tests__/AutoSaveCascader.test.tsx
/** @jest-environment jsdom */
import { render } from '@testing-library/react';
import AutoSaveCascader from '../AutoSaveCascader';

describe('AutoSaveCascader', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <AutoSaveCascader
        fieldKeys={['province', 'city', 'county']}
        defaultValue={['四川', '成都', '武侯']}
        options={[{ value: '四川', label: '四川', children: [] }]}
      />,
    );
    expect(container).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
cd apps/web && pnpm jest AutoSaveCascader -v
git add apps/web/src/components/student/auto-save/
git commit -m "feat(web): AutoSaveCascader for hukou/examLocation address pickers"
```

---

### Task 5: SaveStatusBar → toast

**Files:**
- Modify: `apps/web/src/components/student/SaveStatusBar.tsx`
- Modify: `apps/web/src/components/student/__tests__/SaveStatusBar.test.tsx`

- [ ] **Step 1: Rewrite SaveStatusBar to use antd `message`**

```tsx
'use client';

import { useEffect } from 'react';
import { message } from 'antd';
import { useStudentSaveStore } from '@/stores/student-save-state';

const TOAST_KEY = 'student-profile-save';

export default function SaveStatusBar() {
  const state = useStudentSaveStore((s) => s.state);
  const errorMessage = useStudentSaveStore((s) => s.errorMessage);

  useEffect(() => {
    if (state === 'saving') {
      message.loading({ content: '保存中…', key: TOAST_KEY, duration: 0 });
    } else if (state === 'saved') {
      message.success({ content: '已保存', key: TOAST_KEY, duration: 1.5 });
    } else if (state === 'error') {
      message.error({ content: errorMessage ?? '保存失败', key: TOAST_KEY, duration: 0 });
    } else {
      message.destroy(TOAST_KEY);
    }
  }, [state, errorMessage]);

  return null;
}
```

- [ ] **Step 2: Update test to mock message API**

Replace the existing SaveStatusBar.test.tsx with:

```tsx
/** @jest-environment jsdom */
import { render, act } from '@testing-library/react';
import SaveStatusBar from '../SaveStatusBar';
import { useStudentSaveStore } from '@/stores/student-save-state';
import { message } from 'antd';

jest.mock('antd', () => ({
  message: {
    loading: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    destroy: jest.fn(),
  },
}));

describe('SaveStatusBar (toast)', () => {
  beforeEach(() => {
    (message.loading as jest.Mock).mockReset();
    (message.success as jest.Mock).mockReset();
    (message.error as jest.Mock).mockReset();
    (message.destroy as jest.Mock).mockReset();
    act(() => useStudentSaveStore.getState().reset());
  });

  it('calls message.loading on saving', () => {
    render(<SaveStatusBar />);
    act(() => useStudentSaveStore.getState().setSaving());
    expect(message.loading).toHaveBeenCalledWith(
      expect.objectContaining({ content: '保存中…', duration: 0 }),
    );
  });

  it('calls message.success on saved', () => {
    render(<SaveStatusBar />);
    act(() => useStudentSaveStore.getState().setSaved());
    expect(message.success).toHaveBeenCalledWith(
      expect.objectContaining({ content: '已保存', duration: 1.5 }),
    );
  });

  it('calls message.error on error', () => {
    render(<SaveStatusBar />);
    act(() => useStudentSaveStore.getState().setError('网络错误'));
    expect(message.error).toHaveBeenCalledWith(
      expect.objectContaining({ content: '网络错误' }),
    );
  });
});
```

- [ ] **Step 3: Verify antd `App` provider exists in layout (needed for context-aware message)**

```bash
grep -n "App\|message" apps/web/src/app/layout.tsx apps/web/src/app/\(student\)/student/layout.tsx 2>/dev/null
```

If neither layout wraps children in `<App>`, the static `message.xxx()` API still works (it uses a fallback root). No change needed for v1 simplicity.

- [ ] **Step 4: Run + commit**

```bash
cd apps/web && pnpm jest SaveStatusBar -v
git add apps/web/src/components/student/SaveStatusBar.tsx apps/web/src/components/student/__tests__/SaveStatusBar.test.tsx
git commit -m "feat(web): SaveStatusBar uses antd message toast (right-bottom corner)"
```

---

### Task 6: CompactProgress

**Files:**
- Create: `apps/web/src/components/student/CompactProgress.tsx`
- Create: `apps/web/src/components/student/__tests__/CompactProgress.test.tsx`

- [ ] **Step 1: Create component**

```tsx
'use client';
import { Progress } from 'antd';

interface Props {
  percent: number;
  filled: number;
  total: number;
  missing?: string[];
}

export default function CompactProgress({ percent, filled, total, missing = [] }: Props) {
  const visibleMissing = missing.slice(0, 3).join('、');
  const moreCount = missing.length > 3 ? missing.length : 0;
  return (
    <div className="flex items-center gap-3 text-xs text-text-secondary">
      <Progress percent={percent} size="small" className="flex-1 max-w-md" />
      <span className="text-text-faint whitespace-nowrap">{filled}/{total}</span>
      {missing.length > 0 && (
        <span className="text-text-faint truncate">
          · 缺：{visibleMissing}{moreCount ? ` 等${moreCount}项` : ''}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Test**

```tsx
/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import CompactProgress from '../CompactProgress';

describe('CompactProgress', () => {
  it('shows percent and counts', () => {
    render(<CompactProgress percent={60} filled={38} total={64} missing={[]} />);
    expect(screen.getByText('38/64')).toBeInTheDocument();
  });

  it('shows top-3 missing fields with "等N项" suffix', () => {
    render(<CompactProgress percent={50} filled={30} total={64} missing={['a','b','c','d','e']} />);
    expect(screen.getByText(/a、b、c.*等5项/)).toBeInTheDocument();
  });

  it('hides missing block when missing is empty', () => {
    render(<CompactProgress percent={100} filled={64} total={64} missing={[]} />);
    expect(screen.queryByText(/缺：/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd apps/web && pnpm jest CompactProgress -v
git add apps/web/src/components/student/CompactProgress.tsx apps/web/src/components/student/__tests__/CompactProgress.test.tsx
git commit -m "feat(web): CompactProgress single-line indicator with missing-fields hint"
```

---

### Task 7: Rewrite 7 sections with new controls + Row/Col layout

**Files:**
- Rewrite: `apps/web/src/components/student/sections/BasicInfoSection.tsx`
- Rewrite: `apps/web/src/components/student/sections/ScoreSection.tsx`
- Rewrite: `apps/web/src/components/student/sections/HukouSection.tsx`
- Rewrite: `apps/web/src/components/student/sections/BonusPolicySection.tsx`
- Rewrite: `apps/web/src/components/student/sections/HealthSection.tsx`
- Rewrite: `apps/web/src/components/student/sections/PreferenceSection.tsx`
- Rewrite: `apps/web/src/components/student/sections/PlanningSection.tsx`

For ALL sections, use this pattern (no Card wrapper — that's added by Collapse in page.tsx):

```tsx
<Form layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} size="small">
  <Row gutter={[16, 0]}>
    <Col xs={24} sm={12} md={8} lg={6}>
      <Form.Item label="字段名">
        <AutoSaveXxx fieldKey="..." defaultValue={...} />
      </Form.Item>
    </Col>
    {/* more cols */}
  </Row>
</Form>
```

**Col span heuristic:**
- 超短控件（性别 Radio、单个 InputNumber score）：`xs={12} sm={8} md={6} lg={4}`
- 普通 Input/Number/Switch：`xs={24} sm={12} md={8} lg={6}`
- Cascader、Select tags：`xs={24} sm={24} md={12} lg={8}`
- TextArea、长文本：`xs={24} sm={24} md={24}`（占满）

**Per-section field→control mapping:**

#### BasicInfoSection (8 fields)

```tsx
'use client';
import { Form, Row, Col } from 'antd';
import AutoSaveField from '../auto-save/AutoSaveField';
import AutoSaveRadio from '../auto-save/AutoSaveRadio';
interface Props { profile: Record<string, any>; }

const GENDER = [{label:'男',value:'M'},{label:'女',value:'F'}];
const EXAM_TYPE = [{label:'物理类',value:'PHYSICS'},{label:'历史类',value:'HISTORY'}];
const FORM_FILLER = [{label:'本人',value:'STUDENT'},{label:'家长',value:'PARENT'},{label:'共同',value:'TOGETHER'}];

export default function BasicInfoSection({ profile }: Props) {
  return (
    <Form layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} size="small">
      <Row gutter={[16, 0]}>
        <Col xs={24} sm={12} md={8}><Form.Item label="姓名"><AutoSaveField fieldKey="realName" defaultValue={profile.realName ?? ''} /></Form.Item></Col>
        <Col xs={24} sm={12} md={8}><Form.Item label="手机"><AutoSaveField fieldKey="phone" defaultValue={profile.phone ?? ''} /></Form.Item></Col>
        <Col xs={24} sm={12} md={8}><Form.Item label="家长手机"><AutoSaveField fieldKey="parentPhone" defaultValue={profile.parentPhone ?? ''} /></Form.Item></Col>
        <Col xs={24} sm={12} md={8}><Form.Item label="性别"><AutoSaveRadio fieldKey="gender" options={GENDER} defaultValue={profile.gender ?? null} /></Form.Item></Col>
        <Col xs={24} sm={12} md={8}><Form.Item label="科类"><AutoSaveRadio fieldKey="examType" options={EXAM_TYPE} defaultValue={profile.examType ?? null} /></Form.Item></Col>
        <Col xs={24} sm={12} md={8}><Form.Item label="填表人"><AutoSaveRadio fieldKey="formFiller" options={FORM_FILLER} defaultValue={profile.formFiller ?? null} /></Form.Item></Col>
        <Col xs={24} sm={12} md={8}><Form.Item label="民族"><AutoSaveField fieldKey="ethnicity" defaultValue={profile.ethnicity ?? ''} /></Form.Item></Col>
        <Col xs={24} sm={12} md={8}><Form.Item label="政治面貌"><AutoSaveField fieldKey="politicalStatus" defaultValue={profile.politicalStatus ?? ''} /></Form.Item></Col>
      </Row>
    </Form>
  );
}
```

#### ScoreSection (10 fields, last is readonly Tag)

```tsx
'use client';
import { Form, Row, Col, Tag } from 'antd';
import AutoSaveNumber from '../auto-save/AutoSaveNumber';
import AutoSaveRadio from '../auto-save/AutoSaveRadio';
import AutoSaveCheckbox from '../auto-save/AutoSaveCheckbox';
interface Props { profile: Record<string, any>; }

const FIRST_CHOICE = [{label:'物理',value:'PHYSICS'},{label:'历史',value:'HISTORY'}];
const RE_CHOICES = [
  {label:'化学',value:'CHEM'},{label:'生物',value:'BIO'},
  {label:'政治',value:'POL'},{label:'地理',value:'GEO'},
];

export default function ScoreSection({ profile }: Props) {
  return (
    <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
      <Row gutter={[16, 0]}>
        <Col xs={12} md={6}><Form.Item label="总分"><AutoSaveNumber fieldKey="totalScore" defaultValue={profile.totalScore ?? null} min={0} max={750} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="语文"><AutoSaveNumber fieldKey="scoreChinese" defaultValue={profile.scoreChinese ?? null} min={0} max={150} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="数学"><AutoSaveNumber fieldKey="scoreMath" defaultValue={profile.scoreMath ?? null} min={0} max={150} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="英语"><AutoSaveNumber fieldKey="scoreEnglish" defaultValue={profile.scoreEnglish ?? null} min={0} max={150} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="首选分"><AutoSaveNumber fieldKey="scoreFirstChoice" defaultValue={profile.scoreFirstChoice ?? null} min={0} max={100} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="再选1"><AutoSaveNumber fieldKey="scoreSub1" defaultValue={profile.scoreSub1 ?? null} min={0} max={100} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="再选2"><AutoSaveNumber fieldKey="scoreSub2" defaultValue={profile.scoreSub2 ?? null} min={0} max={100} /></Form.Item></Col>
        <Col xs={12} md={6}>
          <Form.Item label="位次">{profile.provincialRank ? <Tag color="blue">#{profile.provincialRank}</Tag> : <span className="text-text-faint text-xs">填总分后自动算</span>}</Form.Item>
        </Col>
        <Col xs={24} md={12}><Form.Item label="首选科目" labelCol={{span:6}} wrapperCol={{span:18}}><AutoSaveRadio fieldKey="firstChoice" options={FIRST_CHOICE} defaultValue={profile.firstChoice ?? null} /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="再选(2)" labelCol={{span:6}} wrapperCol={{span:18}}><AutoSaveCheckbox fieldKey="reChoices" options={RE_CHOICES} defaultValue={profile.reChoices ?? []} maxCount={2} /></Form.Item></Col>
      </Row>
    </Form>
  );
}
```

#### HukouSection (3 text fields per address group + Switch)

```tsx
'use client';
import { Form, Row, Col } from 'antd';
import AutoSaveField from '../auto-save/AutoSaveField';
import AutoSaveSwitch from '../auto-save/AutoSaveSwitch';
interface Props { profile: Record<string, any>; }

export default function HukouSection({ profile }: Props) {
  return (
    <Form layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} size="small">
      <Row gutter={[16, 0]}>
        <Col xs={24} md={8}><Form.Item label="户籍省"><AutoSaveField fieldKey="province" defaultValue={profile.province ?? ''} placeholder="如 四川" /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item label="户籍市"><AutoSaveField fieldKey="city" defaultValue={profile.city ?? ''} /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item label="户籍县"><AutoSaveField fieldKey="county" defaultValue={profile.county ?? ''} /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item label="高考报名省"><AutoSaveField fieldKey="examLocationProvince" defaultValue={profile.examLocationProvince ?? ''} /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item label="高考报名市"><AutoSaveField fieldKey="examLocationCity" defaultValue={profile.examLocationCity ?? ''} /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item label="高考报名县"><AutoSaveField fieldKey="examLocationCounty" defaultValue={profile.examLocationCounty ?? ''} /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item label="农村户籍"><AutoSaveSwitch fieldKey="isRural" defaultValue={profile.isRural} /></Form.Item></Col>
      </Row>
    </Form>
  );
}
```

#### BonusPolicySection

```tsx
'use client';
import { Form, Row, Col } from 'antd';
import AutoSaveField from '../auto-save/AutoSaveField';
import AutoSaveTextArea from '../auto-save/AutoSaveTextArea';
interface Props { profile: Record<string, any>; }

export default function BonusPolicySection({ profile }: Props) {
  return (
    <Form layout="horizontal" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }} size="small">
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}><Form.Item label="政策"><AutoSaveField fieldKey="bonusPolicyStatus" defaultValue={profile.bonusPolicyStatus ?? ''} placeholder="少数民族 / 烈士子女 / 退伍军人 / 无" /></Form.Item></Col>
        <Col xs={24}><Form.Item label="加分细则" labelCol={{span:2}} wrapperCol={{span:22}}><AutoSaveTextArea fieldKey="bonusItems" defaultValue={profile.bonusItems ?? ''} rows={2} placeholder="如 +5 / +10" /></Form.Item></Col>
      </Row>
    </Form>
  );
}
```

#### HealthSection (Switch + Number + TextArea)

```tsx
'use client';
import { Form, Row, Col } from 'antd';
import AutoSaveNumber from '../auto-save/AutoSaveNumber';
import AutoSaveSwitch from '../auto-save/AutoSaveSwitch';
import AutoSaveTextArea from '../auto-save/AutoSaveTextArea';
interface Props { profile: Record<string, any>; }

export default function HealthSection({ profile }: Props) {
  return (
    <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
      <Row gutter={[16, 0]}>
        <Col xs={12} md={6}><Form.Item label="身高(cm)"><AutoSaveNumber fieldKey="height" defaultValue={profile.height ? Number(profile.height) : null} step={0.1} min={100} max={250} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="体重(kg)"><AutoSaveNumber fieldKey="weight" defaultValue={profile.weight ? Number(profile.weight) : null} step={0.1} min={20} max={200} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="左眼裸视"><AutoSaveNumber fieldKey="visionLeft" defaultValue={profile.visionLeft ? Number(profile.visionLeft) : null} step={0.1} min={0} max={5} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="右眼裸视"><AutoSaveNumber fieldKey="visionRight" defaultValue={profile.visionRight ? Number(profile.visionRight) : null} step={0.1} min={0} max={5} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="左眼矫正"><AutoSaveNumber fieldKey="visionLeftCorrected" defaultValue={profile.visionLeftCorrected ? Number(profile.visionLeftCorrected) : null} step={0.1} min={0} max={5} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="右眼矫正"><AutoSaveNumber fieldKey="visionRightCorrected" defaultValue={profile.visionRightCorrected ? Number(profile.visionRightCorrected) : null} step={0.1} min={0} max={5} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="色盲"><AutoSaveSwitch fieldKey="colorBlind" defaultValue={profile.colorBlind} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="色弱"><AutoSaveSwitch fieldKey="colorWeak" defaultValue={profile.colorWeak} /></Form.Item></Col>
        <Col xs={24}><Form.Item label="身体限制" labelCol={{span:2}} wrapperCol={{span:22}}><AutoSaveTextArea fieldKey="physicalLimits" defaultValue={profile.physicalLimits ?? ''} rows={2} /></Form.Item></Col>
        <Col xs={24}><Form.Item label="病史" labelCol={{span:2}} wrapperCol={{span:22}}><AutoSaveTextArea fieldKey="medicalHistory" defaultValue={profile.medicalHistory ?? ''} rows={2} /></Form.Item></Col>
      </Row>
    </Form>
  );
}
```

#### PreferenceSection (Select tags × 10 + Radio for priorityMode)

```tsx
'use client';
import { Form, Row, Col, Divider } from 'antd';
import AutoSaveSelect from '../auto-save/AutoSaveSelect';
import AutoSaveRadio from '../auto-save/AutoSaveRadio';
interface Props { profile: Record<string, any>; }

const PRIORITY_MODE = [
  {label:'院校优先',value:'UNIVERSITY_FIRST'},
  {label:'专业优先',value:'MAJOR_FIRST'},
  {label:'城市优先',value:'CITY_FIRST'},
  {label:'均衡',value:'BALANCED'},
];

export default function PreferenceSection({ profile }: Props) {
  return (
    <Form layout="horizontal" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} size="small">
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}><Form.Item label="意向省份"><AutoSaveSelect fieldKey="preferredProvinces" defaultValue={profile.preferredProvinces ?? []} mode="tags" placeholder="输入回车添加" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向城市"><AutoSaveSelect fieldKey="preferredCities" defaultValue={profile.preferredCities ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向院校"><AutoSaveSelect fieldKey="preferredUniversities" defaultValue={profile.preferredUniversities ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向专业"><AutoSaveSelect fieldKey="preferredMajors" defaultValue={profile.preferredMajors ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向专业类别"><AutoSaveSelect fieldKey="preferredMajorCategories" defaultValue={profile.preferredMajorCategories ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向批次"><AutoSaveSelect fieldKey="preferredBatches" defaultValue={profile.preferredBatches ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24}><Form.Item label="优先模式" labelCol={{span:3}} wrapperCol={{span:21}}><AutoSaveRadio fieldKey="priorityMode" options={PRIORITY_MODE} defaultValue={profile.priorityMode ?? null} /></Form.Item></Col>
        <Col xs={24}><Form.Item label="意向标签" labelCol={{span:3}} wrapperCol={{span:21}}><AutoSaveSelect fieldKey="preferredTags" defaultValue={profile.preferredTags ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24}><Divider plain orientation="left" style={{margin:'8px 0',fontSize:12,color:'#999'}}>排除项</Divider></Col>
        <Col xs={24} md={12}><Form.Item label="排除省份"><AutoSaveSelect fieldKey="excludedProvinces" defaultValue={profile.excludedProvinces ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="排除城市"><AutoSaveSelect fieldKey="excludedCities" defaultValue={profile.excludedCities ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="排除院校"><AutoSaveSelect fieldKey="excludedUniversities" defaultValue={profile.excludedUniversities ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="排除专业"><AutoSaveSelect fieldKey="excludedMajors" defaultValue={profile.excludedMajors ?? []} mode="tags" /></Form.Item></Col>
      </Row>
    </Form>
  );
}
```

#### PlanningSection (TextArea + Radio + Switch)

```tsx
'use client';
import { Form, Row, Col } from 'antd';
import AutoSaveField from '../auto-save/AutoSaveField';
import AutoSaveTextArea from '../auto-save/AutoSaveTextArea';
import AutoSaveSwitch from '../auto-save/AutoSaveSwitch';
import AutoSaveRadio from '../auto-save/AutoSaveRadio';
import AutoSaveNumber from '../auto-save/AutoSaveNumber';
interface Props { profile: Record<string, any>; }

const STAY_PREF = [
  {label:'仅本省',value:'LOCAL_ONLY'},
  {label:'倾向本省',value:'PREFER_LOCAL'},
  {label:'无所谓',value:'NO_PREFERENCE'},
  {label:'倾向外省',value:'PREFER_OUTSIDE'},
];

const TUITION = [
  {label:'低 (<6k/年)',value:'LOW'},
  {label:'中 (6k-1w)',value:'MEDIUM'},
  {label:'高 (1w-3w)',value:'HIGH'},
  {label:'不限',value:'UNLIMITED'},
];

export default function PlanningSection({ profile }: Props) {
  return (
    <Form layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} size="small">
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}><Form.Item label="升学规划"><AutoSaveField fieldKey="careerPlan" defaultValue={profile.careerPlan ?? ''} placeholder="本科/考研/留学..." /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="职业方向"><AutoSaveField fieldKey="careerDirection" defaultValue={profile.careerDirection ?? ''} placeholder="软件/医疗/金融..." /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="军校意愿"><AutoSaveSwitch fieldKey="militaryInterest" defaultValue={profile.militaryInterest} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="师范意愿"><AutoSaveSwitch fieldKey="teacherInterest" defaultValue={profile.teacherInterest} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="接受偏远"><AutoSaveSwitch fieldKey="remoteAreaAcceptance" defaultValue={profile.remoteAreaAcceptance} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="接受冷门"><AutoSaveSwitch fieldKey="coldMajorAcceptance" defaultValue={profile.coldMajorAcceptance} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="中外合办"><AutoSaveSwitch fieldKey="acceptSinoForeign" defaultValue={profile.acceptSinoForeign} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="民办"><AutoSaveSwitch fieldKey="acceptPrivate" defaultValue={profile.acceptPrivate} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="合作办学"><AutoSaveSwitch fieldKey="acceptCooperation" defaultValue={profile.acceptCooperation} /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="性格类型"><AutoSaveField fieldKey="personalityType" defaultValue={profile.personalityType ?? ''} placeholder="如 INTJ / 内向" /></Form.Item></Col>
        <Col xs={24}><Form.Item label="留省偏好" labelCol={{span:4}} wrapperCol={{span:20}}><AutoSaveRadio fieldKey="stayPreference" options={STAY_PREF} defaultValue={profile.stayPreference ?? null} /></Form.Item></Col>
        <Col xs={24}><Form.Item label="学费预算" labelCol={{span:4}} wrapperCol={{span:20}}><AutoSaveRadio fieldKey="tuitionBudget" options={TUITION} defaultValue={profile.tuitionBudget ?? null} /></Form.Item></Col>
        <Col xs={24}><Form.Item label="兴趣爱好" labelCol={{span:4}} wrapperCol={{span:20}}><AutoSaveTextArea fieldKey="interests" defaultValue={profile.interests ?? ''} rows={2} /></Form.Item></Col>
        <Col xs={24}><Form.Item label="自我描述" labelCol={{span:4}} wrapperCol={{span:20}}><AutoSaveTextArea fieldKey="selfDescription" defaultValue={profile.selfDescription ?? ''} rows={3} /></Form.Item></Col>
        <Col xs={24}><Form.Item label="其他要求" labelCol={{span:4}} wrapperCol={{span:20}}><AutoSaveTextArea fieldKey="otherRequirements" defaultValue={profile.otherRequirements ?? ''} rows={2} /></Form.Item></Col>
      </Row>
    </Form>
  );
}
```

- [ ] **Step 1: Rewrite all 7 section files (one commit per section, or all in one)**

For atomic commit hygiene, do them in 1 commit:

```bash
git add apps/web/src/components/student/sections/
git commit -m "feat(web): rewrite 7 sections with typed AutoSave* controls + Row/Col layout"
```

- [ ] **Step 2: tsc + jest**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | tail -10
cd apps/web && pnpm jest 2>&1 | tail -10
```

Expected: tsc clean; tests pass (no section-specific tests, but they import the AutoSave* components which already have tests).

---

### Task 8: Rewrite profile/page.tsx with Collapse + CompactProgress

**Files:**
- Modify: `apps/web/src/app/(student)/student/profile/page.tsx`

- [ ] **Step 1: Replace page**

```tsx
'use client';

import { Spin, Alert, Collapse, Button } from 'antd';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import CompactProgress from '@/components/student/CompactProgress';
import SaveStatusBar from '@/components/student/SaveStatusBar';
import ProvenanceBadge from '@/components/student/ProvenanceBadge';
import BasicInfoSection from '@/components/student/sections/BasicInfoSection';
import ScoreSection from '@/components/student/sections/ScoreSection';
import HukouSection from '@/components/student/sections/HukouSection';
import BonusPolicySection from '@/components/student/sections/BonusPolicySection';
import HealthSection from '@/components/student/sections/HealthSection';
import PreferenceSection from '@/components/student/sections/PreferenceSection';
import PlanningSection from '@/components/student/sections/PlanningSection';

export default function StudentProfilePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['student-my-profile'],
    queryFn: () => studentApi.getMyProfile(),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spin size="large" /></div>;
  if (error || !data) return <Alert type="error" message="加载档案失败，请刷新重试" />;

  const profile: Record<string, any> = (data as any).data ?? data;
  const progress = profile.progress;
  if (!progress) return <Alert type="error" message="档案进度信息缺失" />;

  const filled = Math.round((progress.overallCompleteness / 100) * 64);
  const items = [
    { key: '1', label: '1. 基础信息', children: <BasicInfoSection profile={profile} /> },
    { key: '2', label: '2. 分数与选科', children: <ScoreSection profile={profile} /> },
    {
      key: '3',
      label: '3. 户籍与考试地',
      extra: <ProvenanceBadge updatedBy={profile.hukouUpdatedBy} updatedAt={profile.hukouUpdatedAt} />,
      children: <HukouSection profile={profile} />,
    },
    {
      key: '4',
      label: '4. 加分政策',
      extra: <ProvenanceBadge updatedBy={profile.bonusUpdatedBy} updatedAt={profile.bonusUpdatedAt} />,
      children: <BonusPolicySection profile={profile} />,
    },
    { key: '5', label: '5. 健康条件', children: <HealthSection profile={profile} /> },
    { key: '6', label: '6. 志愿偏好与排除', children: <PreferenceSection profile={profile} /> },
    { key: '7', label: '7. 升学规划与个性', children: <PlanningSection profile={profile} /> },
  ];

  return (
    <div className="space-y-3 pb-20">
      <SaveStatusBar />

      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-xl font-semibold text-text">我的档案</h1>
        <Link href="/student/recommend">
          <Button type="primary" size="small">查看老师方案 →</Button>
        </Link>
      </div>

      <CompactProgress
        percent={progress.overallCompleteness}
        filled={filled}
        total={64}
        missing={progress.missingFieldsForRecommend ?? []}
      />

      <Collapse
        defaultActiveKey={['1', '2', '3']}
        items={items}
        size="small"
        expandIconPosition="end"
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build works**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | tail -10
cd apps/web && pnpm build 2>&1 | tail -15
```

Expected: 0 errors, build succeeds.

- [ ] **Step 3: Run all web tests**

```bash
cd apps/web && pnpm test
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/(student)/student/profile/page.tsx
git commit -m "feat(web): profile page uses Collapse + CompactProgress (compact layout v2)"
```

---

### Task 9: Deploy + verify

- [ ] **Step 1: Merge worktree → master + push**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
git merge --ff-only feat/profile-layout-v2
git push origin master
```

- [ ] **Step 2: Run deploy_auto.py**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper && python deploy_auto.py 2>&1 | tail -15
```

Expected: build → scp → pm2 restart all succeed.

- [ ] **Step 3: Health check**

```bash
ssh -i cube.pem -o StrictHostKeyChecking=no ubuntu@132.232.245.53 "sleep 5; pm2 list 2>&1 | grep vh-; curl -sS --max-time 5 -o /dev/null -w 'server :3003 = %{http_code}\n' http://127.0.0.1:3003/api/v1/timeline; curl -sS --max-time 5 -o /dev/null -w 'web :3004 = %{http_code}\n' http://127.0.0.1:3004/"
```

Expected: 3 services online, both endpoints return 200.

- [ ] **Step 4: Mark spec implemented**

In `docs/superpowers/specs/2026-05-06-student-profile-layout-v2-design.md` line 4:
```markdown
**状态**：implemented 2026-05-06
```

```bash
git add docs/superpowers/specs/2026-05-06-student-profile-layout-v2-design.md
git commit -m "docs(student): mark profile layout v2 spec as implemented"
git push origin master
```

---

## Self-review

**Spec coverage:**
- Spec §1 (字段→控件映射) → Tasks 2/3/4 (8 controls) + Task 7 (sections use them)
- Spec §2 (useAutoSave hook) → Task 1
- Spec §3 (8 controls) → Tasks 2/3/4
- Spec §4 (Section 改造) → Task 7
- Spec §5 (CompactProgress) → Task 6
- Spec §6 (Toast SaveStatusBar) → Task 5
- Spec §7 (ProvenanceBadge in Card extra) → Task 8 (now lives in Collapse Panel `extra`)
- Spec §8 (Collapse) → Task 8

**Placeholder scan:** None.

**Type consistency:** `commit(value: unknown)` from useAutoSave is uniformly used by all 8 controls. Each control passes the typed value (boolean/number/string/array). PATCH payload `{[fieldKey]: value}` is type-loose at the boundary, accepted by `studentApi.patchMyProfile(any)`.

**Known risks acknowledged:**
- CountyCascader options export: Task 7 hukou step will fail-fast if not exportable; implementer must report.
- antd `message` API may need `<App>` provider in newer antd versions; if so, Task 5 also adds it to the student layout.
