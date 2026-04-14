# Enriched Data Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate unused pipeline data (health restrictions, enriched universities/majors, regional eligibility, qiangji admissions) into the recommendation engine and frontend to produce higher-quality volunteer plans.

**Architecture:** 4-layer progressive approach — L1 Schema + import → L2 Engine filters/scoring → L3 API enrichment → L4 Frontend display. Each layer depends on the previous but is independently testable. One Prisma migration covers all schema changes.

**Tech Stack:** Prisma ORM (MySQL 8.0), NestJS 10 + TypeScript, Jest, Next.js 14 + Ant Design 5 + Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-15-enriched-data-integration-design.md`

---

## File Structure

### New Files
- `apps/server/prisma/migrations/XXXXXX_enriched_data/migration.sql` — Auto-generated
- `scripts/import-data/import-enriched.ts` — Enriched data import script
- `apps/server/src/modules/health-restriction/health-restriction.module.ts`
- `apps/server/src/modules/health-restriction/health-restriction.service.ts`
- `apps/server/src/modules/health-restriction/health-restriction.controller.ts`
- `apps/server/src/modules/eligible-region/eligible-region.module.ts`
- `apps/server/src/modules/eligible-region/eligible-region.service.ts`
- `apps/server/src/modules/eligible-region/eligible-region.controller.ts`
- `apps/server/src/modules/recommend/services/health-filter.service.ts` — Health restriction filter sub-module
- `apps/server/src/modules/recommend/services/region-filter.service.ts` — Region eligibility filter sub-module
- `apps/server/src/modules/recommend/services/health-filter.service.spec.ts`
- `apps/server/src/modules/recommend/services/region-filter.service.spec.ts`
- `apps/server/src/modules/recommend/services/prospect-scorer.service.ts` — 5th dimension scorer
- `apps/server/src/modules/recommend/services/prospect-scorer.service.spec.ts`
- `apps/server/src/modules/recommend/services/career-alignment.service.ts` — Career alignment bonus
- `apps/server/src/modules/recommend/services/career-alignment.service.spec.ts`
- `apps/web/src/components/university/RankingCard.tsx`
- `apps/web/src/components/university/SatisfactionCard.tsx`
- `apps/web/src/components/university/EmploymentCard.tsx`
- `apps/web/src/components/university/QiangjiTable.tsx`
- `apps/web/src/components/major/CareerTab.tsx`
- `apps/web/src/components/plan/ProspectRow.tsx`
- `apps/web/src/components/student/HealthCheckboxGroup.tsx`
- `apps/web/src/components/student/CountyCascader.tsx`

### Modified Files
- `apps/server/prisma/schema.prisma` — 3 new models, ~26 new fields across University/Major/StudentProfile
- `apps/server/src/modules/recommend/interfaces/recommend.types.ts` — Extended types
- `apps/server/src/modules/recommend/services/candidate-filter.service.ts` — Delegate to health/region filters
- `apps/server/src/modules/recommend/services/scoring-engine.service.ts` — 5th dimension + career bonus
- `apps/server/src/modules/recommend/services/reason-generator.service.ts` — 5 new segments
- `apps/server/src/modules/recommend/services/risk-generator.service.ts` — Health risk warnings
- `apps/server/src/modules/recommend/services/plan-generator.service.ts` — Wire new sub-modules
- `apps/server/src/modules/recommend/recommend.module.ts` — Register new services
- `apps/server/src/modules/university/university.service.ts` — Return enriched fields + qiangji
- `apps/server/src/modules/major/major.service.ts` — Return enriched fields
- `apps/server/src/app.module.ts` — Register new modules
- `apps/web/src/app/(main)/universities/[id]/page.tsx` — Enriched display
- `apps/web/src/app/(main)/majors/[id]/page.tsx` — Enriched display
- `apps/web/src/components/plan/PlanItemCard.tsx` — Prospect/career/health rows
- `apps/web/src/app/(student)/student/profile/page.tsx` — Health checkboxes + county

---

## Phase 1: L1 Data Layer

### Task 1: Schema Migration — New Models & Fields

**Files:**
- Modify: `apps/server/prisma/schema.prisma`

- [ ] **Step 1: Add HealthRestriction model**

Add before the `// ==================== 系统配置 ====================` section in `schema.prisma`:

```prisma
// ==================== 体检受限 ====================

model HealthRestriction {
  id               Int     @id @default(autoincrement())
  conditionCode    String  @map("condition_code") @db.VarChar(50)
  conditionName    String  @map("condition_name") @db.Text
  restrictionType  String  @map("restriction_type") @db.VarChar(50)
  severity         String  @db.VarChar(20)
  section          String? @db.VarChar(100)
  restrictionScope String  @map("restriction_scope") @db.VarChar(20)
  majorCategory    String? @map("major_category") @db.VarChar(100)
  majorCode        String? @map("major_code") @db.VarChar(50)
  majorName        String? @map("major_name") @db.VarChar(200)

  @@index([conditionCode])
  @@index([majorCode])
  @@index([majorCategory])
  @@map("health_restrictions")
}
```

- [ ] **Step 2: Add EligibleRegion model**

```prisma
// ==================== 地区资格 ====================

model EligibleRegion {
  id           Int     @id @default(autoincrement())
  program      String  @db.VarChar(50)
  programLabel String  @map("program_label") @db.VarChar(100)
  area         String  @db.VarChar(100)
  county       String? @db.VarChar(100)
  detail       String? @db.Text

  @@index([program, area])
  @@index([program, area, county])
  @@map("eligible_regions")
}
```

- [ ] **Step 3: Add QiangjiAdmission model**

```prisma
// ==================== 强基计划 ====================

model QiangjiAdmission {
  id              Int     @id @default(autoincrement())
  school          String  @db.VarChar(200)
  major           String  @db.VarChar(200)
  subject         String? @db.VarChar(100)
  admissionMethod String? @map("admission_method") @db.VarChar(200)
  year            Int     @db.SmallInt
  entryScore      Int?    @map("entry_score")
  admitScore      Int?    @map("admit_score")
  gaokaoScore     Int?    @map("gaokao_score")
  gaokaoRank      Int?    @map("gaokao_rank")

  @@unique([school, major, year])
  @@index([school])
  @@index([year])
  @@map("qiangji_admissions")
}
```

- [ ] **Step 4: Add enriched fields to University model**

Add after the `softRanking` field (line ~205) in the University model:

```prisma
  // 人口统计
  maleRatio             Int?    @map("male_ratio")
  femaleRatio           Int?    @map("female_ratio")
  createdYear           String? @map("created_year") @db.VarChar(20)
  logoUrl               String? @map("logo_url") @db.VarChar(500)

  // A类学科数量
  aClassDisciplineCount Int?    @map("a_class_discipline_count")

  // 多维排名
  rankingAlumni         Int?    @map("ranking_alumni")
  rankingQS             Int?    @map("ranking_qs")
  rankingUSNews         Int?    @map("ranking_us_news")

  // 满意度
  satisfactionOverall   Float?  @map("satisfaction_overall")
  satisfactionLife      Float?  @map("satisfaction_life")
  satisfactionEnviron   Float?  @map("satisfaction_environ")
  satisfactionCount     Int?    @map("satisfaction_count")

  // 就业
  employmentRate        String? @map("employment_rate") @db.VarChar(50)
  furtherStudyRate      String? @map("further_study_rate") @db.VarChar(50)
  avgSalary             String? @map("avg_salary") @db.VarChar(50)
  topEmployers          String? @map("top_employers") @db.Text

  // 招生章程
  charterInfo           Json?   @map("charter_info")
```

- [ ] **Step 5: Add enriched fields to Major model**

Add after the `localDoctoralPoint` field (line ~251) in the Major model:

```prisma
  // 专业详情
  description            String? @map("major_description") @db.Text
  maleRatio              Int?    @map("male_ratio")
  femaleRatio            Int?    @map("female_ratio")
  studentScale           String? @map("student_scale") @db.VarChar(50)
  careerDirections       Json?   @map("career_directions")
  postgraduateDirections Json?   @map("postgraduate_directions")
  satisfactionScore      Float?  @map("satisfaction_score")
  coreCourses            Json?   @map("core_courses")
  degree                 String? @map("degree") @db.VarChar(100)
  standardDuration       String? @map("standard_duration") @db.VarChar(20)
```

- [ ] **Step 6: Add county field to StudentProfile**

Add after the `city` field (line ~499) in StudentProfile:

```prisma
  county            String?       @db.VarChar(100)
```

- [ ] **Step 7: Run migration**

```bash
cd apps/server && npx prisma migrate dev --name enriched_data_integration
```

Expected: Migration created, 3 new tables + ~27 new columns added.

- [ ] **Step 8: Generate Prisma Client**

```bash
pnpm db:generate
```

Expected: Prisma Client regenerated with new types.

- [ ] **Step 9: Commit**

```bash
git add apps/server/prisma/
git commit -m "feat: add enriched data schema — health restrictions, eligible regions, qiangji, university/major enrichment fields"
```

---

### Task 2: Enriched Data Import Script

**Files:**
- Create: `scripts/import-data/import-enriched.ts`

- [ ] **Step 1: Create import script skeleton**

