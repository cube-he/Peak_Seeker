import { Injectable, BadRequestException } from '@nestjs/common';
import { PlanStatus } from '@prisma/client';

export type PlanAction =
  | 'SUBMIT_REVIEW' | 'START_REVIEW' | 'APPROVE' | 'REJECT'
  | 'REQUEST_CHANGE' | 'COMMENT' | 'PARENT_CONFIRM'
  | 'PARENT_REQUEST_CHANGE' | 'FINALIZE' | 'PUBLISH' | 'WITHDRAW';

interface TransitionContext {
  itemCount?: number;
  maxGroupCount?: number;
  /** 不足额提交理由: 提前批/专项类批次"只填想去的组"才专业, 强制填满反而逼出凑数组 */
  underfillReason?: string;
}

@Injectable()
export class PlanStateMachineService {
  transition(from: PlanStatus, action: PlanAction, ctx: TransitionContext = {}): PlanStatus {
    if (from === 'DRAFT' && action === 'SUBMIT_REVIEW') {
      const itemCount = ctx.itemCount ?? 0;
      const max = ctx.maxGroupCount ?? -1;
      // 上限改为软上限: 超额(>max)也放行, 老师可多备选, 正式填报时再精简回上限内。
      // 仅保留"不足额(<max)需理由"的闸门(提前批/专项只填想去的组才专业)。
      if (itemCount < max && (ctx.underfillReason ?? '').trim().length < 10) {
        throw new BadRequestException(
          `组数不足，需要 ${max}，当前 ${itemCount}。如确需不足额提交(如公费师范只填可接受的定向县组), 请填写不足额理由(至少 10 字)`,
        );
      }
      return 'PENDING_REVIEW';
    }
    if (from === 'PENDING_REVIEW' && action === 'START_REVIEW') return 'REVIEWING';
    // 老师撤回: 主管认领(REVIEWING)前可拉回草稿调序/改组; 认领后只能走主管"退回修改"
    if (from === 'PENDING_REVIEW' && action === 'WITHDRAW') return 'DRAFT';
    if (from === 'REVIEWING') {
      if (action === 'APPROVE') return 'APPROVED';
      if (action === 'REJECT') return 'REJECTED';
      if (action === 'REQUEST_CHANGE') return 'DRAFT';
      if (action === 'COMMENT') return 'REVIEWING';
    }
    if (from === 'APPROVED') {
      if (action === 'PARENT_CONFIRM') return 'PARENT_CONFIRMED';
      if (action === 'PARENT_REQUEST_CHANGE') return 'DRAFT';
    }
    if (from === 'PARENT_CONFIRMED' && action === 'FINALIZE') {
      return 'FINALIZED';
    }
    if (from === 'FINALIZED' && action === 'PUBLISH') {
      return 'PUBLISHED';
    }
    throw new BadRequestException(`不允许的状态转移：${from} -- ${action}`);
  }

  canDeriveVersion(from: PlanStatus): boolean {
    return (
      from === 'DRAFT' ||
      from === 'APPROVED' ||
      from === 'PARENT_CONFIRMED' ||
      from === 'REJECTED' ||
      from === 'FINALIZED'
    );
  }

  canEditItems(from: PlanStatus): boolean {
    return from === 'DRAFT';
  }

  canEditMajorSelection(from: PlanStatus): boolean {
    return from === 'DRAFT' || from === 'PENDING_REVIEW';
  }
}
