// hard-filter.ts
import { Prisma } from '@prisma/client';
import { resolveBatchQueryShape } from '../batch-alias';

export interface HardFilterInput {
  year: number;
  province: string;
  batchName: string;
  subjects: string;
  keyword?: string;
}

export function buildHardFilterWhere(input: HardFilterInput): Prisma.EnrollmentPlanWhereInput {
  // 批次名走别名解析: 配置口径(本科批A段（国家专项）/高职批…)翻译成数据实名 + recruitType 收窄
  const shape = resolveBatchQueryShape(input.batchName);
  const where: Prisma.EnrollmentPlanWhereInput = {
    year: input.year,
    province: input.province,
    batch: shape.batches.length === 1 ? shape.batches[0] : { in: shape.batches },
    subjects: input.subjects,
  };
  if (shape.recruitTypeContains) {
    where.recruitType = { contains: shape.recruitTypeContains };
  }
  if (input.keyword && input.keyword.trim().length > 0) {
    const k = input.keyword.trim();
    (where as any).OR = [
      { university: { name: { contains: k } } },
      { major: { name: { contains: k } } },
      { groupName: { contains: k } },
      { majorName: { contains: k } },
    ];
  }
  return where;
}