```typescript
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const OUTPUT_DIR = path.resolve(__dirname, '../data-processing/output');

function readJson(filename: string): any[] {
  const filePath = path.join(OUTPUT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return [];
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

async function main() {
  console.log('=== Enriched Data Import ===\n');

  await importHealthRestrictions();
  await importEligibleRegions();
  await importQiangjiAdmissions();
  await enrichUniversities();
  await enrichMajors();

  console.log('\n=== Import Complete ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Implement importHealthRestrictions**

```typescript
async function importHealthRestrictions() {
  console.log('[1/5] Importing health restrictions...');
  const data = readJson('health_restrictions.json');
  if (!data.length) return;

  // Clear existing data for idempotency
  await prisma.healthRestriction.deleteMany();

  let count = 0;
  for (const item of data) {
    await prisma.healthRestriction.create({
      data: {
        conditionCode: item.conditionCode,
        conditionName: item.conditionName,
        restrictionType: item.restrictionType,
        severity: item.severity,
        section: item.section || null,
        restrictionScope: item.restrictionScope,
        majorCategory: item.majorCategory === '所有专业' ? null : item.majorCategory,
        majorCode: item.majorCode === '-' ? null : item.majorCode,
        majorName: item.majorName === '（所有本科专业）' ? null : item.majorName,
      },
    });
    count++;
  }
  console.log(`  Imported ${count} health restrictions`);
}
```

- [ ] **Step 3: Implement importEligibleRegions**

```typescript
async function importEligibleRegions() {
  console.log('[2/5] Importing eligible regions...');
  const data = readJson('eligible_regions.json');
  if (!data.length) return;

  await prisma.eligibleRegion.deleteMany();

  let count = 0;
  for (const item of data) {
    await prisma.eligibleRegion.create({
      data: {
        program: item.program,
        programLabel: item.programLabel,
        area: item.area,
        county: item.county || null,
        detail: item.detail || null,
      },
    });
    count++;
  }
  console.log(`  Imported ${count} eligible regions`);
}
```

- [ ] **Step 4: Implement importQiangjiAdmissions**

Normalize year-specific columns into rows:

```typescript
async function importQiangjiAdmissions() {
  console.log('[3/5] Importing qiangji admissions...');
  const data = readJson('qiangji_admissions.json');
  if (!data.length) return;

  await prisma.qiangjiAdmission.deleteMany();

  let count = 0;
  for (const item of data) {
    // Expand 3 years into separate rows
    for (const year of [2022, 2023, 2024]) {
      const entryScore = item[`entryScore${year}`];
      const admitScore = item[`admitScore${year}`];
      const gaokaoScore = item[`gaokaoScore${year}`];
      const gaokaoRank = item[`gaokaoRank${year}`];

      // Skip if all scores are null for this year
      if (!entryScore && !admitScore && !gaokaoScore && !gaokaoRank) continue;

      await prisma.qiangjiAdmission.upsert({
        where: {
          school_major_year: {
            school: item.school,
            major: item.major,
            year,
          },
        },
        update: { entryScore, admitScore, gaokaoScore, gaokaoRank },
        create: {
          school: item.school,
          major: item.major,
          subject: item.subject?.replace(/\n/g, '、') || null,
          admissionMethod: item.admissionMethod?.replace(/\n/g, '、') || null,
          year,
          entryScore: entryScore || null,
          admitScore: admitScore || null,
          gaokaoScore: gaokaoScore || null,
          gaokaoRank: gaokaoRank || null,
        },
      });
      count++;
    }
  }
  console.log(`  Imported ${count} qiangji admission records`);
}
```

- [ ] **Step 5: Implement enrichUniversities**

```typescript
async function enrichUniversities() {
  console.log('[4/5] Enriching universities...');
  const data = readJson('universities_enriched.json');
  if (!data.length) return;

  let updated = 0;
  let notFound = 0;

  for (const item of data) {
    // Match by enrollCode → University.code (both store 四川招生代码)
    const code = String(item.enrollCode);

    const charterInfo: Record<string, any> = {};
    if (item.charterFilingRatio) charterInfo.filingRatio = item.charterFilingRatio;
    if (item.charterMajorAllocation) charterInfo.majorAllocation = item.charterMajorAllocation;
    if (item.charterTiebreaker) charterInfo.tiebreaker = item.charterTiebreaker;
    if (item.charterLanguageReq) charterInfo.languageReq = item.charterLanguageReq;
    if (item.charterPhysicalReq) charterInfo.physicalReq = item.charterPhysicalReq;
    if (item.charterBonusPolicy) charterInfo.bonusPolicy = item.charterBonusPolicy;
    if (item.charterAdjustment) charterInfo.adjustment = item.charterAdjustment;

    try {
      await prisma.university.update({
        where: { code },
        data: {
          // Update existing fields that may have been null
          ranking: item.ranking != null ? String(item.ranking) : undefined,
          postgradRate: item.postgradRate || undefined,
          department: item.department || undefined,
          admissionGuide: item.admissionGuide || undefined,
          renameHistory: item.renameHistory || undefined,
          disciplineEvaluationLevel: item.disciplineEvaluationLevel || undefined,
          softRating: item.softRating || undefined,
          softRanking: item.softRanking ?? undefined,
          masterProgramCount: item.masterProgramCount ?? undefined,
          doctoralProgramCount: item.doctoralProgramCount ?? undefined,
          hasMasterProgram: item.hasMasterProgram ?? undefined,
          hasDoctoralProgram: item.hasDoctoralProgram ?? undefined,
          masterPrograms: item.masterPrograms
            ? item.masterPrograms.split('；')
            : undefined,
          doctoralPrograms: item.doctoralPrograms
            ? item.doctoralPrograms.split('；')
            : undefined,

          // New enriched fields
          maleRatio: item.maleRatio ?? null,
          femaleRatio: item.femaleRatio ?? null,
          createdYear: item.createdYear || null,
          logoUrl: item.logoUrl || null,
          aClassDisciplineCount: item.aClassDisciplineCount ?? null,
          rankingAlumni: item.rankingAlumni ?? null,
          rankingQS: item.rankingQS ?? null,
          rankingUSNews: item.rankingUSNews ?? null,
          satisfactionOverall: item.satisfactionOverall ?? null,
          satisfactionLife: item.satisfactionLife ?? null,
          satisfactionEnviron: item.satisfactionEnviron ?? null,
          satisfactionCount: item.satisfactionCount ?? null,
          employmentRate: item.employmentRate || null,
          furtherStudyRate: item.furtherStudyRate || null,
          avgSalary: item.avgSalary || null,
          topEmployers: item.topEmployers || null,
          charterInfo: Object.keys(charterInfo).length > 0 ? charterInfo : null,
        },
      });
      updated++;
    } catch {
      notFound++;
    }

    if ((updated + notFound) % 200 === 0) {
      process.stdout.write(`  ${updated + notFound}/${data.length}\r`);
    }
  }
  console.log(`  Updated ${updated} universities, ${notFound} not found`);
}
```

- [ ] **Step 6: Implement enrichMajors**

```typescript
async function enrichMajors() {
  console.log('[5/5] Enriching majors...');
  const data = readJson('majors_enriched.json');
  if (!data.length) return;

  let updated = 0;
  let notFound = 0;

  for (const item of data) {
    // Match by name (major codes in enriched data are category-level, not unique)
    try {
      const result = await prisma.major.updateMany({
        where: { name: item.name },
        data: {
          // Update existing fields
          softRating: item.softRating || undefined,

          // New enriched fields
          description: item.description || null,
          maleRatio: item.maleRatio ?? null,
          femaleRatio: item.femaleRatio ?? null,
          studentScale: item.studentScale || null,
          careerDirections: item.careerDirections?.length
            ? item.careerDirections
            : null,
          postgraduateDirections: item.postgraduateDirections?.length
            ? item.postgraduateDirections
            : null,
          satisfactionScore: item.satisfactionScore ?? null,
          coreCourses: item.coreCourses?.length ? item.coreCourses : null,
          degree: item.degree || null,
          standardDuration: item.standardDuration || null,
        },
      });
      if (result.count > 0) updated += result.count;
      else notFound++;
    } catch {
      notFound++;
    }
  }
  console.log(`  Updated ${updated} majors, ${notFound} not matched`);
}
```

- [ ] **Step 7: Add run script to package.json**

In root `package.json`, add to scripts:

```json
"import:enriched": "npx ts-node scripts/import-data/import-enriched.ts"
```

- [ ] **Step 8: Run import and verify**

```bash
pnpm import:enriched
```

Expected output:
```
=== Enriched Data Import ===
[1/5] Importing health restrictions...
  Imported ~700 health restrictions
[2/5] Importing eligible regions...
  Imported ~2400 eligible regions
[3/5] Importing qiangji admissions...
  Imported ~400 qiangji admission records
[4/5] Enriching universities...
  Updated ~2100 universities, ~100 not found
[5/5] Enriching majors...
  Updated ~700 majors, ~700 not matched
=== Import Complete ===
```

Verify with quick queries:
```bash
cd apps/server && npx prisma studio
```
Check: health_restrictions table has rows, universities have non-null satisfactionOverall values.

- [ ] **Step 9: Commit**

```bash
git add scripts/import-data/import-enriched.ts package.json
git commit -m "feat: add enriched data import script — health restrictions, eligible regions, qiangji, university/major enrichment"
```

---

## Phase 2: L2 Engine Layer

### Task 3: Extend Type Definitions

**Files:**
- Modify: `apps/server/src/modules/recommend/interfaces/recommend.types.ts`

- [ ] **Step 1: Extend StudentProfileSnapshot**

Add these fields after the `stayPreference` field (line ~48):

```typescript
  // Location (extended — needed for region eligibility filter)
  city?: string | null;
  county?: string | null;

  // Career (extended)
  careerDirection?: string | null;
  teacherInterest?: boolean;
  militaryInterest?: boolean;
  isRural?: boolean;
