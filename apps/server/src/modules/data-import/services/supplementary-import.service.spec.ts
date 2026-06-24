import { SupplementaryImportService } from './supplementary-import.service';

describe('SupplementaryImportService', () => {
  let service: SupplementaryImportService;
  let tx: any;
  let prisma: any;
  let audit: any;
  let cache: any;

  beforeEach(() => {
    tx = { supplementaryRecord: { createMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    prisma = {
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    cache = { refreshForTarget: jest.fn().mockResolvedValue(undefined) };
    service = new SupplementaryImportService(prisma, audit, cache);
  });

  it('writes subject / groupCode / majorCode so 征集 is visible to candidate cards', async () => {
    const row = {
      year: 2025, province: '四川', batch: '本科批B段', roundNumber: 1,
      universityId: 1, universityName: 'X大学',
      subject: '物理', groupCode: '102', majorCode: '0806', majorName: '计算机',
      planCount: 5,
    };

    const res = await service.import([row as any], 1);

    expect(res.success).toBe(true);
    const written = tx.supplementaryRecord.createMany.mock.calls[0][0].data[0];
    expect(written.subject).toBe('物理');
    expect(written.groupCode).toBe('102');
    expect(written.majorCode).toBe('0806');
  });
});
