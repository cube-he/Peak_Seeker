import { Injectable, Logger } from '@nestjs/common';
import {
  RetryContext, RetryStrategy, RetryStrategyResult,
} from './retry-strategy.interface';

@Injectable()
export class FetchFromSunlightStrategy implements RetryStrategy {
  readonly name = 'fetch-from-sunlight';
  private readonly logger = new Logger(FetchFromSunlightStrategy.name);

  async execute(_ctx: RetryContext): Promise<RetryStrategyResult> {
    this.logger.debug('fetch-from-sunlight not implemented in Plan A');
    return { success: false, reason: 'not implemented (Plan C)' };
  }
}