```

- [ ] **Step 2: Extend RawCandidate**

Add after the `majorHonor` field (line ~129):

```typescript
  // Enriched university data (for prospect scoring)
  universityEmploymentRate?: string | null;
  universityFurtherStudyRate?: string | null;
  universityAvgSalary?: string | null;
  universitySatisfactionOverall?: number | null;
  universityRankingAlumni?: number | null;
  universityRankingQS?: number | null;
  universityRankingUSNews?: number | null;

  // Enriched major data (for career alignment)
  majorCareerDirections?: string[] | null;
  majorPostgraduateDirections?: string[] | null;
  majorSatisfactionScore?: number | null;

  // Filter results (passed through pipeline)
  healthRisks?: string[];
  specialProgram?: string | null;
```

- [ ] **Step 3: Extend ScoreBreakdown**

Add after the `weight_t` field (line ~160):

```typescript
  // 5th dimension: prospect
  prospect: number;
  prospectRaw: number;
  prospectEmployment: number;
  prospectSalary: number;
  prospectSatisfaction: number;
  prospectConditional: number;
  prospectRanking: number;

  // Career alignment
  careerAlignmentBonus: number;
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/recommend/interfaces/recommend.types.ts
git commit -m "feat: extend recommend types for enriched data — prospect scoring, career alignment, health risks"
```

---

### Task 4: Health Restriction Filter

**Files:**
- Create: `apps/server/src/modules/recommend/services/health-filter.service.ts`
- Create: `apps/server/src/modules/recommend/services/health-filter.service.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// health-filter.service.spec.ts
import { HealthFilterService } from './health-filter.service';

