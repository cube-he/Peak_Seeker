import { Injectable, BadRequestException } from '@nestjs/common';
import { PlanStatus } from '@prisma/client';

export type PlanAction =
  | 'SUBMIT_REVIEW' | 'START_REVIEW' | 'APPROVE' | 'REJECT'
  | 'REQUEST_CHANGE' | 'COMMENT' | 'STUDENT_CONFIRM'
  | 'STUDENT_REQUEST_CHANGE' | 'FINALIZE';

interface TransitionContext {
  itemCount?: number;
  maxGroupCount?: number;
}

@Injectable()
export class PlanStateMachineService {
  transition(from: PlanStatus, action: PlanAction, ctx: TransitionContext = {}): PlanStatus {
    if (from === 'DRAFT' && action === 'SUBMIT_REVIEW') {
      if ((ctx.itemCount ?? 0) !== (ctx.maxGroupCount ?? -1)) {
        throw new BadRequestException(`组数不足，需要 ${ctx.maxGroupCount}，当前 ${ctx.itemCount}`);
      }
      return 'PENDING_REVIEW';
    }
    if (from === 'PENDING_REVIEW' && action === 'START_REVIEW') return 'REVIEWING';
    if (from === 'REVIEWING') {
      if (action === 'APPROVE') return 'APPROVED';
      if (action === 'REJECT') return 'REJECTED';
      if (action === 'REQUEST_CHANGE') return 'DRAFT';
      if (action === 'COMMENT') return 'REVIEWING';
    }
    if (from === 'APPROVED') {
      if (action === 'STUDENT_CONFIRM') return 'STUDENT_CONFIRMED' as PlanStatus;
      if (action === 'STUDENT_REQUEST_CHANGE') return 'DRAFT';
    }
    if (from === ('STUDENT_CONFIRMED' as PlanStatus) && action === 'FINALIZE') {
      return 'FINALIZED';
    }
    throw new BadRequestException(`不允许的状态转移：${from} -- ${action}`);
  }

  canDeriveVersion(from: PlanStatus): boolean {
    return from === 'APPROVED' || from === ('STUDENT_CONFIRMED' as PlanStatus) || from === 'REJECTED' || from === 'FINALIZED';
  }

  canEditItems(from: PlanStatus): boolean {
    return from === 'DRAFT';
  }

  canEditMajorSelection(from: PlanStatus): boolean {
    return from === 'DRAFT' || from === 'PENDING_REVIEW';
  }
}
