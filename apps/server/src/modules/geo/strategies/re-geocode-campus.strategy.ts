import { Injectable } from '@nestjs/common';
import { GeocoderService } from '../services/geocoder.service';
import {
  RetryContext, RetryStrategy, RetryStrategyResult,
} from './retry-strategy.interface';

@Injectable()
export class ReGeocodeCampusStrategy implements RetryStrategy {
  readonly name = 're-geocode-campus';
  constructor(private readonly geocoder: GeocoderService) {}

  async execute(ctx: RetryContext): Promise<RetryStrategyResult> {
    if (!ctx.campusName) return { success: false, reason: 'no campusName' };
    const fix = await this.geocoder.geocodeCampus(
      ctx.universityName,
      ctx.campusName,
      { city: ctx.city, province: ctx.province },
    );
    return fix ? { success: true, fix } : { success: false, reason: 'no result' };
  }
}