describe('HealthFilterService', () => {
  let service: HealthFilterService;

  const mockRestrictions = [
    {
      id: 1,
      conditionCode: 'COLOR_BLIND',
      conditionName: '色盲',
      restrictionType: '专业受限',
      severity: 'hard',
      section: '第二部分',
      restrictionScope: '类',
      majorCategory: '化学类',
      majorCode: null,
      majorName: null,
    },
    {
      id: 2,
      conditionCode: 'COLOR_WEAK',
      conditionName: '色弱',
      restrictionType: '专业受限',
      severity: 'soft',
      section: '第二部分',
      restrictionScope: '专业',
      majorCategory: null,
      majorCode: '100201',
      majorName: '临床医学',
    },
    {
      id: 3,
      conditionCode: 'HEART_DISEASE',
      conditionName: '严重心脏病',
      restrictionType: '不予录取',
      severity: 'hard',
      section: '第一部分第1条',
      restrictionScope: '类',
      majorCategory: null, // null = all majors
      majorCode: null,
      majorName: null,
    },
  ];

  const mockPrisma = {
    healthRestriction: {
      findMany: jest.fn().mockResolvedValue(mockRestrictions),
    },
  };

  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  };

  beforeEach(() => {
    service = new HealthFilterService(mockPrisma as any, mockRedis as any);
    jest.clearAllMocks();
  });

  describe('shouldExclude', () => {
    it('should exclude candidate when student has hard restriction matching major category', async () => {
      await service.loadRestrictions();
      const result = service.checkCandidate(
        ['COLOR_BLIND'],
        { majorCategory: '化学类', majorCode: '070302' },
      );
      expect(result.excluded).toBe(true);
      expect(result.risks).toEqual([]);
    });

    it('should return soft risk without excluding for soft severity', async () => {
      await service.loadRestrictions();
      const result = service.checkCandidate(
        ['COLOR_WEAK'],
        { majorCategory: '临床医学类', majorCode: '100201' },
      );
      expect(result.excluded).toBe(false);
      expect(result.risks.length).toBeGreaterThan(0);
    });

    it('should exclude all majors for universal hard restriction', async () => {
      await service.loadRestrictions();
      const result = service.checkCandidate(
        ['HEART_DISEASE'],
        { majorCategory: '工学', majorCode: '080901' },
      );
      expect(result.excluded).toBe(true);
    });

    it('should not exclude when student has no matching conditions', async () => {
      await service.loadRestrictions();
      const result = service.checkCandidate(
        [],
        { majorCategory: '化学类', majorCode: '070302' },
      );
      expect(result.excluded).toBe(false);
      expect(result.risks).toEqual([]);
    });

    it('should map legacy colorBlind/colorWeak to condition codes', () => {
      const codes = service.mapLegacyConditions(true, false, null);
      expect(codes).toContain('COLOR_BLIND');
      expect(codes).not.toContain('COLOR_WEAK');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && npx jest health-filter --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement HealthFilterService**

```typescript
// health-filter.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import Redis from 'ioredis';

interface HealthRestrictionRule {
  conditionCode: string;
  conditionName: string;
  restrictionType: string;
  severity: string;
  restrictionScope: string;
  majorCategory: string | null;
  majorCode: string | null;
}

interface CheckResult {
  excluded: boolean;
  risks: string[];
}

@Injectable()
export class HealthFilterService {
  private readonly logger = new Logger(HealthFilterService.name);
  private restrictionMap = new Map<string, HealthRestrictionRule[]>();
  private loaded = false;

  private static readonly CACHE_KEY = 'health_restrictions:all';
  private static readonly CACHE_TTL = 86400; // 24h

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async loadRestrictions(): Promise<void> {
    if (this.loaded) return;

    // Try Redis cache first
    const cached = await this.redis.get(HealthFilterService.CACHE_KEY);
    let rules: HealthRestrictionRule[];

    if (cached) {
      rules = JSON.parse(cached);
    } else {
      const dbRules = await this.prisma.healthRestriction.findMany();
      rules = dbRules.map((r) => ({
        conditionCode: r.conditionCode,
        conditionName: r.conditionName,
        restrictionType: r.restrictionType,
        severity: r.severity,
        restrictionScope: r.restrictionScope,
        majorCategory: r.majorCategory,
        majorCode: r.majorCode,
      }));
      await this.redis.set(
        HealthFilterService.CACHE_KEY,
        JSON.stringify(rules),
        'EX',
        HealthFilterService.CACHE_TTL,
      );
    }

    // Build index by conditionCode
    this.restrictionMap.clear();
    for (const rule of rules) {
      const existing = this.restrictionMap.get(rule.conditionCode) || [];
      existing.push(rule);
      this.restrictionMap.set(rule.conditionCode, existing);
    }

    this.loaded = true;
    this.logger.debug(`Loaded ${rules.length} health restriction rules`);
  }

  /**
   * Map legacy boolean fields to condition codes.
   */
  mapLegacyConditions(
    colorBlind: boolean,
    colorWeak: boolean,
    physicalLimits: any,
  ): string[] {
    const codes: string[] = [];

    // From physicalLimits array (standard format)
    if (Array.isArray(physicalLimits)) {
      codes.push(...physicalLimits);
    }

    // Legacy boolean compat — add only if not already present
    if (colorBlind && !codes.includes('COLOR_BLIND')) {
      codes.push('COLOR_BLIND');
    }
    if (colorWeak && !codes.includes('COLOR_WEAK')) {
      codes.push('COLOR_WEAK');
    }

    return codes;
  }

  /**
   * Check a candidate against student's health conditions.
   */
  checkCandidate(
    studentConditionCodes: string[],
    candidate: { majorCategory: string | null; majorCode: string | null },
  ): CheckResult {
    if (studentConditionCodes.length === 0) {
      return { excluded: false, risks: [] };
    }

    const risks: string[] = [];

    for (const code of studentConditionCodes) {
      const rules = this.restrictionMap.get(code);
      if (!rules) continue;

      for (const rule of rules) {
        const matches = this.ruleMatchesCandidate(rule, candidate);
        if (!matches) continue;

        if (rule.severity === 'hard') {
          return { excluded: true, risks: [] };
        }

        // soft: add risk warning
        risks.push(
          `该专业对${rule.conditionName}有限制要求，建议确认体检标准后填报`,
        );
      }
    }

    return { excluded: false, risks };
  }

  private ruleMatchesCandidate(
    rule: HealthRestrictionRule,
    candidate: { majorCategory: string | null; majorCode: string | null },
  ): boolean {
    // Universal restriction (majorCategory is null = all majors)
    if (!rule.majorCategory && !rule.majorCode) return true;

    // Category-level match
    if (
      rule.restrictionScope === '类' &&
      rule.majorCategory &&
      candidate.majorCategory
    ) {
      return candidate.majorCategory.includes(rule.majorCategory);
    }

    // Major-level match
    if (rule.restrictionScope === '专业' && rule.majorCode) {
      return candidate.majorCode === rule.majorCode;
    }

    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/server && npx jest health-filter --no-coverage
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/recommend/services/health-filter.service.ts apps/server/src/modules/recommend/services/health-filter.service.spec.ts
git commit -m "feat: add health restriction filter with condition-code-based matching"
```

---

### Task 5: Region Eligibility Filter

**Files:**
- Create: `apps/server/src/modules/recommend/services/region-filter.service.ts`
- Create: `apps/server/src/modules/recommend/services/region-filter.service.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// region-filter.service.spec.ts
import { RegionFilterService } from './region-filter.service';

describe('RegionFilterService', () => {
  let service: RegionFilterService;

  const mockRegions = [
    { id: 1, program: 'PROVINCIAL_FREE_TEACHER', programLabel: '省级公费师范生', area: '成都市', county: '邛崃市', detail: null },
    { id: 2, program: 'PROVINCIAL_FREE_TEACHER', programLabel: '省级公费师范生', area: '成都市', county: '金堂县', detail: null },
    { id: 3, program: 'NATIONAL_SPECIAL_PLAN', programLabel: '国家专项计划', area: '凉山州', county: '昭觉县', detail: null },
  ];

  const mockPrisma = {
    eligibleRegion: { findMany: jest.fn().mockResolvedValue(mockRegions) },
  };
  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  };

  beforeEach(() => {
    service = new RegionFilterService(mockPrisma as any, mockRedis as any);
    jest.clearAllMocks();
  });

  describe('isEligible', () => {
    it('should return eligible when student county matches', async () => {
      await service.loadRegions();
      const result = service.isEligible('PROVINCIAL_FREE_TEACHER', {
        city: '成都市',
        county: '邛崃市',
      });
      expect(result.eligible).toBe(true);
    });

    it('should return ineligible when county does not match', async () => {
      await service.loadRegions();
      const result = service.isEligible('PROVINCIAL_FREE_TEACHER', {
        city: '成都市',
        county: '武侯区',
      });
      expect(result.eligible).toBe(false);
    });

    it('should fallback to city-level match when county is missing', async () => {
      await service.loadRegions();
      const result = service.isEligible('PROVINCIAL_FREE_TEACHER', {
        city: '成都市',
        county: null,
      });
      expect(result.eligible).toBe(true);
      expect(result.warning).toContain('区县');
    });

    it('should return ineligible when city does not match at all', async () => {
      await service.loadRegions();
      const result = service.isEligible('NATIONAL_SPECIAL_PLAN', {
        city: '成都市',
        county: null,
      });
      expect(result.eligible).toBe(false);
    });
  });

  describe('detectSpecialProgram', () => {
    it('should detect free teacher program from batch text', () => {
      expect(service.detectSpecialProgram('本科提前批公费师范', null))
        .toContain('FREE_TEACHER');
    });

    it('should detect national special plan', () => {
      expect(service.detectSpecialProgram('国家专项计划', null))
        .toContain('NATIONAL_SPECIAL_PLAN');
    });

    it('should return null for regular batch', () => {
      expect(service.detectSpecialProgram('本科一批', null)).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && npx jest region-filter --no-coverage
```

Expected: FAIL.

- [ ] **Step 3: Implement RegionFilterService**

```typescript
// region-filter.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import Redis from 'ioredis';

interface EligibilityResult {
  eligible: boolean;
  warning?: string;
}

interface RegionRecord {
  program: string;
  area: string;
  county: string | null;
}

@Injectable()
export class RegionFilterService {
  private readonly logger = new Logger(RegionFilterService.name);
  // program → Map<area, Set<county>>
  private regionIndex = new Map<string, Map<string, Set<string>>>();
  private loaded = false;

  private static readonly CACHE_KEY = 'eligible_regions:all';
  private static readonly CACHE_TTL = 86400;

  private static readonly PROGRAM_KEYWORDS: [string, string][] = [
    ['公费师范', 'FREE_TEACHER'],
    ['免费师范', 'FREE_TEACHER'],
    ['国家专项', 'NATIONAL_SPECIAL_PLAN'],
    ['地方专项', 'RURAL_REVITALIZATION'],
    ['深度贫困', 'DEEP_POVERTY'],
    ['民族地区', 'ETHNIC_BORDER_REGION'],
  ];

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async loadRegions(): Promise<void> {
    if (this.loaded) return;

    const cached = await this.redis.get(RegionFilterService.CACHE_KEY);
    let records: RegionRecord[];

    if (cached) {
      records = JSON.parse(cached);
    } else {
      const dbRecords = await this.prisma.eligibleRegion.findMany({
        select: { program: true, area: true, county: true },
      });
      records = dbRecords;
      await this.redis.set(
        RegionFilterService.CACHE_KEY,
        JSON.stringify(records),
        'EX',
        RegionFilterService.CACHE_TTL,
      );
    }

    this.regionIndex.clear();
    for (const r of records) {
      if (!this.regionIndex.has(r.program)) {
        this.regionIndex.set(r.program, new Map());
      }
      const areaMap = this.regionIndex.get(r.program)!;
      if (!areaMap.has(r.area)) {
        areaMap.set(r.area, new Set());
      }
      if (r.county) {
        areaMap.get(r.area)!.add(r.county);
      }
    }

    this.loaded = true;
    this.logger.debug(`Loaded ${records.length} eligible region records`);
  }

  detectSpecialProgram(batch: string | null, planNotes: string | null): string | null {
    const text = `${batch || ''} ${planNotes || ''}`;
    for (const [keyword, program] of RegionFilterService.PROGRAM_KEYWORDS) {
      if (text.includes(keyword)) {
        // Map FREE_TEACHER to both provincial and national variants
        if (program === 'FREE_TEACHER') {
          if (text.includes('省级') || text.includes('省属')) return 'PROVINCIAL_FREE_TEACHER';
          if (text.includes('部属') || text.includes('国家级')) return 'NATIONAL_FREE_TEACHER';
          return 'PROVINCIAL_FREE_TEACHER'; // default
        }
        return program;
      }
    }
    return null;
  }

  isEligible(
    program: string,
    student: { city: string | null; county: string | null },
  ): EligibilityResult {
    const areaMap = this.regionIndex.get(program);
    if (!areaMap) return { eligible: false };

    if (!student.city) return { eligible: false };

    const counties = areaMap.get(student.city);
    if (!counties) return { eligible: false };

    // If student has county, do precise match
    if (student.county) {
      return { eligible: counties.has(student.county) };
    }

    // No county: city-level fallback (permissive + warning)
    return {
      eligible: true,
      warning: '建议完善区县信息以精确匹配专项计划资格',
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/server && npx jest region-filter --no-coverage
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/recommend/services/region-filter.service.ts apps/server/src/modules/recommend/services/region-filter.service.spec.ts
git commit -m "feat: add region eligibility filter with county-level matching and keyword detection"
```

---

### Task 6: Prospect Scoring — 5th Dimension

**Files:**
- Create: `apps/server/src/modules/recommend/services/prospect-scorer.service.ts`
- Create: `apps/server/src/modules/recommend/services/prospect-scorer.service.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// prospect-scorer.service.spec.ts
import { ProspectScorerService } from './prospect-scorer.service';
import { RawCandidate, StudentProfileSnapshot } from '../interfaces/recommend.types';

describe('ProspectScorerService', () => {
  let service: ProspectScorerService;

  function makeCandidate(overrides: Partial<RawCandidate> = {}): RawCandidate {
    return {
      admissionRecordId: 1, universityId: 1, majorId: 1, year: 2025,
      province: '四川', majorMinRank: 30000, majorMinScore: 580,
      majorAvgRank: null, majorAdmissionCount: null, groupMinRank: null,
      groupCode: null, universityName: '测试大学', is985: false, is211: false,
      isDoubleFirstClass: false, runningNature: '公办', majorName: '测试专业',
      isSinoForeign: false, isNationalFeature: false, planCount: 10,
      universityEmploymentRate: '92%',
      universityFurtherStudyRate: '55%',
      universityAvgSalary: null,
      universitySatisfactionOverall: 4.2,
      universityRankingQS: 80,
      universityRankingAlumni: null,
      universityRankingUSNews: null,
      majorSatisfactionScore: 4.0,
      ...overrides,
    } as RawCandidate;
  }

  beforeEach(() => {
    service = new ProspectScorerService();
  });

  it('should score employment rate: 92% -> 3', () => {
    const c = makeCandidate({ universityEmploymentRate: '92%' });
    const result = service.score(c, 'UNDECIDED');
    expect(result.prospectEmployment).toBe(3);
  });

  it('should give neutral score 1.5 for missing employment data', () => {
    const c = makeCandidate({ universityEmploymentRate: null });
    const result = service.score(c, 'UNDECIDED');
    expect(result.prospectEmployment).toBe(1.5);
  });

  it('should score QS ranking 80 -> 2 (Top100)', () => {
    const c = makeCandidate({ universityRankingQS: 80 });
    const result = service.score(c, 'UNDECIDED');
    expect(result.prospectRanking).toBe(2);
  });

  it('should boost furtherStudyScore for POSTGRADUATE students', () => {
    const c = makeCandidate({ universityFurtherStudyRate: '55%' });
    const postgrad = service.score(c, 'POSTGRADUATE');
    const undecided = service.score(c, 'UNDECIDED');
    expect(postgrad.prospectConditional).toBeGreaterThan(undecided.prospectConditional);
  });

  it('should calculate weighted satisfaction from university + major', () => {
    const c = makeCandidate({
      universitySatisfactionOverall: 4.5,
      majorSatisfactionScore: 3.8,
    });
    const result = service.score(c, 'UNDECIDED');
    // weighted: 4.5*0.4 + 3.8*0.6 = 1.8 + 2.28 = 4.08 -> >=4.0 -> 3
    expect(result.prospectSatisfaction).toBe(3);
  });

  it('should return prospectRaw as sum of all sub-factors', () => {
    const c = makeCandidate();
    const result = service.score(c, 'UNDECIDED');
    expect(result.prospectRaw).toBeCloseTo(
      result.prospectEmployment +
      result.prospectSalary +
      result.prospectSatisfaction +
      result.prospectConditional +
      result.prospectRanking,
      2,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && npx jest prospect-scorer --no-coverage
```

- [ ] **Step 3: Implement ProspectScorerService**

```typescript
// prospect-scorer.service.ts
import { Injectable } from '@nestjs/common';
import { RawCandidate } from '../interfaces/recommend.types';

export interface ProspectScore {
  prospectRaw: number;
  prospectEmployment: number;
  prospectSalary: number;
  prospectSatisfaction: number;
  prospectConditional: number;
  prospectRanking: number;
}

@Injectable()
export class ProspectScorerService {
  private static readonly NEUTRAL = 1.5;

  score(candidate: RawCandidate, careerPlan: string | null | undefined): ProspectScore {
    const employment = this.scoreEmployment(candidate.universityEmploymentRate);
    const salary = this.scoreSalary(candidate.universityAvgSalary);
    const satisfaction = this.scoreSatisfaction(
      candidate.universitySatisfactionOverall,
      candidate.majorSatisfactionScore,
    );
    const conditional = this.scoreConditional(candidate, careerPlan);
    const ranking = this.scoreRanking(candidate);

    return {
      prospectRaw: employment + salary + satisfaction + conditional + ranking,
      prospectEmployment: employment,
      prospectSalary: salary,
      prospectSatisfaction: satisfaction,
      prospectConditional: conditional,
      prospectRanking: ranking,
    };
  }

  private scoreEmployment(rate: string | null | undefined): number {
    if (!rate) return ProspectScorerService.NEUTRAL;
    const val = parseFloat(rate);
    if (isNaN(val)) return ProspectScorerService.NEUTRAL;
    if (val >= 90) return 3;
    if (val >= 80) return 2;
    if (val >= 70) return 1;
    return 0.5;
  }

  private scoreSalary(salary: string | null | undefined): number {
    if (!salary) return ProspectScorerService.NEUTRAL;
    const val = parseFloat(salary.replace(/[^\d.]/g, ''));
    if (isNaN(val)) return ProspectScorerService.NEUTRAL;
    // Quartile-based: rough thresholds for Chinese graduate salaries
    if (val >= 10000) return 3;
    if (val >= 7000) return 2;
    if (val >= 5000) return 1;
    return 0.5;
  }

  private scoreSatisfaction(
    uniSat: number | null | undefined,
    majorSat: number | null | undefined,
  ): number {
    const uniVal = uniSat ?? null;
    const majorVal = majorSat ?? null;

    let weighted: number;
    if (uniVal !== null && majorVal !== null) {
      weighted = uniVal * 0.4 + majorVal * 0.6;
    } else if (uniVal !== null) {
      weighted = uniVal;
    } else if (majorVal !== null) {
      weighted = majorVal;
    } else {
      return ProspectScorerService.NEUTRAL;
    }

    if (weighted >= 4.0) return 3;
    if (weighted >= 3.5) return 2;
    if (weighted >= 3.0) return 1;
    return 0.5;
  }

  private scoreConditional(
    candidate: RawCandidate,
    careerPlan: string | null | undefined,
  ): number {
    switch (careerPlan) {
      case 'POSTGRADUATE':
        return this.scoreFurtherStudy(candidate.universityFurtherStudyRate);
      case 'EMPLOYMENT':
        // Double employment weight: use employment score again
        return this.scoreEmployment(candidate.universityEmploymentRate);
      case 'ABROAD':
        // Double ranking weight: use ranking score again
        return this.scoreRanking(candidate);
      default:
        // Undecided: half-weight furtherStudy
        return this.scoreFurtherStudy(candidate.universityFurtherStudyRate) * 0.5;
    }
  }

  private scoreFurtherStudy(rate: string | null | undefined): number {
    if (!rate) return ProspectScorerService.NEUTRAL;
    const val = parseFloat(rate);
    if (isNaN(val)) return ProspectScorerService.NEUTRAL;
    if (val >= 50) return 3;
    if (val >= 30) return 2;
    if (val >= 15) return 1;
    return 0.5;
  }

  private scoreRanking(candidate: RawCandidate): number {
    const rankings = [
      candidate.universityRankingQS,
      candidate.universityRankingUSNews,
      candidate.universityRankingAlumni,
      candidate.softRanking,
    ].filter((r): r is number => r != null && r > 0);

    if (rankings.length === 0) return 0;
    const best = Math.min(...rankings);
    if (best <= 50) return 3;
    if (best <= 100) return 2;
    if (best <= 200) return 1;
    return 0;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/server && npx jest prospect-scorer --no-coverage
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/recommend/services/prospect-scorer.service.ts apps/server/src/modules/recommend/services/prospect-scorer.service.spec.ts
git commit -m "feat: add prospect scorer — 5th dimension with employment, salary, satisfaction, conditional, ranking"
```

---

### Task 7: Career Alignment Bonus

**Files:**
- Create: `apps/server/src/modules/recommend/services/career-alignment.service.ts`
- Create: `apps/server/src/modules/recommend/services/career-alignment.service.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// career-alignment.service.spec.ts
import { CareerAlignmentService } from './career-alignment.service';

describe('CareerAlignmentService', () => {
  let service: CareerAlignmentService;

  beforeEach(() => {
    service = new CareerAlignmentService();
  });

  it('should give 3.0 bonus for strong match (≥3 keyword matches)', () => {
    const bonus = service.calcBonus(
      {
        careerDirection: '环保工程师、水处理、环境监测',
        careerPlan: 'EMPLOYMENT',
        teacherInterest: false,
        militaryInterest: false,
      },
      {
        careerDirections: ['环保技术工程师', '水处理工程师', '环境监测工程师', '公务员'],
        postgraduateDirections: ['环境科学'],
        majorCategory: '工学',
        batch: '本科一批',
      },
    );
    expect(bonus).toBe(3.0);
  });

  it('should give 1.5 bonus for weak match (1-2 matches)', () => {
    const bonus = service.calcBonus(
      {
        careerDirection: '金融分析',
        careerPlan: 'EMPLOYMENT',
        teacherInterest: false,
        militaryInterest: false,
      },
      {
        careerDirections: ['金融分析师', '银行职员', '会计'],
        postgraduateDirections: null,
        majorCategory: '经济学',
        batch: '本科一批',
      },
    );
    expect(bonus).toBe(1.5);
  });

  it('should give 0 bonus when no career direction set', () => {
    const bonus = service.calcBonus(
      { careerDirection: null, careerPlan: null, teacherInterest: false, militaryInterest: false },
      { careerDirections: ['工程师'], postgraduateDirections: null, majorCategory: '工学', batch: '本科一批' },
    );
    expect(bonus).toBe(0);
  });

  it('should add 1.0 for postgraduate plan with postgraduate directions', () => {
    const bonus = service.calcBonus(
      { careerDirection: null, careerPlan: 'POSTGRADUATE', teacherInterest: false, militaryInterest: false },
      { careerDirections: null, postgraduateDirections: ['生态学', '环境工程'], majorCategory: '工学', batch: '本科一批' },
    );
    expect(bonus).toBe(1.0);
  });

  it('should add 1.5 for teacher interest + education major', () => {
    const bonus = service.calcBonus(
      { careerDirection: null, careerPlan: null, teacherInterest: true, militaryInterest: false },
      { careerDirections: null, postgraduateDirections: null, majorCategory: '教育学', batch: '本科一批' },
    );
    expect(bonus).toBe(1.5);
  });
});
```

- [ ] **Step 2: Run test, verify fail, implement, verify pass**

```typescript
// career-alignment.service.ts
import { Injectable } from '@nestjs/common';

interface StudentCareer {
  careerDirection: string | null | undefined;
  careerPlan: string | null | undefined;
  teacherInterest: boolean;
  militaryInterest: boolean;
}

interface CandidateCareer {
  careerDirections: string[] | null | undefined;
  postgraduateDirections: string[] | null | undefined;
  majorCategory: string | null | undefined;
  batch: string | null | undefined;
}

@Injectable()
export class CareerAlignmentService {
  // Chinese tokenizer: split by common delimiters
  private static readonly DELIMITERS = /[，,、；;/\s]+/;

  calcBonus(student: StudentCareer, candidate: CandidateCareer): number {
    let bonus = 0;

    // Career direction keyword matching
    if (student.careerDirection && candidate.careerDirections?.length) {
      const studentTokens = student.careerDirection
        .split(CareerAlignmentService.DELIMITERS)
        .filter((t) => t.length >= 2); // skip single chars

      let matchCount = 0;
      for (const token of studentTokens) {
        for (const direction of candidate.careerDirections) {
          if (direction.includes(token) || token.includes(direction)) {
            matchCount++;
            break;
          }
        }
      }

      if (matchCount >= 3) bonus += 3.0;
      else if (matchCount >= 1) bonus += 1.5;
    }

    // Postgraduate plan bonus
    if (
      student.careerPlan === 'POSTGRADUATE' &&
      candidate.postgraduateDirections?.length
    ) {
      bonus += 1.0;
    }

    // Teacher interest bonus
    if (
      student.teacherInterest &&
      candidate.majorCategory?.includes('教育')
    ) {
      bonus += 1.5;
    }

    // Military interest bonus
    if (
      student.militaryInterest &&
      candidate.batch &&
      (candidate.batch.includes('军事') || candidate.batch.includes('军校'))
    ) {
      bonus += 1.5;
    }

    return bonus;
  }
}
```

- [ ] **Step 3: Run tests**

```bash
cd apps/server && npx jest career-alignment --no-coverage
```

Expected: All 5 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/recommend/services/career-alignment.service.ts apps/server/src/modules/recommend/services/career-alignment.service.spec.ts
git commit -m "feat: add career alignment bonus — keyword matching, postgrad, teacher/military interest"
```

---

### Task 8: Wire New Services Into Engine Pipeline

**Files:**
- Modify: `apps/server/src/modules/recommend/services/scoring-engine.service.ts`
- Modify: `apps/server/src/modules/recommend/services/candidate-filter.service.ts`
- Modify: `apps/server/src/modules/recommend/services/reason-generator.service.ts`
- Modify: `apps/server/src/modules/recommend/services/risk-generator.service.ts`
- Modify: `apps/server/src/modules/recommend/services/plan-generator.service.ts`
- Modify: `apps/server/src/modules/recommend/recommend.module.ts`

- [ ] **Step 1: Update candidate-filter to pass enriched data and delegate to health/region filters**

In `candidate-filter.service.ts`, add to constructor:

```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly healthFilter: HealthFilterService,
  private readonly regionFilter: RegionFilterService,
) {}
```

Add import:
```typescript
import { HealthFilterService } from './health-filter.service';
import { RegionFilterService } from './region-filter.service';
```

At the start of `filter()` method, add initialization:
```typescript
await this.healthFilter.loadRestrictions();
await this.regionFilter.loadRegions();
const studentConditions = this.healthFilter.mapLegacyConditions(
  student.colorBlind, student.colorWeak, student.physicalLimits,
);
```

Replace the `hasPhysicalRestriction` call in the filter loop with:
```typescript
// Health restriction filter (replaces old hasPhysicalRestriction)
const healthCheck = this.healthFilter.checkCandidate(studentConditions, {
  majorCategory: major.category,
  majorCode: major.code,
});
if (healthCheck.excluded) continue;

// Region eligibility filter
const specialProgram = this.regionFilter.detectSpecialProgram(
  record.batch, ep?.planNotes,
);
if (specialProgram) {
  const eligibility = this.regionFilter.isEligible(specialProgram, {
    city: student.city || null, // student's home city (from StudentProfile)
    county: student.county || null,
  });
  if (!eligibility.eligible) continue;
}
```

In `buildCandidate`, add the enriched fields and health risks:
```typescript
// Add to the return object:
universityEmploymentRate: uni.employmentRate ?? null,
universityFurtherStudyRate: uni.furtherStudyRate ?? null,
universityAvgSalary: uni.avgSalary ?? null,
universitySatisfactionOverall: uni.satisfactionOverall ?? null,
universityRankingAlumni: uni.rankingAlumni ?? null,
universityRankingQS: uni.rankingQS ?? null,
universityRankingUSNews: uni.rankingUSNews ?? null,
majorCareerDirections: major.careerDirections ?? null,
majorPostgraduateDirections: major.postgraduateDirections ?? null,
majorSatisfactionScore: major.satisfactionScore ?? null,
healthRisks: healthCheck.risks,
specialProgram: specialProgram,
```

Note: The `healthCheck` variable needs to be accessible in `buildCandidate`. Refactor by passing it as a parameter.

- [ ] **Step 2: Update scoring-engine to include 5th dimension**

In `scoring-engine.service.ts`, add constructor injection:

```typescript
constructor(
  private readonly prospectScorer: ProspectScorerService,
  private readonly careerAlignment: CareerAlignmentService,
) {}
```

In `scoreCandidate`, after the existing 4 dimension calculations (after line ~53), add:

```typescript
// ---- 5th Dimension: Prospect ----
const prospect = this.prospectScorer.score(candidate, student.careerPlan);

// ---- Career alignment bonus ----
const careerBonus = this.careerAlignment.calcBonus(
  {
    careerDirection: student.careerDirection,
    careerPlan: student.careerPlan,
    teacherInterest: student.teacherInterest ?? false,
    militaryInterest: student.militaryInterest ?? false,
  },
  {
    careerDirections: candidate.majorCareerDirections,
    postgraduateDirections: candidate.majorPostgraduateDirections,
    majorCategory: candidate.majorCategory,
    batch: candidate.batch,
  },
);
```

Add prospect weight after existing weight calculations:
```typescript
// Prospect weight: low when rushing, high when safe
let prospectWeight: number;
if (mode === 'MAJOR_FIRST') {
  prospectWeight = this.W(t, 1.5, 2.5);
} else if (mode === 'CITY_FIRST' || mode === 'BALANCED') {
  prospectWeight = this.W(t, 1.0, 2.0);
} else {
  prospectWeight = this.W(t, 1.0, 2.5);
}
```

Update rawTotal calculation:
```typescript
const rawTotal =
  tierRaw * tierWeight +
  natureRaw * natureWeight +
  majorRaw * majorWeight +
  otherRaw * otherWeight +
  prospect.prospectRaw * prospectWeight +
  bonus + careerBonus;
```

Update ScoreBreakdown to include new fields:
```typescript
const breakdown: ScoreBreakdown = {
  ...existingFields,
  prospect: prospect.prospectRaw * prospectWeight,
  prospectRaw: prospect.prospectRaw,
  prospectEmployment: prospect.prospectEmployment,
  prospectSalary: prospect.prospectSalary,
  prospectSatisfaction: prospect.prospectSatisfaction,
  prospectConditional: prospect.prospectConditional,
  prospectRanking: prospect.prospectRanking,
  careerAlignmentBonus: careerBonus,
};
```

- [ ] **Step 3: Update reason-generator with 5 new segments**

In `reason-generator.service.ts`, add after segment 9 (line ~107, before the return):

```typescript
// 10. Employment rate
if (candidate.universityEmploymentRate) {
  const rate = parseFloat(candidate.universityEmploymentRate);
  if (!isNaN(rate) && rate >= 85) {
    segments.push(`就业率${rate.toFixed(0)}%`);
  }
}

// 11. Further study rate (for postgrad students)
if (
  student.careerPlan === 'POSTGRADUATE' &&
  candidate.universityFurtherStudyRate
) {
  const rate = parseFloat(candidate.universityFurtherStudyRate);
  if (!isNaN(rate) && rate >= 40) {
    segments.push(`深造率${rate.toFixed(0)}%`);
  }
}

// 12. Satisfaction
if (candidate.universitySatisfactionOverall && candidate.universitySatisfactionOverall >= 4.0) {
  segments.push(`满意度${candidate.universitySatisfactionOverall.toFixed(1)}`);
}

// 13. Career match
if (candidate.scoreBreakdown?.careerAlignmentBonus > 0) {
  segments.push('匹配职业方向');
}

// 14. Special program eligibility
if (candidate.specialProgram) {
  segments.push('符合专项计划资格');
}
```

- [ ] **Step 4: Update risk-generator with health warnings**

In `risk-generator.service.ts`, add after the stability risk section (line ~55):

```typescript
// 7. Health restriction warnings
if (candidate.healthRisks?.length) {
  for (const risk of candidate.healthRisks) {
    warnings.push(risk);
  }
}
```

- [ ] **Step 5: Update recommend.module.ts**

Add the 4 new services to providers and imports:

```typescript
import { HealthFilterService } from './services/health-filter.service';
import { RegionFilterService } from './services/region-filter.service';
import { ProspectScorerService } from './services/prospect-scorer.service';
import { CareerAlignmentService } from './services/career-alignment.service';

// In providers array, add:
HealthFilterService,
RegionFilterService,
ProspectScorerService,
CareerAlignmentService,
```

- [ ] **Step 6: Update plan-generator to pass new fields to student snapshot**

In `plan-generator.service.ts`, in the `loadStudentProfile` method, add the new fields to the snapshot:

```typescript
city: profile.city,
county: profile.county,
careerDirection: profile.careerDirection,
teacherInterest: profile.teacherInterest,
militaryInterest: profile.militaryInterest,
isRural: profile.isRural,
```

- [ ] **Step 7: Run all existing tests to verify no regressions**

```bash
cd apps/server && npx jest --no-coverage
```

Expected: All existing tests pass (some may need updated makeCandidate/makeStudent helpers for new required fields).

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/modules/recommend/
git commit -m "feat: wire enriched data into engine — health filter, region filter, 5th dimension prospect scoring, career alignment, enhanced reasons/risks"
```

---

## Phase 3: L3 API Layer

### Task 9: New API Endpoints — Health Restrictions & Eligible Regions

**Files:**
- Create: `apps/server/src/modules/health-restriction/health-restriction.module.ts`
- Create: `apps/server/src/modules/health-restriction/health-restriction.service.ts`
- Create: `apps/server/src/modules/health-restriction/health-restriction.controller.ts`
- Create: `apps/server/src/modules/eligible-region/eligible-region.module.ts`
- Create: `apps/server/src/modules/eligible-region/eligible-region.service.ts`
- Create: `apps/server/src/modules/eligible-region/eligible-region.controller.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: Create HealthRestriction module**

```typescript
// health-restriction.module.ts
import { Module } from '@nestjs/common';
import { HealthRestrictionService } from './health-restriction.service';
import { HealthRestrictionController } from './health-restriction.controller';

@Module({
  controllers: [HealthRestrictionController],
  providers: [HealthRestrictionService],
  exports: [HealthRestrictionService],
})
export class HealthRestrictionModule {}
```

```typescript
// health-restriction.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HealthRestrictionService {
  constructor(private readonly prisma: PrismaService) {}

  async getConditionList() {
    const all = await this.prisma.healthRestriction.findMany();
    // Deduplicate by conditionCode, returning unique conditions
    const seen = new Map<string, { conditionCode: string; conditionName: string; severity: string }>();
    for (const r of all) {
      if (!seen.has(r.conditionCode)) {
        seen.set(r.conditionCode, {
          conditionCode: r.conditionCode,
          conditionName: r.conditionName,
          severity: r.severity,
        });
      }
    }
    return [...seen.values()];
  }
}
```

```typescript
// health-restriction.controller.ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { HealthRestrictionService } from './health-restriction.service';

@ApiTags('Health Restrictions')
@Controller('health-restrictions')
export class HealthRestrictionController {
  constructor(private readonly service: HealthRestrictionService) {}

  @Get()
  @ApiOperation({ summary: 'Get all health condition types for student selection' })
  async getConditions() {
    return this.service.getConditionList();
  }
}
```

- [ ] **Step 2: Create EligibleRegion module**

```typescript
// eligible-region.module.ts
import { Module } from '@nestjs/common';
import { EligibleRegionService } from './eligible-region.service';
import { EligibleRegionController } from './eligible-region.controller';

@Module({
  controllers: [EligibleRegionController],
  providers: [EligibleRegionService],
  exports: [EligibleRegionService],
})
export class EligibleRegionModule {}
```

```typescript
// eligible-region.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EligibleRegionService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProgram(program: string) {
    return this.prisma.eligibleRegion.findMany({
      where: { program },
      orderBy: [{ area: 'asc' }, { county: 'asc' }],
    });
  }

  async getPrograms() {
    const results = await this.prisma.eligibleRegion.findMany({
      select: { program: true, programLabel: true },
      distinct: ['program'],
    });
    return results;
  }
}
```

```typescript
// eligible-region.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { EligibleRegionService } from './eligible-region.service';

@ApiTags('Eligible Regions')
@Controller('eligible-regions')
export class EligibleRegionController {
  constructor(private readonly service: EligibleRegionService) {}

  @Get()
  @ApiOperation({ summary: 'Get eligible regions by program type' })
  @ApiQuery({ name: 'program', required: false })
  async findAll(@Query('program') program?: string) {
    if (program) return this.service.findByProgram(program);
    return this.service.getPrograms();
  }
}
```

- [ ] **Step 3: Register modules in app.module.ts**

```typescript
import { HealthRestrictionModule } from './modules/health-restriction/health-restriction.module';
import { EligibleRegionModule } from './modules/eligible-region/eligible-region.module';

// Add to imports array:
HealthRestrictionModule,
EligibleRegionModule,
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/health-restriction/ apps/server/src/modules/eligible-region/ apps/server/src/app.module.ts
git commit -m "feat: add health-restriction and eligible-region API endpoints"
```

---

### Task 10: Enrich University & Major API Responses

**Files:**
- Modify: `apps/server/src/modules/university/university.service.ts`
- Modify: `apps/server/src/modules/major/major.service.ts`

- [ ] **Step 1: Update university findById to return enriched fields + qiangji**

In `university.service.ts`, update the `findById` method to include all new fields in the select (Prisma by default returns all scalar fields, so this should work automatically).

After fetching the university, add qiangji query:

```typescript
// In findById, after fetching the university:
const qiangjiAdmissions = await this.prisma.qiangjiAdmission.findMany({
  where: { school: university.name },
  orderBy: [{ major: 'asc' }, { year: 'desc' }],
});

return { ...university, qiangjiAdmissions };
```

- [ ] **Step 2: Verify major.findById returns enriched fields**

Since Prisma returns all scalar fields by default and we added the new columns, the existing `findById` in `major.service.ts` should already return the enriched fields. Verify by checking the Prisma select configuration. If there's an explicit `select`, add the new fields.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/university/ apps/server/src/modules/major/
git commit -m "feat: enrich university API with rankings, satisfaction, employment, qiangji data"
```

---

## Phase 4: L4 Frontend

### Task 11: University Detail Page Enhancement

**Files:**
- Create: `apps/web/src/components/university/RankingCard.tsx`
- Create: `apps/web/src/components/university/SatisfactionCard.tsx`
- Create: `apps/web/src/components/university/EmploymentCard.tsx`
- Create: `apps/web/src/components/university/QiangjiTable.tsx`
- Modify: `apps/web/src/app/(main)/universities/[id]/page.tsx`

- [ ] **Step 1: Create RankingCard component**

```tsx
// RankingCard.tsx
'use client';
import { Card, Statistic, Row, Col } from 'antd';

interface Props {
  rankingSoft?: number | null;
  rankingAlumni?: number | null;
  rankingQS?: number | null;
  rankingUSNews?: number | null;
  aClassDisciplineCount?: number | null;
}

export default function RankingCard(props: Props) {
  const { rankingSoft, rankingAlumni, rankingQS, rankingUSNews, aClassDisciplineCount } = props;
  const hasData = rankingSoft || rankingAlumni || rankingQS || rankingUSNews || aClassDisciplineCount;
  if (!hasData) return null;

  return (
    <Card title="院校排名" size="small" className="mb-4">
      <Row gutter={16}>
        {rankingSoft != null && (
          <Col span={4}><Statistic title="软科" value={rankingSoft} prefix="#" /></Col>
        )}
        {rankingAlumni != null && (
          <Col span={4}><Statistic title="校友会" value={rankingAlumni} prefix="#" /></Col>
        )}
        {rankingQS != null && (
          <Col span={4}><Statistic title="QS" value={rankingQS} prefix="#" /></Col>
        )}
        {rankingUSNews != null && (
          <Col span={4}><Statistic title="USNews" value={rankingUSNews} prefix="#" /></Col>
        )}
        {aClassDisciplineCount != null && (
          <Col span={4}><Statistic title="A类学科" value={aClassDisciplineCount} suffix="个" /></Col>
        )}
      </Row>
    </Card>
  );
}
```

- [ ] **Step 2: Create SatisfactionCard component**

```tsx
// SatisfactionCard.tsx
'use client';
import { Card, Progress, Typography } from 'antd';

const { Text } = Typography;

interface Props {
  overall?: number | null;
  life?: number | null;
  environ?: number | null;
  count?: number | null;
}

export default function SatisfactionCard({ overall, life, environ, count }: Props) {
  if (!overall && !life && !environ) return null;

  const items = [
    { label: '综合', value: overall },
    { label: '生活', value: life },
    { label: '环境', value: environ },
  ].filter((i) => i.value != null);

  return (
    <Card title={`在校生评价${count ? ` (${count}人参与)` : ''}`} size="small" className="mb-4">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3 mb-2">
          <Text className="w-10">{item.label}</Text>
          <Text className="w-12">{item.value!.toFixed(1)}/5</Text>
          <Progress
            percent={Math.round((item.value! / 5) * 100)}
            size="small"
            className="flex-1"
            showInfo={false}
          />
          <Text type="secondary" className="w-10">
            {Math.round((item.value! / 5) * 100)}%
          </Text>
        </div>
      ))}
    </Card>
  );
}
```

- [ ] **Step 3: Create EmploymentCard and QiangjiTable components**

```tsx
// EmploymentCard.tsx
'use client';
import { Card, Descriptions } from 'antd';

interface Props {
  employmentRate?: string | null;
  furtherStudyRate?: string | null;
  avgSalary?: string | null;
  topEmployers?: string | null;
}

export default function EmploymentCard(props: Props) {
  const { employmentRate, furtherStudyRate, avgSalary, topEmployers } = props;
  if (!employmentRate && !furtherStudyRate) return null;

  return (
    <Card title="就业概况" size="small" className="mb-4">
      <Descriptions column={2} size="small">
        {employmentRate && <Descriptions.Item label="就业率">{employmentRate}</Descriptions.Item>}
        {furtherStudyRate && <Descriptions.Item label="深造率">{furtherStudyRate}</Descriptions.Item>}
        {avgSalary && <Descriptions.Item label="平均薪资">{avgSalary}</Descriptions.Item>}
      </Descriptions>
      {topEmployers && (
        <div className="mt-2">
          <Text type="secondary">主要雇主：</Text>
          <Text>{topEmployers}</Text>
        </div>
      )}
    </Card>
  );
}
```

```tsx
// QiangjiTable.tsx
'use client';
import { Table, Tag } from 'antd';

interface QiangjiRecord {
  id: number;
  major: string;
  subject?: string;
  year: number;
  entryScore?: number;
  admitScore?: number;
  gaokaoScore?: number;
  gaokaoRank?: number;
}

interface Props {
  data: QiangjiRecord[];
}

export default function QiangjiTable({ data }: Props) {
  if (!data?.length) return null;

  // Pivot: group by major, columns by year
  const majorMap = new Map<string, { subject?: string; years: Record<number, QiangjiRecord> }>();
  for (const r of data) {
    if (!majorMap.has(r.major)) {
      majorMap.set(r.major, { subject: r.subject, years: {} });
    }
    majorMap.get(r.major)!.years[r.year] = r;
  }

  const years = [2024, 2023, 2022];
  const dataSource = [...majorMap.entries()].map(([major, info], i) => ({
    key: i,
    major,
    subject: info.subject || '—',
    ...Object.fromEntries(
      years.flatMap((y) => {
        const r = info.years[y];
        return [
          [`entry${y}`, r?.entryScore ?? '—'],
          [`admit${y}`, r?.admitScore ?? '—'],
          [`rank${y}`, r?.gaokaoRank ?? '—'],
        ];
      }),
    ),
  }));

  const columns = [
    { title: '专业', dataIndex: 'major', width: 180 },
    { title: '选科', dataIndex: 'subject', width: 80 },
    ...years.flatMap((y) => [
      { title: `${y}入围`, dataIndex: `entry${y}`, width: 80 },
      { title: `${y}录取`, dataIndex: `admit${y}`, width: 80 },
      { title: `${y}位次`, dataIndex: `rank${y}`, width: 80 },
    ]),
  ];

  return (
    <Table dataSource={dataSource} columns={columns} pagination={false} size="small" scroll={{ x: 800 }} />
  );
}
```

- [ ] **Step 4: Integrate components into university detail page**

In `universities/[id]/page.tsx`, import and add the new components in the "基本信息" tab, after existing content:

```tsx
import RankingCard from '@/components/university/RankingCard';
import SatisfactionCard from '@/components/university/SatisfactionCard';
import EmploymentCard from '@/components/university/EmploymentCard';
import QiangjiTable from '@/components/university/QiangjiTable';

// In the info tab section:
<RankingCard
  rankingSoft={university.softRanking}
  rankingAlumni={university.rankingAlumni}
  rankingQS={university.rankingQS}
  rankingUSNews={university.rankingUSNews}
  aClassDisciplineCount={university.aClassDisciplineCount}
/>
<SatisfactionCard
  overall={university.satisfactionOverall}
  life={university.satisfactionLife}
  environ={university.satisfactionEnviron}
  count={university.satisfactionCount}
/>
<EmploymentCard
  employmentRate={university.employmentRate}
  furtherStudyRate={university.furtherStudyRate}
  avgSalary={university.avgSalary}
  topEmployers={university.topEmployers}
/>

// Add Qiangji as new tab (only if data exists):
{university.qiangjiAdmissions?.length > 0 && (
  <Tabs.TabPane tab="强基计划" key="qiangji">
    <QiangjiTable data={university.qiangjiAdmissions} />
  </Tabs.TabPane>
)}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/university/ apps/web/src/app/\(main\)/universities/
git commit -m "feat: university detail page — rankings, satisfaction, employment, qiangji display"
```

---

### Task 12: Major Detail Page Enhancement

**Files:**
- Create: `apps/web/src/components/major/CareerTab.tsx`
- Modify: `apps/web/src/app/(main)/majors/[id]/page.tsx`

- [ ] **Step 1: Create CareerTab component**

```tsx
// CareerTab.tsx
'use client';
import { Tag, Typography, Divider, Empty } from 'antd';

const { Title, Paragraph } = Typography;

interface Props {
  careerDirections?: string[] | null;
  postgraduateDirections?: string[] | null;
  coreCourses?: string[] | null;
}

export default function CareerTab({ careerDirections, postgraduateDirections, coreCourses }: Props) {
  if (!careerDirections?.length && !postgraduateDirections?.length && !coreCourses?.length) {
    return <Empty description="暂无就业与发展数据" />;
  }

  return (
    <div>
      {careerDirections?.length && (
        <>
          <Title level={5}>主要职业方向</Title>
          <div className="flex flex-wrap gap-2 mb-4">
            {careerDirections.slice(0, 12).map((d) => (
              <Tag key={d} color="blue">{d}</Tag>
            ))}
            {careerDirections.length > 12 && (
              <Tag>+{careerDirections.length - 12} 更多</Tag>
            )}
          </div>
        </>
      )}

      {postgraduateDirections?.length && (
        <>
          <Divider />
          <Title level={5}>考研方向</Title>
          <div className="flex flex-wrap gap-2 mb-4">
            {postgraduateDirections.map((d) => (
              <Tag key={d} color="purple">{d}</Tag>
            ))}
          </div>
        </>
      )}

      {coreCourses?.length && (
        <>
          <Divider />
          <Title level={5}>核心课程</Title>
          <div className="flex flex-wrap gap-2">
            {coreCourses.map((c) => (
              <Tag key={c}>{c}</Tag>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrate into major detail page**

In `majors/[id]/page.tsx`:
- Add description block above tabs (with expandable text)
- Add header metadata: degree, standardDuration, satisfactionScore, studentScale
- Add new "就业与发展" tab with CareerTab component

```tsx
// Above tabs:
{major.description && (
  <Paragraph ellipsis={{ rows: 3, expandable: true }}>
    {major.description}
  </Paragraph>
)}

// Add to Descriptions:
{major.degree && <Descriptions.Item label="授予学位">{major.degree}</Descriptions.Item>}
{major.standardDuration && <Descriptions.Item label="学制">{major.standardDuration}年</Descriptions.Item>}
{major.satisfactionScore && <Descriptions.Item label="满意度">{major.satisfactionScore.toFixed(1)}/5</Descriptions.Item>}

// New tab:
<Tabs.TabPane tab="就业与发展" key="career">
  <CareerTab
    careerDirections={major.careerDirections}
    postgraduateDirections={major.postgraduateDirections}
    coreCourses={major.coreCourses}
  />
</Tabs.TabPane>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/major/ apps/web/src/app/\(main\)/majors/
git commit -m "feat: major detail page — description, career directions, courses, satisfaction"
```

---

### Task 13: PlanItemCard & Recommend Results Enhancement

**Files:**
- Create: `apps/web/src/components/plan/ProspectRow.tsx`
- Modify: `apps/web/src/components/plan/PlanItemCard.tsx`
- Modify: `apps/web/src/app/(main)/recommend/page.tsx`

- [ ] **Step 1: Create ProspectRow component**

```tsx
// ProspectRow.tsx
'use client';
import { Tag, Typography, Alert } from 'antd';

const { Text } = Typography;

interface Props {
  scoreBreakdown?: any;
}

export default function ProspectRow({ scoreBreakdown }: Props) {
  if (!scoreBreakdown) return null;

  const tags: { label: string; color: string }[] = [];

  if (scoreBreakdown.prospectEmployment >= 2.5) {
    tags.push({ label: `就业率高`, color: 'green' });
  }
  if (scoreBreakdown.prospectSatisfaction >= 2.5) {
    tags.push({ label: `满意度高`, color: 'blue' });
  }
  if (scoreBreakdown.prospectRanking >= 2) {
    tags.push({ label: `排名靠前`, color: 'gold' });
  }
  if (scoreBreakdown.careerAlignmentBonus >= 3) {
    tags.push({ label: '强匹配职业方向', color: 'purple' });
  } else if (scoreBreakdown.careerAlignmentBonus >= 1.5) {
    tags.push({ label: '匹配职业方向', color: 'purple' });
  }

  const healthRisks: string[] = scoreBreakdown.healthRisks || [];

  return (
    <div className="mt-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map((t) => (
            <Tag key={t.label} color={t.color} className="text-xs">{t.label}</Tag>
          ))}
        </div>
      )}
      {healthRisks.map((risk: string, i: number) => (
        <Alert key={i} message={risk} type="warning" showIcon className="mb-1" banner />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Integrate into PlanItemCard expanded section**

In `PlanItemCard.tsx`, import and add after the existing expanded content (historical data section):

```tsx
import ProspectRow from './ProspectRow';

// In expanded detail section, after historical data:
<ProspectRow scoreBreakdown={item.scoreBreakdown} />
```

- [ ] **Step 3: Add indicator badges to recommend results page**

In `recommend/page.tsx`, in the result card rendering, add a small tag row:

```tsx
// After the acceptance probability display:
<div className="flex flex-wrap gap-1 mt-1">
  {item.scoreBreakdown?.prospectEmployment >= 2.5 && (
    <Tag color="green" className="text-xs">就业率高</Tag>
  )}
  {item.scoreBreakdown?.careerAlignmentBonus > 0 && (
    <Tag color="purple" className="text-xs">匹配方向</Tag>
  )}
</div>
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/plan/ apps/web/src/app/\(main\)/recommend/
git commit -m "feat: plan item cards and recommend results — prospect indicators, career match, health warnings"
```

---

### Task 14: Student Profile Page — Health Checkboxes & County

**Files:**
- Create: `apps/web/src/components/student/HealthCheckboxGroup.tsx`
- Create: `apps/web/src/components/student/CountyCascader.tsx`
- Modify: `apps/web/src/app/(student)/student/profile/page.tsx`

- [ ] **Step 1: Create HealthCheckboxGroup component**

```tsx
// HealthCheckboxGroup.tsx
'use client';
import { Checkbox, Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '@/services/api';

const { Text } = Typography;

interface Props {
  value?: string[];
  onChange?: (codes: string[]) => void;
}

export default function HealthCheckboxGroup({ value = [], onChange }: Props) {
  const { data: conditions, isLoading } = useQuery({
    queryKey: ['health-conditions'],
    queryFn: () => fetchApi('/health-restrictions'),
    staleTime: 86400000, // 24h
  });

  if (isLoading) return <Spin size="small" />;

  const options = (conditions || []).map((c: any) => ({
    label: c.conditionName.length > 20 ? c.conditionName.slice(0, 20) + '...' : c.conditionName,
    value: c.conditionCode,
  }));

  return (
    <div>
      <Checkbox.Group
        options={options}
        value={value}
        onChange={(checkedValues) => onChange?.(checkedValues as string[])}
      />
      <div className="mt-2">
        <Text type="secondary" className="text-xs">
          据此过滤不符合体检标准的专业，保护填报安全
        </Text>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create CountyCascader component**

```tsx
// CountyCascader.tsx
'use client';
import { Cascader } from 'antd';
// County data: hardcode Sichuan city→county mapping or fetch from API
// For now, use a static mapping of Sichuan cities and their districts/counties
import { SICHUAN_REGIONS } from '@/constants/regions';

interface Props {
  city?: string | null;
  county?: string | null;
  onChange?: (city: string, county: string | null) => void;
}

export default function CountyCascader({ city, county, onChange }: Props) {
  const value = city ? (county ? [city, county] : [city]) : [];

  return (
    <Cascader
      options={SICHUAN_REGIONS}
      value={value}
      onChange={(val: any[]) => {
        onChange?.(val?.[0] || '', val?.[1] || null);
      }}
      placeholder="选择城市/区县"
      changeOnSelect
    />
  );
}
```

Note: `SICHUAN_REGIONS` constant needs to be created separately with Sichuan city/county data. This can be derived from the eligible_regions data or a standard administrative division dataset.

- [ ] **Step 3: Integrate into student profile page**

In the "其他条件" tab of `profile/page.tsx`:

Replace the existing physical conditions section with `HealthCheckboxGroup`:
```tsx
<Form.Item label="身体条件" name="physicalLimits">
  <HealthCheckboxGroup />
</Form.Item>
```

Add county cascader after the existing city field:
```tsx
<Form.Item label="区县" name="county">
  <CountyCascader city={formData.city} county={formData.county} onChange={...} />
</Form.Item>
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/student/ apps/web/src/app/\(student\)/student/profile/
git commit -m "feat: student profile — standardized health condition checkboxes and county cascader"
```

---

## Final Verification

### Task 15: Integration Testing & Cleanup

- [ ] **Step 1: Run full test suite**

```bash
cd apps/server && npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 2: Build check**

```bash
pnpm build
```

Expected: No TypeScript errors, successful build.

- [ ] **Step 3: Dev smoke test**

```bash
pnpm dev
```

Manually verify:
1. University detail page shows rankings, satisfaction, employment, qiangji tab
2. Major detail page shows description, career directions, courses tab
3. Student profile has health checkboxes and county selector
4. Generate a plan and verify PlanItemCard shows prospect indicators

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final integration cleanup — enriched data integration complete"
```
