# Preference Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把学生档案 PreferenceSection 的 10 个自由输入字段（mode="tags"）替换为"输入关键字搜索 + 勾选"的标准 picker，禁止用户输入选项之外的值。

**Architecture:** 新增统一的 `AutoSavePicker` 组件（基于 ant Design `Select mode="multiple"` + `showSearch`）；选项数据按字段拆 6 个 hook（3 个静态常量 + 3 个 API 全量缓存）；批次字段配套修改 DTO 从 `Batch[]` enum 改为 `String[]`。

**Tech Stack:** Next.js 14 / React / antd 5 / @tanstack/react-query / NestJS / Prisma / TypeScript / Jest

**Spec:** `docs/superpowers/specs/2026-05-07-preference-picker-design.md`

---

## File Structure

### 新建文件

| 文件 | 职责 |
|---|---|
| `packages/shared/src/constants/cities.ts` | 全国地级市常量（含省份归属） |
| `packages/shared/src/constants/cities.spec.ts` | cities 常量的不变量测试 |
| `packages/shared/src/constants/major-sub-categories.ts` | 92 个一级学科/专业类 |
| `packages/shared/src/constants/major-sub-categories.spec.ts` | 不变量测试 |
| `apps/server/src/modules/university/dto/picker-option.dto.ts` | picker 端点响应 DTO |
| `apps/server/src/modules/batch-config/batch-config.module.ts` | 新模块 |
| `apps/server/src/modules/batch-config/batch-config.controller.ts` | `/batch-config/picker-options` |
| `apps/server/src/modules/batch-config/batch-config.service.ts` | 查询逻辑 |
| `apps/server/src/modules/batch-config/batch-config.service.spec.ts` | 单测 |
| `apps/web/src/components/student/picker/AutoSavePicker.tsx` | 主组件 |
| `apps/web/src/components/student/picker/__tests__/AutoSavePicker.test.tsx` | 组件测试 |
| `apps/web/src/components/student/picker/options/useProvinceOptions.ts` | 静态 hook |
| `apps/web/src/components/student/picker/options/useCityOptions.ts` | 静态 hook |
| `apps/web/src/components/student/picker/options/useMajorCategoryOptions.ts` | 静态 hook |
| `apps/web/src/components/student/picker/options/useUniversityOptions.ts` | API hook |
| `apps/web/src/components/student/picker/options/useMajorOptions.ts` | API hook |
| `apps/web/src/components/student/picker/options/useBatchOptions.ts` | API hook |
| `apps/web/src/services/picker.ts` | picker API client |

### 修改文件

| 文件 | 改动 |
|---|---|
| `packages/shared/src/constants/index.ts` | 导出 cities + major-sub-categories |
| `apps/server/src/modules/student/dto/update-student-profile.dto.ts:386-390` | `preferredBatches: Batch[]` → `String[]` |
| `apps/server/src/modules/university/university.controller.ts` | 加 `@Get('picker-options')` |
| `apps/server/src/modules/university/university.service.ts` | 加 `getPickerOptions()` 方法 |
| `apps/server/src/modules/major/major.controller.ts` | 加 `@Get('picker-options')` |
| `apps/server/src/modules/major/major.service.ts` | 加 `getPickerOptions()` 方法 |
| `apps/server/src/app.module.ts` | 注册 BatchConfigModule |
| `apps/web/src/components/student/sections/PreferenceSection.tsx` | 全部 10 个 `AutoSaveSelect` → `AutoSavePicker` |

---

## P1 — 数据准备

### Task 1.1: Cities 常量

**Files:**
- Create: `packages/shared/src/constants/cities.ts`
- Create: `packages/shared/src/constants/cities.spec.ts`
- Modify: `packages/shared/src/constants/index.ts`
- Modify: `packages/shared/package.json` (加 china-division dep)

**数据来源**：使用 npm 包 `china-division`（GitHub 上 modood/Administrative-divisions-of-China 的官方发布），含教育部最新行政区划。

- [ ] **Step 1: 写失败测试**

```ts
// packages/shared/src/constants/cities.spec.ts
import { CITIES } from './cities';

describe('CITIES', () => {
  it('contains 成都市 with provinceName 四川省', () => {
    const cd = CITIES.find((c) => c.name === '成都市');
    expect(cd).toBeDefined();
    expect(cd?.provinceName).toBe('四川省');
  });

  it('contains 北京市 / 上海市 / 深圳市', () => {
    expect(CITIES.find((c) => c.name === '北京市')).toBeDefined();
    expect(CITIES.find((c) => c.name === '上海市')).toBeDefined();
    expect(CITIES.find((c) => c.name === '深圳市')).toBeDefined();
  });

  it('has > 300 cities', () => {
    expect(CITIES.length).toBeGreaterThan(300);
  });

  it('all codes are unique', () => {
    const codes = CITIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
cd packages/shared && npx jest src/constants/cities.spec.ts
```
Expected: FAIL（找不到 ./cities）

- [ ] **Step 3: 安装数据源依赖**

```bash
cd packages/shared && pnpm add china-division
```

- [ ] **Step 4: 实现 cities.ts**

```ts
// packages/shared/src/constants/cities.ts
// 数据源：china-division v2 (基于 民政部 / 国家统计局)
import provinceJson from 'china-division/dist/province.json';
import cityJson from 'china-division/dist/city.json';

export interface CityOption {
  /** 城市名，如 "成都市" */
  name: string;
  /** 城市行政区划码，如 "510100" */
  code: string;
  /** 所属省名，如 "四川省" */
  provinceName: string;
  /** 所属省码，如 "510000" */
  provinceCode: string;
}

const PROVINCE_NAME_BY_CODE = new Map(
  (provinceJson as Array<{ code: string; name: string }>).map((p) => [p.code, p.name]),
);

export const CITIES: CityOption[] = (
  cityJson as Array<{ code: string; name: string; provinceCode: string }>
).map((c) => ({
  name: c.name,
  code: c.code,
  provinceCode: c.provinceCode,
  provinceName: PROVINCE_NAME_BY_CODE.get(c.provinceCode) ?? '',
}));
```

- [ ] **Step 5: 在 constants/index.ts 加导出**

