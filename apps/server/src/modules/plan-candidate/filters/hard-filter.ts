// hard-filter.ts
import { Prisma } from '@prisma/client';

export interface HardFilterInput {
  year: number;
  province: string;
  batchName: string;
  subjects: string;
  keyword?: string;
}

export function buildHardFilterWhere(input: HardFilterInput): Prisma.EnrollmentPlanWhereInput {
  const where: Prisma.EnrollmentPlanWhereInput = {
    year: input.year,
    province: input.province,
    batch: input.batchName,
    subjects: input.subjects,
  };
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
