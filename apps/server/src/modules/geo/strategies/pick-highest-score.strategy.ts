import { Injectable } from '@nestjs/common';
import {
  RetryContext, RetryStrategy, RetryStrategyResult,
} from './retry-strategy.interface';

@Injectable()
export class PickHighestScoreStrategy implements RetryStrategy {
  readonly name = 'pick-highest-score';

  async execute(ctx: RetryContext): Promise<RetryStrategyResult> {
    const c = ctx.previousCandidates;
    if (!c || c.length === 0) return { success: false, reason: 'no candidates' };
    const best = c.reduce((a, b) => (a.score >= b.score ? a : b));
    return { success: true, fix: best.geo };
  }
}