```ts
// packages/shared/src/constants/index.ts
export * from './provinces';
export * from './university';
export * from './major';
export * from './recommend';
export * from './admission';
export * from './cities'; // <-- 新加
```

- [ ] **Step 6: 跑测试，确认通过**

```bash
cd packages/shared && npx jest src/constants/cities.spec.ts
```
Expected: PASS（4 个测试全过）

- [ ] **Step 7: 提交**

```bash
git add packages/shared/src/constants/cities.ts packages/shared/src/constants/cities.spec.ts packages/shared/src/constants/index.ts packages/shared/package.json packages/shared/pnpm-lock.yaml
git commit -m "feat(shared): add CITIES constant from china-division dataset"
```

---

### Task 1.2: Major sub-categories 常量

**Files:**
- Create: `packages/shared/src/constants/major-sub-categories.ts`
- Create: `packages/shared/src/constants/major-sub-categories.spec.ts`
- Modify: `packages/shared/src/constants/index.ts`

**数据来源**：教育部《普通高等学校本科专业目录（2024 年）》中"专业类"层级，共 92 个。完整清单按 14 学科门类分组。

- [ ] **Step 1: 写失败测试**

```ts
// packages/shared/src/constants/major-sub-categories.spec.ts
import { MAJOR_SUB_CATEGORIES } from './major-sub-categories';
import { MAJOR_CATEGORIES } from './major';

describe('MAJOR_SUB_CATEGORIES', () => {
  it('contains 计算机类 (categoryCode 08 工学)', () => {
    const cs = MAJOR_SUB_CATEGORIES.find((m) => m.name === '计算机类');
    expect(cs).toBeDefined();
    expect(cs?.categoryCode).toBe('08');
  });

  it('contains 临床医学类 (categoryCode 10 医学)', () => {
    const cm = MAJOR_SUB_CATEGORIES.find((m) => m.name === '临床医学类');
    expect(cm).toBeDefined();
    expect(cm?.categoryCode).toBe('10');
  });

  it('contains 金融学类 (categoryCode 02 经济学)', () => {
    expect(MAJOR_SUB_CATEGORIES.find((m) => m.name === '金融学类')).toBeDefined();
  });

  it('has 92 entries (教育部 2024 目录)', () => {
    expect(MAJOR_SUB_CATEGORIES.length).toBe(92);
  });

  it('all codes are unique', () => {
    const codes = MAJOR_SUB_CATEGORIES.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('every categoryCode references a valid MAJOR_CATEGORIES entry', () => {
    const validCodes = new Set(MAJOR_CATEGORIES.map((c) => c.code));
    for (const sub of MAJOR_SUB_CATEGORIES) {
      expect(validCodes).toContain(sub.categoryCode);
    }
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
cd packages/shared && npx jest src/constants/major-sub-categories.spec.ts
```
Expected: FAIL

- [ ] **Step 3: 实现常量文件**

按 14 学科门类分组，写入完整 92 个一级学科。每条 `{ code, name, categoryCode }`。code 为教育部 4 位编码（如计算机类 = "0809"），categoryCode 是所属门类（如 "08" = 工学）。

