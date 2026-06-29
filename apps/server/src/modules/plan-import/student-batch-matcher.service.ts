import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ParsedIdentity } from './volunteer-form.types';

const EXAM_TYPE_TO_BATCH_EXAMTYPE: Record<string, string> = { PHYSICS: '物理', HISTORY: '历史' };

@Injectable()
export class StudentBatchMatcherService {
  constructor(private prisma: PrismaService) {}

  private canon(s: string): string {
    return (s || '').replace(/次/g, '').replace(/\s/g, '');
  }

  async matchBatchConfig(parsedBatch: string, examType: string, year: number, province: string) {
    const examTypeCn = EXAM_TYPE_TO_BATCH_EXAMTYPE[examType] ?? examType;
    const rows = await this.prisma.batchConfig.findMany({ where: { year, province, examType: examTypeCn } });
    const target = this.canon(parsedBatch);
    return rows.find((r: any) => this.canon(r.batch) === target) ?? null;
  }

  // 在该老师名下学生里按姓名匹配; 班级一致的排前。考生号未入库、证件号掩码, 故不参与唯一反查。
  // 师生关联: StudentProfile.teacherId → TeacherProfile.id; 入参 teacherUserId 是老师 User.id, 故经 teacher.userId 过滤。
  async findCandidateStudents(identity: Pick<ParsedIdentity, 'name' | 'classInfo'>, teacherUserId: number) {
    const rows = await this.prisma.studentProfile.findMany({
      where: { teacher: { userId: teacherUserId }, user: { realName: identity.name } },
      include: { user: { select: { realName: true } } },
    });
    const classWanted = (identity.classInfo || '').replace(/\s/g, '');
    return rows.sort((a: any, b: any) => {
      const am = a.classInfo && classWanted && a.classInfo.includes(classWanted) ? 0 : 1;
      const bm = b.classInfo && classWanted && b.classInfo.includes(classWanted) ? 0 : 1;
      return am - bm;
    });
  }
}
