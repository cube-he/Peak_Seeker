import { Injectable, Logger } from '@nestjs/common';
import {
  RetryContext, RetryStrategy, RetryStrategyResult,
} from './retry-strategy.interface';

/**
 * Plan C will replace this with a real charter-text fetcher + LLM extractor.
 * Plan A keeps it as a no-op so the retry chain can still be wired without
 * breaking the interface.
 */
@Injectable()
export class FetchFromCharterStrategy implements RetryStrategy {
  readonly name = 'fetch-from-charter';
  private readonly logger = new Logger(FetchFromCharterStrategy.name);

  async execute(_ctx: RetryContext): Promise<RetryStrategyResult> {
    this.logger.debug('fetch-from-charter not implemented in Plan A');
    return { success: false, reason: 'not implemented (Plan C)' };
  }
}