```ts
// packages/shared/src/constants/major-sub-categories.ts
/**
 * 教育部《普通高等学校本科专业目录》一级学科 / 专业类
 * 2024 年版，共 92 类。code 为 4 位编码，categoryCode 对应 MAJOR_CATEGORIES 的 2 位门类码
 */
export interface MajorSubCategory {
  /** 4 位编码，如 "0809" */
  code: string;
  /** 类名，如 "计算机类" */
  name: string;
  /** 所属门类 2 位码，如 "08" (= 工学) */
  categoryCode: string;
}

export const MAJOR_SUB_CATEGORIES: MajorSubCategory[] = [
  // 01 哲学 (1)
  { code: '0101', name: '哲学类', categoryCode: '01' },
  // 02 经济学 (4)
  { code: '0201', name: '经济学类', categoryCode: '02' },
  { code: '0202', name: '财政学类', categoryCode: '02' },
  { code: '0203', name: '金融学类', categoryCode: '02' },
  { code: '0204', name: '经济与贸易类', categoryCode: '02' },
  // 03 法学 (6)
  { code: '0301', name: '法学类', categoryCode: '03' },
  { code: '0302', name: '政治学类', categoryCode: '03' },
  { code: '0303', name: '社会学类', categoryCode: '03' },
  { code: '0304', name: '民族学类', categoryCode: '03' },
  { code: '0305', name: '马克思主义理论类', categoryCode: '03' },
  { code: '0306', name: '公安学类', categoryCode: '03' },
  // 04 教育学 (2)
  { code: '0401', name: '教育学类', categoryCode: '04' },
  { code: '0402', name: '体育学类', categoryCode: '04' },
  // 05 文学 (3)
  { code: '0501', name: '中国语言文学类', categoryCode: '05' },
  { code: '0502', name: '外国语言文学类', categoryCode: '05' },
  { code: '0503', name: '新闻传播学类', categoryCode: '05' },
  // 06 历史学 (1)
  { code: '0601', name: '历史学类', categoryCode: '06' },
  // 07 理学 (12)
  { code: '0701', name: '数学类', categoryCode: '07' },
  { code: '0702', name: '物理学类', categoryCode: '07' },
  { code: '0703', name: '化学类', categoryCode: '07' },
  { code: '0704', name: '天文学类', categoryCode: '07' },
  { code: '0705', name: '地理科学类', categoryCode: '07' },
  { code: '0706', name: '大气科学类', categoryCode: '07' },
  { code: '0707', name: '海洋科学类', categoryCode: '07' },
  { code: '0708', name: '地球物理学类', categoryCode: '07' },
  { code: '0709', name: '地质学类', categoryCode: '07' },
  { code: '0710', name: '生物科学类', categoryCode: '07' },
  { code: '0711', name: '心理学类', categoryCode: '07' },
  { code: '0712', name: '统计学类', categoryCode: '07' },
  // 08 工学 (32)
  { code: '0801', name: '力学类', categoryCode: '08' },
  { code: '0802', name: '机械类', categoryCode: '08' },
  { code: '0803', name: '仪器类', categoryCode: '08' },
  { code: '0804', name: '材料类', categoryCode: '08' },
  { code: '0805', name: '能源动力类', categoryCode: '08' },
  { code: '0806', name: '电气类', categoryCode: '08' },
  { code: '0807', name: '电子信息类', categoryCode: '08' },
  { code: '0808', name: '自动化类', categoryCode: '08' },
  { code: '0809', name: '计算机类', categoryCode: '08' },
  { code: '0810', name: '土木类', categoryCode: '08' },
  { code: '0811', name: '水利类', categoryCode: '08' },
  { code: '0812', name: '测绘类', categoryCode: '08' },
  { code: '0813', name: '化工与制药类', categoryCode: '08' },
  { code: '0814', name: '地质类', categoryCode: '08' },
  { code: '0815', name: '矿业类', categoryCode: '08' },
  { code: '0816', name: '纺织类', categoryCode: '08' },
  { code: '0817', name: '轻工类', categoryCode: '08' },
  { code: '0818', name: '交通运输类', categoryCode: '08' },
  { code: '0819', name: '海洋工程类', categoryCode: '08' },
  { code: '0820', name: '航空航天类', categoryCode: '08' },
  { code: '0821', name: '兵器类', categoryCode: '08' },
  { code: '0822', name: '核工程类', categoryCode: '08' },
  { code: '0823', name: '农业工程类', categoryCode: '08' },
  { code: '0824', name: '林业工程类', categoryCode: '08' },
  { code: '0825', name: '环境科学与工程类', categoryCode: '08' },
  { code: '0826', name: '生物医学工程类', categoryCode: '08' },
  { code: '0827', name: '食品科学与工程类', categoryCode: '08' },
  { code: '0828', name: '建筑类', categoryCode: '08' },
  { code: '0829', name: '安全科学与工程类', categoryCode: '08' },
  { code: '0830', name: '生物工程类', categoryCode: '08' },
  { code: '0831', name: '公安技术类', categoryCode: '08' },
  { code: '0832', name: '交叉工程类', categoryCode: '08' },
  // 09 农学 (7)
  { code: '0901', name: '植物生产类', categoryCode: '09' },
  { code: '0902', name: '自然保护与环境生态类', categoryCode: '09' },
  { code: '0903', name: '动物生产类', categoryCode: '09' },
  { code: '0904', name: '动物医学类', categoryCode: '09' },
  { code: '0905', name: '林学类', categoryCode: '09' },
  { code: '0906', name: '水产类', categoryCode: '09' },
  { code: '0907', name: '草学类', categoryCode: '09' },
  // 10 医学 (11)
  { code: '1001', name: '基础医学类', categoryCode: '10' },
  { code: '1002', name: '临床医学类', categoryCode: '10' },
  { code: '1003', name: '口腔医学类', categoryCode: '10' },
  { code: '1004', name: '公共卫生与预防医学类', categoryCode: '10' },
  { code: '1005', name: '中医学类', categoryCode: '10' },
  { code: '1006', name: '中西医结合类', categoryCode: '10' },
  { code: '1007', name: '药学类', categoryCode: '10' },
  { code: '1008', name: '中药学类', categoryCode: '10' },
  { code: '1009', name: '法医学类', categoryCode: '10' },
  { code: '1010', name: '医学技术类', categoryCode: '10' },
  { code: '1011', name: '护理学类', categoryCode: '10' },
  // 11 军事学 (0 — 不在普通本科招生)
  // 12 管理学 (9)
  { code: '1201', name: '管理科学与工程类', categoryCode: '12' },
  { code: '1202', name: '工商管理类', categoryCode: '12' },
  { code: '1203', name: '农业经济管理类', categoryCode: '12' },
  { code: '1204', name: '公共管理类', categoryCode: '12' },
  { code: '1205', name: '图书情报与档案管理类', categoryCode: '12' },
  { code: '1206', name: '物流管理与工程类', categoryCode: '12' },
  { code: '1207', name: '工业工程类', categoryCode: '12' },
  { code: '1208', name: '电子商务类', categoryCode: '12' },
  { code: '1209', name: '旅游管理类', categoryCode: '12' },
  // 13 艺术学 (5)
  { code: '1301', name: '艺术学理论类', categoryCode: '13' },
  { code: '1302', name: '音乐与舞蹈学类', categoryCode: '13' },
  { code: '1303', name: '戏剧与影视学类', categoryCode: '13' },
  { code: '1304', name: '美术学类', categoryCode: '13' },
  { code: '1305', name: '设计学类', categoryCode: '13' },
  // 14 交叉学科 (无独立类，归入相应门类)
];
```

注：实际 92 个的细节以教育部 2024 目录为准；测试断言只验关键项 + 总数 + code 唯一。如果上述列表 count != 92，按教育部官方目录补齐。

- [ ] **Step 4: 在 constants/index.ts 加导出**

```ts
export * from './major-sub-categories';
```

- [ ] **Step 5: 跑测试，确认通过**

```bash
cd packages/shared && npx jest src/constants/major-sub-categories.spec.ts
```
Expected: PASS（6 个测试全过）

- [ ] **Step 6: 提交**

```bash
git add packages/shared/src/constants/major-sub-categories.ts packages/shared/src/constants/major-sub-categories.spec.ts packages/shared/src/constants/index.ts
git commit -m "feat(shared): add MAJOR_SUB_CATEGORIES (92 一级学科) from MoE 2024 catalog"
```

---

### Task 1.3: 升级 preferredBatches DTO 类型

**Files:**
- Modify: `apps/server/src/modules/student/dto/update-student-profile.dto.ts:386-390`

DTO 当前用 `Batch[]` 限制 4 粗类，改成 `String[]` 接收任意 batch_config code（实际生产 `preferredBatches` 表为空，无脏数据）。schema 字段是 `Json?` 不需要 prisma 迁移。

- [ ] **Step 1: 写失败测试（验 DTO 接受任意字符串数组）**

