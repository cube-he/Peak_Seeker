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
    it('queries batch_config by year + province and dedupes by batch name', async () => {
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
