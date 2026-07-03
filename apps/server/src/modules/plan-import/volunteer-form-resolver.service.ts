import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ParsedVolunteer, ParsedMajor, ResolvedGroup, ResolveResult, ResolvedSelectedMajor } from './volunteer-form.types';
import { resolveBatchQueryShape } from '../plan-candidate/batch-alias';

@Injectable()
export class VolunteerFormResolverService {
  constructor(private prisma: PrismaService) {}

  async resolveGroups(
    volunteers: ParsedVolunteer[],
    opts: { year: number; subjects: string; batch: string },
  ): Promise<ResolveResult> {
    const batchShape = resolveBatchQueryShape(opts.batch);
    const codes = [...new Set(volunteers.map(v => v.schoolCode))];
    const unis = await this.prisma.university.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true, name: true },
    });
    const uniByCode = new Map<string, { id: number }>(unis.map((u: any) => [u.code, u]));

    const groups: ResolvedGroup[] = [];
    for (const v of volunteers) {
      const uni = uniByCode.get(v.schoolCode);
      if (!uni) { groups.push(this.unmatched(v, '院校代码不在库')); continue; }

      const eps = await this.prisma.enrollmentPlan.findMany({
        where: {
          universityId: uni.id,
          groupCode: v.groupCode,
          year: opts.year,
          batch: batchShape.batches.length === 1 ? batchShape.batches[0] : { in: batchShape.batches },
          subjects: opts.subjects,
          ...(batchShape.recruitTypeContains ? { recruitType: { contains: batchShape.recruitTypeContains } } : {}),
        },
        select: { id: true, majorId: true, majorCode: true, majorName: true },
      });
      if (eps.length === 0) { groups.push(this.unmatched(v, '该批次无此专业组')); continue; }

      const selected: ResolvedSelectedMajor[] = [];
      for (const m of v.majors) {
        const ep = this.matchMajor(eps, m);
        if (ep) {
          selected.push({ order: selected.length + 1, enrollmentPlanId: ep.id, majorId: ep.majorId, majorName: ep.majorName, majorCode: ep.majorCode || null });
        }
      }
      groups.push({
        seq: v.seq, schoolCode: v.schoolCode, schoolName: v.schoolName, groupCode: v.groupCode,
        status: 'matched',
        anchorEnrollmentPlanId: selected[0]?.enrollmentPlanId ?? eps[0].id,
        selectedMajors: selected.slice(0, 6),
        acceptAdjust: v.acceptAdjust,
        note: selected.length === 0 ? '专业未对齐' : undefined,
      });
    }
    const matched = groups.filter(g => g.status === 'matched').length;
    return { groups, summary: { total: groups.length, matched, unmatched: groups.length - matched } };
  }

  private norm(s: string): string {
    return s.replace(/[\s（）()【】]/g, '').trim();
  }

  private matchMajor(eps: any[], m: ParsedMajor) {
    const byName = eps.find(e => this.norm(e.majorName) === this.norm(m.name));
    if (byName) return byName;
    if (m.code) { const byCode = eps.find(e => e.majorCode === m.code); if (byCode) return byCode; }
    return null;
  }

  private unmatched(v: ParsedVolunteer, reason: string): ResolvedGroup {
    return { seq: v.seq, schoolCode: v.schoolCode, schoolName: v.schoolName, groupCode: v.groupCode,
      status: 'unmatched', selectedMajors: [], acceptAdjust: v.acceptAdjust, unmatchedReason: reason };
  }
}