```ts
// apps/server/src/modules/student/dto/update-student-profile.dto.spec.ts
// 注：如果文件不存在，新建之
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateStudentProfileDto } from './update-student-profile.dto';

describe('UpdateStudentProfileDto.preferredBatches', () => {
  it('accepts arbitrary batch name strings (not constrained to Batch enum)', async () => {
    const dto = plainToInstance(UpdateStudentProfileDto, {
      preferredBatches: ['本科提前批A段', '本科批A段', '高职专科批'],
    });
    const errors = await validate(dto);
    const batchErrors = errors.filter((e) => e.property === 'preferredBatches');
    expect(batchErrors).toHaveLength(0);
  });

  it('rejects non-string array elements', async () => {
    const dto = plainToInstance(UpdateStudentProfileDto, {
      preferredBatches: [123, true],
    });
    const errors = await validate(dto);
    const batchErrors = errors.filter((e) => e.property === 'preferredBatches');
    expect(batchErrors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
cd apps/server && npx jest src/modules/student/dto/update-student-profile.dto.spec.ts
```
Expected: FAIL（旧的 `@IsEnum(Batch)` 拒绝中文名）

- [ ] **Step 3: 修改 DTO（行 386-390）**

```ts
// apps/server/src/modules/student/dto/update-student-profile.dto.ts:386-390
// 旧：
//   @ApiPropertyOptional({ enum: Batch, isArray: true })
//   @IsOptional()
//   @IsArray()
//   @IsEnum(Batch, { each: true })
//   preferredBatches?: Batch[];
// 新：
@ApiPropertyOptional({ description: '意向批次（batch_config 中的 batch 字段值，多省份扩展友好）', isArray: true })
@IsOptional()
@IsArray()
@IsString({ each: true })
preferredBatches?: string[];
```

同步删掉文件顶部 import 中的 `Batch`（如果只此处用到）。

- [ ] **Step 4: 跑测试，确认通过**

```bash
cd apps/server && npx jest src/modules/student/dto/update-student-profile.dto.spec.ts
```
Expected: PASS

- [ ] **Step 5: 跑全量 server 测试，确认无回归**

```bash
cd apps/server && npx jest
```
Expected: 全部通过（402+ tests）

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/modules/student/dto/update-student-profile.dto.ts apps/server/src/modules/student/dto/update-student-profile.dto.spec.ts
git commit -m "feat(student-profile): allow arbitrary batch code strings in preferredBatches DTO"
```

---

## P2 — 后端 picker-options 端点

### Task 2.1: University picker-options 端点

**Files:**
- Create: `apps/server/src/modules/university/dto/picker-option.dto.ts`
- Modify: `apps/server/src/modules/university/university.controller.ts`
- Modify: `apps/server/src/modules/university/university.service.ts`
- Modify: `apps/server/src/modules/university/university.service.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
// 在 university.service.spec.ts 末尾追加
describe('getPickerOptions', () => {
  it('returns array of {id, code, name} for all universities', async () => {
    // 确保种子数据中至少有 1 所院校
    const result = await service.getPickerOptions();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        code: expect.any(String),
        name: expect.any(String),
      }),
    );
  });

  it('result entries do NOT contain admission_records / score_lines fields', async () => {
    const result = await service.getPickerOptions();
    expect(result[0]).not.toHaveProperty('admissionRecords');
    expect(result[0]).not.toHaveProperty('scoreLines');
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
cd apps/server && npx jest university.service.spec.ts -t "getPickerOptions"
```
Expected: FAIL（method 不存在）

- [ ] **Step 3: 实现 service 方法**

```ts
// apps/server/src/modules/university/university.service.ts，在类内追加
async getPickerOptions(): Promise<{ id: number; code: string; name: string }[]> {
  return this.prisma.university.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { name: 'asc' },
  });
}
```

- [ ] **Step 4: 创建 DTO**

```ts
// apps/server/src/modules/university/dto/picker-option.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class UniversityPickerOptionDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ description: '院校代码' })
  code!: string;

  @ApiProperty({ description: '院校名称' })
  name!: string;
}
```

- [ ] **Step 5: 加 controller 端点**

```ts
// apps/server/src/modules/university/university.controller.ts，import 顶部
import { UniversityPickerOptionDto } from './dto/picker-option.dto';
import { Header } from '@nestjs/common';

// 在 @Get() 之前插入新端点（顺序很重要，避免 :id 截胡）
@Get('picker-options')
@ApiOperation({ summary: '院校 picker 选项（id/code/name 精简）' })
@ApiResponse({ status: 200, type: [UniversityPickerOptionDto] })
@Header('Cache-Control', 'public, max-age=86400')
async getPickerOptions(): Promise<UniversityPickerOptionDto[]> {
  return this.universityService.getPickerOptions();
}
```

注：必须在 `@Get(':id')` 之前注册 `@Get('picker-options')`，否则 `picker-options` 会被 :id 当成 ID 解析。

- [ ] **Step 6: 跑测试，确认通过**

```bash
cd apps/server && npx jest university.service.spec.ts
```
Expected: 全部通过

- [ ] **Step 7: 提交**

```bash
git add apps/server/src/modules/university/dto/picker-option.dto.ts apps/server/src/modules/university/university.controller.ts apps/server/src/modules/university/university.service.ts apps/server/src/modules/university/university.service.spec.ts
git commit -m "feat(university): add /picker-options endpoint returning {id,code,name}"
```

---

### Task 2.2: Major picker-options 端点

**Files:**
- Create: `apps/server/src/modules/major/dto/picker-option.dto.ts`
- Modify: `apps/server/src/modules/major/major.controller.ts`
- Modify: `apps/server/src/modules/major/major.service.ts`
- Create: `apps/server/src/modules/major/major.service.spec.ts`（如不存在）

模式与 Task 2.1 完全一致。

- [ ] **Step 1: 写失败测试**

```ts
// apps/server/src/modules/major/major.service.spec.ts
// 如果文件不存在，新建并 setup TestingModule（参考 university.service.spec.ts）
describe('getPickerOptions', () => {
  it('returns array of {id, code, name}', async () => {
    const result = await service.getPickerOptions();
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          code: expect.any(String),
          name: expect.any(String),
        }),
      );
    }
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
cd apps/server && npx jest major.service.spec.ts -t "getPickerOptions"
```
Expected: FAIL

- [ ] **Step 3: 实现 service 方法**

```ts
// apps/server/src/modules/major/major.service.ts，在类内追加
async getPickerOptions(): Promise<{ id: number; code: string; name: string }[]> {
  return this.prisma.major.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { name: 'asc' },
  });
}
```

- [ ] **Step 4: 创建 DTO + controller 端点**

```ts
// apps/server/src/modules/major/dto/picker-option.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class MajorPickerOptionDto {
  @ApiProperty() id!: number;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
}
```

```ts
// apps/server/src/modules/major/major.controller.ts，在 @Get(':id') 之前
@Get('picker-options')
@ApiOperation({ summary: '专业 picker 选项' })
@Header('Cache-Control', 'public, max-age=86400')
async getPickerOptions(): Promise<MajorPickerOptionDto[]> {
  return this.majorService.getPickerOptions();
}
```

记得 import `MajorPickerOptionDto` 和 `Header` from `@nestjs/common`。

- [ ] **Step 5: 跑测试，确认通过**

```bash
cd apps/server && npx jest major.service.spec.ts
```
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/modules/major/dto/picker-option.dto.ts apps/server/src/modules/major/major.controller.ts apps/server/src/modules/major/major.service.ts apps/server/src/modules/major/major.service.spec.ts
git commit -m "feat(major): add /picker-options endpoint returning {id,code,name}"
```

