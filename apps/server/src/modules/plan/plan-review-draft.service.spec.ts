import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PlanReviewDraftService } from './plan-review-draft.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PlanReviewDraftService', () => {
  let service: PlanReviewDraftService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      volunteerPlan: { findUnique: jest.fn() },
      planReviewDraft: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const mod = await Test.createTestingModule({
      providers: [
        PlanReviewDraftService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = mod.get(PlanReviewDraftService);
  });

  describe('getDraft', () => {
    it('returns null when no draft exists', async () => {
      prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1 });
      prisma.planReviewDraft.findUnique.mockResolvedValue(null);

      const result = await service.getDraft(1, 100);

      expect(result).toBeNull();
      expect(prisma.planReviewDraft.findUnique).toHaveBeenCalledWith({
        where: { planId_reviewerId: { planId: 1, reviewerId: 100 } },
      });
    });

    it('returns draft when it exists', async () => {
      prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1 });
      const draft = {
        id: 99,
        planId: 1,
        reviewerId: 100,
        comment: 'work in progress',
        itemAnnotations: [{ sequence: 3, annotation: 'risky' }],
      };
      prisma.planReviewDraft.findUnique.mockResolvedValue(draft);

      const result = await service.getDraft(1, 100);

      expect(result).toEqual(draft);
    });

    it('throws NotFoundException when plan does not exist', async () => {
      prisma.volunteerPlan.findUnique.mockResolvedValue(null);

      await expect(service.getDraft(999, 100)).rejects.toThrow(NotFoundException);
    });
  });

  describe('upsertDraft', () => {
    it('creates draft when none exists', async () => {
      prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1 });
      prisma.planReviewDraft.upsert.mockResolvedValue({
        id: 1, planId: 1, reviewerId: 100, comment: 'note', itemAnnotations: null,
      });

      const result = await service.upsertDraft(1, 100, { comment: 'note' });

      expect(prisma.planReviewDraft.upsert).toHaveBeenCalledWith({
        where: { planId_reviewerId: { planId: 1, reviewerId: 100 } },
        create: { planId: 1, reviewerId: 100, comment: 'note', itemAnnotations: undefined },
        update: { comment: 'note', itemAnnotations: undefined },
      });
      expect(result.comment).toBe('note');
    });

    it('updates draft when one exists', async () => {
      prisma.volunteerPlan.findUnique.mockResolvedValue({ id: 1 });
      const annotations = [{ sequence: 1, annotation: 'fix this' }];
      prisma.planReviewDraft.upsert.mockResolvedValue({
        id: 1, planId: 1, reviewerId: 100, comment: null, itemAnnotations: annotations,
      });

      const result = await service.upsertDraft(1, 100, { itemAnnotations: annotations });

      expect(result.itemAnnotations).toEqual(annotations);
    });

    it('throws NotFoundException when plan does not exist', async () => {
      prisma.volunteerPlan.findUnique.mockResolvedValue(null);

      await expect(
        service.upsertDraft(999, 100, { comment: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('clearDraft', () => {
    it('deletes draft for given (planId, reviewerId) silently if missing', async () => {
      prisma.planReviewDraft.deleteMany.mockResolvedValue({ count: 0 });

      await service.clearDraft(1, 100);

      expect(prisma.planReviewDraft.deleteMany).toHaveBeenCalledWith({
        where: { planId: 1, reviewerId: 100 },
      });
    });
  });
});
