import { Injectable } from '@nestjs/common';
import { GeocoderService } from '../services/geocoder.service';
import {
  RetryContext,
  RetryStrategy,
  RetryStrategyResult,
} from './retry-strategy.interface';

@Injectable()
export class GeocodeWithProvinceCityStrategy implements RetryStrategy {
  readonly name = 'geocode-with-province-city';
  constructor(private readonly geocoder: GeocoderService) {}

  async execute(ctx: RetryContext): Promise<RetryStrategyResult> {
    if (!ctx.province && !ctx.city) {
      return { success: false, reason: 'no province/city hint' };
    }
    const parts = [ctx.province, ctx.city, ctx.universityName].filter(Boolean) as string[];
    if (ctx.campusName) parts.push(ctx.campusName);
    const query = parts.join(' ');
    const fix = await this.geocoder.geocode(query, { city: ctx.city });
    return fix ? { success: true, fix } : { success: false, reason: 'no result' };
  }
}