---

### Task 2.3: BatchConfig 模块 + picker-options 端点

**Files:**
- Create: `apps/server/src/modules/batch-config/batch-config.module.ts`
- Create: `apps/server/src/modules/batch-config/batch-config.controller.ts`
- Create: `apps/server/src/modules/batch-config/batch-config.service.ts`
- Create: `apps/server/src/modules/batch-config/batch-config.service.spec.ts`
- Create: `apps/server/src/modules/batch-config/dto/picker-option.dto.ts`
- Modify: `apps/server/src/app.module.ts`

BatchConfig 当前没有专门 module，先建一个。

- [ ] **Step 1: 写失败测试**

```ts
// apps/server/src/modules/batch-config/batch-config.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { BatchConfigService } from './batch-config.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('BatchConfigService', () => {
  let service: BatchConfigService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      batchConfig: {
        findMany: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchConfigService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(BatchConfigService);
  });

  describe('getPickerOptions', () => {
    it('queries batch_config by year + dedupes by batch name', async () => {
      prismaMock.batchConfig.findMany.mockResolvedValue([
        { batch: '本科提前批A段', admissionOrder: 1, examType: '物理' },
        { batch: '本科提前批A段', admissionOrder: 1, examType: '历史' },
        { batch: '本科批A段', admissionOrder: 5, examType: '物理' },
      ]);

      const result = await service.getPickerOptions(2026, '四川');

      expect(prismaMock.batchConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { year: 2026, province: '四川' },
        }),
      );
      // 去重：3 行 → 2 个 unique batch
      expect(result).toEqual([
        { code: '本科提前批A段', name: '本科提前批A段', order: 1 },
        { code: '本科批A段', name: '本科批A段', order: 5 },
      ]);
    });

    it('sorts by admissionOrder ascending', async () => {
      prismaMock.batchConfig.findMany.mockResolvedValue([
        { batch: 'B', admissionOrder: 2, examType: '物理' },
        { batch: 'A', admissionOrder: 1, examType: '物理' },
        { batch: 'C', admissionOrder: 3, examType: '物理' },
      ]);
      const result = await service.getPickerOptions(2026, '四川');
      expect(result.map((r) => r.code)).toEqual(['A', 'B', 'C']);
    });
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
cd apps/server && npx jest batch-config.service.spec.ts
```
Expected: FAIL（找不到 BatchConfigService）

- [ ] **Step 3: 实现 service**

```ts
// apps/server/src/modules/batch-config/batch-config.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface BatchPickerOption {
  /** 批次名（同时也是 value，多省份扩展友好） */
  code: string;
  name: string;
  /** 录取顺序，前端按此排序 */
  order: number;
}

@Injectable()
export class BatchConfigService {
  constructor(private prisma: PrismaService) {}

  async getPickerOptions(year: number, province: string): Promise<BatchPickerOption[]> {
    const rows = await this.prisma.batchConfig.findMany({
      where: { year, province },
      select: { batch: true, admissionOrder: true },
    });
    // 同一 batch 在物理 / 历史下可能各有一行，去重
    const map = new Map<string, BatchPickerOption>();
    for (const r of rows) {
      if (!map.has(r.batch)) {
        map.set(r.batch, { code: r.batch, name: r.batch, order: r.admissionOrder });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }
}
```

- [ ] **Step 4: 创建 controller + DTO + module**

```ts
// apps/server/src/modules/batch-config/dto/picker-option.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class BatchPickerOptionDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() order!: number;
}
```

```ts
// apps/server/src/modules/batch-config/batch-config.controller.ts
import { Controller, Get, Header, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BatchConfigService } from './batch-config.service';
import { BatchPickerOptionDto } from './dto/picker-option.dto';

@ApiTags('批次配置')
@Controller('batch-config')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BatchConfigController {
  constructor(private service: BatchConfigService) {}

  @Get('picker-options')
  @ApiOperation({ summary: '批次 picker 选项（按 year + province 过滤）' })
  @ApiResponse({ status: 200, type: [BatchPickerOptionDto] })
  @Header('Cache-Control', 'public, max-age=86400')
  async getPickerOptions(
    @Query('serviceYear', new DefaultValuePipe(2026), ParseIntPipe) year: number,
    @Query('province', new DefaultValuePipe('四川')) province: string,
  ): Promise<BatchPickerOptionDto[]> {
    return this.service.getPickerOptions(year, province);
  }
}
```

```ts
// apps/server/src/modules/batch-config/batch-config.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BatchConfigController } from './batch-config.controller';
import { BatchConfigService } from './batch-config.service';

@Module({
  imports: [PrismaModule],
  controllers: [BatchConfigController],
  providers: [BatchConfigService],
  exports: [BatchConfigService],
})
export class BatchConfigModule {}
```

