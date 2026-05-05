import { Injectable, Inject } from '@nestjs/common';
import { GEO_CONFIG, IssueType } from '../geo.config';
import {
  RetryContext, RetryStrategy,
} from '../strategies/retry-strategy.interface';
import { GeoResult } from '../dto/geo-result.dto';

export const STRATEGY_TABLE = Symbol('STRATEGY_TABLE');
export type StrategyTable = Partial<Record<IssueType, RetryStrategy[]>>;

export interface RetryRequest {
  issueType: IssueType;
  retryCount: number;
  ctx: RetryContext;
}

export interface RetryOutcome {
  success: boolean;
  fix?: GeoResult;
  by?: string;            // strategy name
  reason?: string;
}

@Injectable()
export class RetryChain {
  constructor(@Inject(STRATEGY_TABLE) private readonly table: StrategyTable) {}

  async retry(req: RetryRequest): Promise<RetryOutcome> {
    if (req.retryCount >= GEO_CONFIG.RETRY_CHAIN_MAX_ATTEMPTS) {
      return { success: false, reason: 'max_retries' };
    }
    const strategies = this.table[req.issueType] ?? [];
    if (strategies.length === 0) {
      return { success: false, reason: 'manual_required' };
    }
    for (const s of strategies) {
      const result = await s.execute(req.ctx);
      if (result.success && result.fix) {
        return { success: true, fix: result.fix, by: s.name };
      }
    }
    return { success: false, reason: 'all_strategies_failed' };
  }
}
