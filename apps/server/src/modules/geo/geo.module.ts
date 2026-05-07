import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@/prisma/prisma.module';

import { AmapClient } from './amap/amap.client';
import { GeocoderService } from './services/geocoder.service';
import { CampusExtractor } from './services/campus-extractor.service';
import { GeoValidator } from './services/validator.service';
import { RetryChain, STRATEGY_TABLE, StrategyTable } from './services/retry-chain.service';

import { GeocodeWithoutBracketStrategy } from './strategies/geocode-without-bracket.strategy';
import { GeocodeWithProvinceCityStrategy } from './strategies/geocode-with-province-city.strategy';
import { GeocodeAsPoiStrategy } from './strategies/geocode-as-poi.strategy';
import { PickHighestScoreStrategy } from './strategies/pick-highest-score.strategy';
import { FetchFromCharterStrategy } from './strategies/fetch-from-charter.strategy';
import { FetchFromSunlightStrategy } from './strategies/fetch-from-sunlight.strategy';

import { FacilityScorer } from './facilities/facility-scorer.service';
import { CafeteriaScraper } from './facilities/cafeteria-scraper.service';

const STRATEGY_PROVIDERS = [
  GeocodeWithoutBracketStrategy,
  GeocodeWithProvinceCityStrategy,
  GeocodeAsPoiStrategy,
  PickHighestScoreStrategy,
  FetchFromCharterStrategy,
  FetchFromSunlightStrategy,
];

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    AmapClient,
    GeocoderService,
    CampusExtractor,
    GeoValidator,
    ...STRATEGY_PROVIDERS,
    {
      provide: STRATEGY_TABLE,
      useFactory: (
        a: GeocodeWithoutBracketStrategy,
        b: GeocodeWithProvinceCityStrategy,
        c: GeocodeAsPoiStrategy,
        d: PickHighestScoreStrategy,
        e: FetchFromCharterStrategy,
        f: FetchFromSunlightStrategy,
      ): StrategyTable => ({
        missing: [e, f],
        geocode_no_result: [a, b, c],
        out_of_china: [b],
        province_mismatch: [b],
        duplicate_coord: [],
        campus_distance_anomaly: [],
        address_ambiguous: [d],
        poi_zero_subway: [],
        poi_fetch_failed: [],
      }),
      inject: [
        GeocodeWithoutBracketStrategy,
        GeocodeWithProvinceCityStrategy,
        GeocodeAsPoiStrategy,
        PickHighestScoreStrategy,
        FetchFromCharterStrategy,
        FetchFromSunlightStrategy,
      ],
    },
    RetryChain,
    FacilityScorer,
    CafeteriaScraper,
  ],
  exports: [
    AmapClient, GeocoderService, CampusExtractor, GeoValidator, RetryChain,
    FacilityScorer, CafeteriaScraper,
  ],
})
export class GeoModule {}