- [ ] **Step 5: 在 AppModule 注册**

```ts
// apps/server/src/app.module.ts
import { BatchConfigModule } from './modules/batch-config/batch-config.module';

// 在 imports 数组里加
@Module({
  imports: [
    // ... 现有 modules
    BatchConfigModule,
  ],
})
```

- [ ] **Step 6: 跑测试，确认通过**

```bash
cd apps/server && npx jest batch-config.service.spec.ts
```
Expected: PASS（2 个测试）

- [ ] **Step 7: 全量回归**

```bash
cd apps/server && npx jest
```
Expected: 全过

- [ ] **Step 8: 提交**

```bash
git add apps/server/src/modules/batch-config/ apps/server/src/app.module.ts
git commit -m "feat(batch-config): add module with /picker-options endpoint"
```

---

## P3 — 前端基建

### Task 3.1: AutoSavePicker 组件

**Files:**
- Create: `apps/web/src/components/student/picker/AutoSavePicker.tsx`
- Create: `apps/web/src/components/student/picker/__tests__/AutoSavePicker.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
// apps/web/src/components/student/picker/__tests__/AutoSavePicker.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AutoSavePicker from '../AutoSavePicker';

jest.mock('@/services/student-api', () => ({
  studentApi: {
    patchMyProfile: jest.fn().mockResolvedValue({}),
  },
}));
jest.mock('@/services/user', () => ({
  userService: { updateProfile: jest.fn().mockResolvedValue({}) },
}));

const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

const fakeHook = () => ({
  data: [
    { label: '成都市', value: 'CD' },
    { label: '北京市', value: 'BJ' },
    { label: '上海市', value: 'SH' },
  ],
  isLoading: false,
});

describe('AutoSavePicker', () => {
  it('renders default selected values as labels', () => {
    wrap(
      <AutoSavePicker
        fieldKey="preferredCities"
        defaultValue={['CD', 'BJ']}
        optionsHook={fakeHook}
      />,
    );
    expect(screen.getByText('成都市')).toBeInTheDocument();
    expect(screen.getByText('北京市')).toBeInTheDocument();
  });

  it('does NOT allow free input (mode is multiple, not tags)', async () => {
    const user = userEvent.setup();
    wrap(
      <AutoSavePicker
        fieldKey="preferredCities"
        defaultValue={[]}
        optionsHook={fakeHook}
      />,
    );
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, '不存在的城市');
    // antd "multiple" mode 输入只触发 filter，不会成为新 value
    await user.keyboard('{Enter}');
    expect(screen.queryByText('不存在的城市')).not.toBeInTheDocument();
  });

  it('filters dropdown by typed keyword', async () => {
    const user = userEvent.setup();
    wrap(
      <AutoSavePicker
        fieldKey="preferredCities"
        defaultValue={[]}
        optionsHook={fakeHook}
      />,
    );
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, '成');
    await waitFor(() => {
      expect(screen.getByText('成都市')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
cd apps/web && npx jest AutoSavePicker
```
Expected: FAIL（找不到组件）

- [ ] **Step 3: 实现组件**

```tsx
// apps/web/src/components/student/picker/AutoSavePicker.tsx
'use client';

import { useState } from 'react';
import { Select } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

export interface PickerOption {
  label: string;
  value: string;
}

interface Props {
  fieldKey: string;
  defaultValue?: string[];
  optionsHook: () => { data: PickerOption[]; isLoading: boolean };
  placeholder?: string;
}

export default function AutoSavePicker({
  fieldKey,
  defaultValue = [],
  optionsHook,
  placeholder,
}: Props) {
  const [value, setValue] = useState<string[]>(defaultValue);
  const [open, setOpen] = useState(false);
  // optionsHook 内部决定何时拉数据；统一接口
  const { data: options, isLoading } = optionsHook();
  const setSaving = useStudentSaveStore((s) => s.setSaving);
  const setSaved = useStudentSaveStore((s) => s.setSaved);
  const setError = useStudentSaveStore((s) => s.setError);
  const queryClient = useQueryClient();

  const handleChange = async (v: string[]) => {
    setValue(v);
    setSaving();
    try {
      await studentApi.patchMyProfile({ [fieldKey]: v } as any);
      setSaved();
      queryClient.invalidateQueries({ queryKey: ['bonus-calc'] });
    } catch (e) {
      setError((e as Error).message ?? '保存失败');
    }
  };

  return (
    <Select<string[]>
      mode="multiple"
      showSearch
      optionFilterProp="label"
      options={options}
      loading={isLoading}
      notFoundContent={isLoading ? '加载中...' : '无匹配'}
      maxTagCount="responsive"
      virtual
      placeholder={placeholder ?? '搜索并勾选'}
      value={value}
      onChange={handleChange}
      open={open}
      onDropdownVisibleChange={setOpen}
      style={{ width: '100%' }}
    />
  );
}
```

- [ ] **Step 4: 跑测试，确认通过**

```bash
cd apps/web && npx jest AutoSavePicker
```
Expected: PASS（3 个测试）

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/components/student/picker/
git commit -m "feat(picker): add AutoSavePicker component (multi-select with search, no free input)"
```

---

### Task 3.2: 静态 options hooks（province / city / major-category）

**Files:**
- Create: `apps/web/src/components/student/picker/options/useProvinceOptions.ts`
- Create: `apps/web/src/components/student/picker/options/useCityOptions.ts`
- Create: `apps/web/src/components/student/picker/options/useMajorCategoryOptions.ts`

静态数据无 loading 概念，但保留统一接口形状。

- [ ] **Step 1: 实现 useProvinceOptions**

```ts
// apps/web/src/components/student/picker/options/useProvinceOptions.ts
import { PROVINCES } from '@volunteer-helper/shared';
import type { PickerOption } from '../AutoSavePicker';

const OPTIONS: PickerOption[] = PROVINCES.map((p) => ({
  label: p.name,
  value: p.name, // 存中文名（向后兼容现有数据）
}));

