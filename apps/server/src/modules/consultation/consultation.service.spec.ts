import { ConsultationService } from './consultation.service';

describe('ConsultationService.getClinicState', () => {
  let prisma: any;
  let service: ConsultationService;

  beforeEach(() => {
    prisma = {
      teacherProfile: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      consultationAppointment: { findMany: jest.fn() },
    };
    service = new ConsultationService(prisma);
  });

  it('等待队列纳入未来预约; 进行中/已完成仍只看当天', async () => {
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    const future = new Date(noon.getTime() + 2 * 86_400_000); // 后天

    prisma.consultationAppointment.findMany.mockResolvedValue([
      { id: 1, status: 'scheduled', queueNumber: 1, scheduledAt: noon, student: {} },
      { id: 2, status: 'scheduled', queueNumber: 1, scheduledAt: future, student: {} }, // 未来
      { id: 3, status: 'completed', queueNumber: 2, scheduledAt: noon, student: {} },
      { id: 4, status: 'in_progress', queueNumber: 3, scheduledAt: noon, student: {} },
    ]);

    const state = await service.getClinicState(99);

    // 查询不再设当天上限(只 gte: 今天0点)
    const where = prisma.consultationAppointment.findMany.mock.calls[0][0].where;
    expect(where.scheduledAt.lt).toBeUndefined();
    expect(where.scheduledAt.gte).toBeInstanceOf(Date);

    // 等待队列含今天(1)+未来(2)
    expect(state.waiting.map((w: any) => w.id)).toEqual([1, 2]);
    // 进行中=今天的 in_progress
    expect(state.inProgress?.id).toBe(4);
    // 已完成只当天
    expect(state.done.map((d: any) => d.id)).toEqual([3]);
  });

  it('只有未来预约时: 等待显示, 进行中/已完成为空', async () => {
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    const future = new Date(noon.getTime() + 86_400_000); // 明天

    prisma.consultationAppointment.findMany.mockResolvedValue([
      { id: 9, status: 'scheduled', queueNumber: 1, scheduledAt: future, student: {} },
    ]);

    const state = await service.getClinicState(99);

    expect(state.waiting.map((w: any) => w.id)).toEqual([9]);
    expect(state.inProgress).toBeNull();
    expect(state.done).toEqual([]);
  });
});
