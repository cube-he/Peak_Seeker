import { Injectable } from '@nestjs/common';
import { GeocoderService } from '../services/geocoder.service';
import {
  RetryContext,
  RetryStrategy,
  RetryStrategyResult,
} from './retry-strategy.interface';

@Injectable()
export class GeocodeWithoutBracketStrategy implements RetryStrategy {
  readonly name = 'geocode-without-bracket';
  constructor(private readonly geocoder: GeocoderService) {}

  async execute(ctx: RetryContext): Promise<RetryStrategyResult> {
    // Strip bracket characters but preserve their content, then collapse spaces.
    const cleaned = (ctx.previousAddress ?? `${ctx.universityName}${ctx.campusName ?? ''}`)
      .replace(/[\[【（(]/g, ' ')
      .replace(/[\]】）)]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return { success: false, reason: 'empty after clean' };
    const fix = await this.geocoder.geocode(cleaned, { city: ctx.city });
    return fix ? { success: true, fix } : { success: false, reason: 'still no result' };
  }
}