export function useProvinceOptions() {
  return { data: OPTIONS, isLoading: false };
}
```

- [ ] **Step 2: 实现 useCityOptions**

```ts
// apps/web/src/components/student/picker/options/useCityOptions.ts
import { CITIES } from '@volunteer-helper/shared';
import type { PickerOption } from '../AutoSavePicker';

const OPTIONS: PickerOption[] = CITIES.map((c) => ({
  label: c.name,
  value: c.name,
}));

export function useCityOptions() {
  return { data: OPTIONS, isLoading: false };
}
```

- [ ] **Step 3: 实现 useMajorCategoryOptions**

```ts
// apps/web/src/components/student/picker/options/useMajorCategoryOptions.ts
import { MAJOR_SUB_CATEGORIES } from '@volunteer-helper/shared';
import type { PickerOption } from '../AutoSavePicker';

const OPTIONS: PickerOption[] = MAJOR_SUB_CATEGORIES.map((m) => ({
  label: m.name,
  value: m.name,
}));

export function useMajorCategoryOptions() {
  return { data: OPTIONS, isLoading: false };
}
```

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/components/student/picker/options/useProvinceOptions.ts apps/web/src/components/student/picker/options/useCityOptions.ts apps/web/src/components/student/picker/options/useMajorCategoryOptions.ts
git commit -m "feat(picker): add static option hooks (province/city/major-category)"
```

---

### Task 3.3: API options hooks + picker service

**Files:**
- Create: `apps/web/src/services/picker.ts`
- Create: `apps/web/src/components/student/picker/options/useUniversityOptions.ts`
- Create: `apps/web/src/components/student/picker/options/useMajorOptions.ts`
- Create: `apps/web/src/components/student/picker/options/useBatchOptions.ts`

- [ ] **Step 1: 创建 API client**

```ts
// apps/web/src/services/picker.ts
import api from './api';

export interface UniversityPickerOption { id: number; code: string; name: string; }
export interface MajorPickerOption { id: number; code: string; name: string; }
export interface BatchPickerOption { code: string; name: string; order: number; }

export const pickerApi = {
  universities(): Promise<UniversityPickerOption[]> {
    return api.get('/universities/picker-options') as any;
  },
  majors(): Promise<MajorPickerOption[]> {
    return api.get('/majors/picker-options') as any;
  },
  batches(year = 2026, province = '四川'): Promise<BatchPickerOption[]> {
    return api.get(`/batch-config/picker-options?serviceYear=${year}&province=${encodeURIComponent(province)}`) as any;
  },
};
```

- [ ] **Step 2: 实现 useUniversityOptions**

```ts
// apps/web/src/components/student/picker/options/useUniversityOptions.ts
import { useQuery } from '@tanstack/react-query';
import { pickerApi } from '@/services/picker';
import type { PickerOption } from '../AutoSavePicker';

export function useUniversityOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ['picker-options', 'universities'],
    queryFn: () => pickerApi.universities(),
    staleTime: Infinity,
  });
  const options: PickerOption[] = (data ?? []).map((u) => ({
    label: u.name,
    value: u.name, // 存名字，与现有 preferredUniversities 兼容
  }));
  return { data: options, isLoading };
}
```

- [ ] **Step 3: 实现 useMajorOptions**

```ts
// apps/web/src/components/student/picker/options/useMajorOptions.ts
import { useQuery } from '@tanstack/react-query';
import { pickerApi } from '@/services/picker';
import type { PickerOption } from '../AutoSavePicker';

export function useMajorOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ['picker-options', 'majors'],
    queryFn: () => pickerApi.majors(),
    staleTime: Infinity,
  });
  const options: PickerOption[] = (data ?? []).map((m) => ({
    label: m.name,
    value: m.name,
  }));
  return { data: options, isLoading };
}
```

- [ ] **Step 4: 实现 useBatchOptions**

```ts
// apps/web/src/components/student/picker/options/useBatchOptions.ts
import { useQuery } from '@tanstack/react-query';
import { pickerApi } from '@/services/picker';
import type { PickerOption } from '../AutoSavePicker';

export function useBatchOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ['picker-options', 'batches', 2026, '四川'],
    queryFn: () => pickerApi.batches(2026, '四川'),
    staleTime: Infinity,
  });
  // 已按 order 排序
  const options: PickerOption[] = (data ?? []).map((b) => ({
    label: b.name,
    value: b.code,
  }));
  return { data: options, isLoading };
}
```

- [ ] **Step 5: 验证 hooks 类型 + 编译**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -E "useUniversityOptions|useMajorOptions|useBatchOptions"
```
Expected: 无输出（无类型错）

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/services/picker.ts apps/web/src/components/student/picker/options/useUniversityOptions.ts apps/web/src/components/student/picker/options/useMajorOptions.ts apps/web/src/components/student/picker/options/useBatchOptions.ts
git commit -m "feat(picker): add API option hooks (university/major/batch) with React Query cache"
```

---

## P4 — 字段迁移

### Task 4.1: PreferenceSection 全量替换

**Files:**
- Modify: `apps/web/src/components/student/sections/PreferenceSection.tsx`

10 个字段一次性替换，preferredTags 保持不动。

- [ ] **Step 1: 改写 PreferenceSection.tsx**

