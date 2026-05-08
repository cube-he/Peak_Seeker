import { PlanExportService } from './plan-export.service';

describe('PlanExportService.renderHtml', () => {
  let service: PlanExportService;
  const prismaMock: any = {};

  beforeAll(() => {
    service = new PlanExportService(prismaMock);
  });

  it('用上下文渲染 HTML 后包含学生姓名和版本号', () => {
    const ctx = {
      plan: {
        name: 'X',
        versionNo: 2,
        batchName: '本科批A段',
        versionNote: '初版',
      },
      student: {
        name: '张三',
        school: '七中',
        classInfo: '高三 1 班',
        totalScore: 600,
        rank: 5000,
        examType: 'PHYSICS',
      },
      teacher: { name: '李老师' },
      items: [
        {
          sequence: 1,
          gradient: 'WEN',
          universityName: '川大',
          universityCode: '10610',
          groupCode: 'G1',
          groupName: '理工组',
          anchorMajor: '计算机',
          score25Group: 605,
          rank25Group: 4500,
          score24Major: 600,
          rank24Major: 5200,
          planCount: 5,
          tuition: 5000,
          acceptAdjust: true,
        },
      ],
      reviewComments: [],
      generatedAt: '2026-05-07 18:00',
    };
    const html = service.renderHtml(ctx);
    expect(html).toContain('张三');
    expect(html).toContain('v2');
    expect(html).toContain('计算机');
  });
});