```tsx
// apps/web/src/components/student/sections/PreferenceSection.tsx
'use client';
import { Form, Row, Col, Divider } from 'antd';
import AutoSaveSelect from '../auto-save/AutoSaveSelect';
import AutoSaveRadio from '../auto-save/AutoSaveRadio';
import AutoSavePicker from '../picker/AutoSavePicker';
import { useProvinceOptions } from '../picker/options/useProvinceOptions';
import { useCityOptions } from '../picker/options/useCityOptions';
import { useMajorCategoryOptions } from '../picker/options/useMajorCategoryOptions';
import { useUniversityOptions } from '../picker/options/useUniversityOptions';
import { useMajorOptions } from '../picker/options/useMajorOptions';
import { useBatchOptions } from '../picker/options/useBatchOptions';

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
        <Col xs={24} md={12}><Form.Item label="意向省份"><AutoSavePicker fieldKey="preferredProvinces" defaultValue={profile.preferredProvinces ?? []} optionsHook={useProvinceOptions} placeholder="搜索省份" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向城市"><AutoSavePicker fieldKey="preferredCities" defaultValue={profile.preferredCities ?? []} optionsHook={useCityOptions} placeholder="搜索城市" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向院校"><AutoSavePicker fieldKey="preferredUniversities" defaultValue={profile.preferredUniversities ?? []} optionsHook={useUniversityOptions} placeholder="搜索院校" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向专业"><AutoSavePicker fieldKey="preferredMajors" defaultValue={profile.preferredMajors ?? []} optionsHook={useMajorOptions} placeholder="搜索专业" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向专业类别"><AutoSavePicker fieldKey="preferredMajorCategories" defaultValue={profile.preferredMajorCategories ?? []} optionsHook={useMajorCategoryOptions} placeholder="搜索专业类别" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向批次"><AutoSavePicker fieldKey="preferredBatches" defaultValue={profile.preferredBatches ?? []} optionsHook={useBatchOptions} placeholder="搜索批次" /></Form.Item></Col>
        <Col xs={24}><Form.Item label="优先模式" labelCol={{span:3}} wrapperCol={{span:21}}><AutoSaveRadio fieldKey="priorityMode" options={PRIORITY_MODE} defaultValue={profile.priorityMode ?? null} /></Form.Item></Col>
        <Col xs={24}><Form.Item label="意向标签" labelCol={{span:3}} wrapperCol={{span:21}}><AutoSaveSelect fieldKey="preferredTags" defaultValue={profile.preferredTags ?? []} mode="tags" placeholder="自由输入回车添加" /></Form.Item></Col>
        <Col xs={24}><Divider plain orientation="left" style={{margin:'8px 0',fontSize:12,color:'#999'}}>排除项</Divider></Col>
        <Col xs={24} md={12}><Form.Item label="排除省份"><AutoSavePicker fieldKey="excludedProvinces" defaultValue={profile.excludedProvinces ?? []} optionsHook={useProvinceOptions} placeholder="搜索省份" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="排除城市"><AutoSavePicker fieldKey="excludedCities" defaultValue={profile.excludedCities ?? []} optionsHook={useCityOptions} placeholder="搜索城市" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="排除院校"><AutoSavePicker fieldKey="excludedUniversities" defaultValue={profile.excludedUniversities ?? []} optionsHook={useUniversityOptions} placeholder="搜索院校" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="排除专业"><AutoSavePicker fieldKey="excludedMajors" defaultValue={profile.excludedMajors ?? []} optionsHook={useMajorOptions} placeholder="搜索专业" /></Form.Item></Col>
      </Row>
    </Form>
  );
}
```

- [ ] **Step 2: 本地编译验证**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/student/sections/PreferenceSection.tsx
git commit -m "feat(student-profile): migrate 10 preference fields from tags to AutoSavePicker"
```

---

## P5 — 部署 + 端到端验证

### Task 5.1: 部署到生产

- [ ] **Step 1: 跑全量测试**

```bash
cd apps/server && npx jest
cd apps/web && npx jest
```
Expected: 全过

- [ ] **Step 2: 部署**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper && python deploy_auto.py --skip-tests
```
Expected: `[OK] 部署完成`

---

### Task 5.2: 浏览器验证 (chrome-devtools MCP)

测试账号：`bonustest01` / `Test123456!`，URL：`http://132.232.245.53:3004/student/profile`

- [ ] **Step 1: 登录 + 跳到偏好 section**

navigate → `http://132.232.245.53:3004/student/profile`，登录后展开 "6. 志愿偏好与排除"。

- [ ] **Step 2: 验意向省份（静态）**

点击意向省份输入框 → dropdown 出 34 项 → 输入"四" → 高亮"四川省" → 点击勾选 → 标签出现 → 网络 PUT `/api/v1/students/me` 返 200

- [ ] **Step 3: 验意向城市（静态，340 项）**

点击 → 输入"成" → "成都市"高亮 → 勾选 → 200

- [ ] **Step 4: 验意向院校（API + 缓存）**

第一次点击 → loading → 出 2,237 项 → 输入"电子" → "电子科技大学"匹配 → 勾选 → 200。
第二次点击其他字段（排除院校）→ 立即出选项，无 loading（缓存命中）。

- [ ] **Step 5: 验意向专业（API）**

点击 → loading → 出 1,434 项 → 输入"计算机" → 命中"计算机科学与技术"等 → 勾选 → 200

- [ ] **Step 6: 验意向专业类别（静态 92）**

点击 → 出 92 项 → 输入"金融" → 命中"金融学类" → 勾选 → 200

- [ ] **Step 7: 验意向批次（API，BatchConfig）**

点击 → loading → 出 18 个 Sichuan 2026 批次（按 admissionOrder 排序）→ 勾选"本科批A段" → 200

- [ ] **Step 8: 验**禁止自由输入****

点击意向城市 → 输入"瞎写的字" → 回车 → 不出现新标签

- [ ] **Step 9: 刷新页面，验证持久化**

F5 → 所有勾选项仍在原位

- [ ] **Step 10: 验证未引入回归**

navigate `/profile` → 仍正常跳 `/student/profile`，无 React error。
点 BasicInfoSection 的民族字段，BonusCalcCard 仍能正常计算。

- [ ] **Step 11: 提交（如有补丁）**

```bash
git status # 看有无补漏
# 如果有补漏，commit；否则跳过
```

---

## Self-Review

1. **Spec coverage**: 10 个改造字段 → P4 Task 4.1 全部覆盖；3 个数据源 hooks → P3 Task 3.3；批次 schema 改动 → P1 Task 1.3 + P2 Task 2.3；CITIES + MAJOR_SUB_CATEGORIES → P1 Task 1.1/1.2；AutoSavePicker → P3 Task 3.1。
2. **Placeholder scan**: 已检查无 TBD/TODO/"implement later"。
3. **Type consistency**: `PickerOption{label,value}` 在 AutoSavePicker.tsx 定义，所有 hooks 都从此 import 类型；`UniversityPickerOption{id,code,name}` 在 service 端和 frontend service 一致。
4. **Naming**: 端点名 `picker-options` 在 server 三个 controller + frontend pickerApi 中一致。
