import { Module } from '@nestjs/common';
import { RecommendController } from './recommend.controller';
import { RecommendService } from './recommend.service';
import { RecommendEngine } from './algorithms/recommend-engine';

// v4.4 engine sub-modules
import { RankCalculatorService } from './services/rank-calculator.service';
import { BatchRecommenderService } from './services/batch-recommender.service';
import { RangeAdapterService } from './services/range-adapter.service';
import { CandidateFilterService } from './services/candidate-filter.service';
import { ScoringEngineService } from './services/scoring-engine.service';
import { SupplementaryAnalyzerService } from './services/supplementary-analyzer.service';
import { StabilityAnalyzerService } from './services/stability-analyzer.service';
import { BinSamplerService } from './services/bin-sampler.service';
import { DedupLimiterService } from './services/dedup-limiter.service';
import { InnerRankerService } from './services/inner-ranker.service';
import { CleanlinessAssessorService } from './services/cleanliness-assessor.service';
import { ReasonGeneratorService } from './services/reason-generator.service';
import { RiskGeneratorService } from './services/risk-generator.service';
import { SmartReplacerService } from './services/smart-replacer.service';
import { ExportFormatterService } from './services/export-formatter.service';
import { PlanGeneratorService } from './services/plan-generator.service';

// Bull processor
import { PlanGenerationProcessor } from './processors/plan-generation.processor';

// Infrastructure modules
import { QueueModule } from '../queue/queue.module';
import { DataImportModule } from '../data-import/data-import.module';

@Module({
  imports: [QueueModule, DataImportModule],
  controllers: [RecommendController],
  providers: [
    // Legacy engine
    RecommendService,
    RecommendEngine,

    // v4.4 engine services (16 sub-modules)
    RankCalculatorService,
    BatchRecommenderService,
    RangeAdapterService,
    CandidateFilterService,
    ScoringEngineService,
    SupplementaryAnalyzerService,
    StabilityAnalyzerService,
    BinSamplerService,
    DedupLimiterService,
    InnerRankerService,
    CleanlinessAssessorService,
    ReasonGeneratorService,
    RiskGeneratorService,
    SmartReplacerService,
    ExportFormatterService,
    PlanGeneratorService,

    // Bull processor
    PlanGenerationProcessor,
  ],
  exports: [RecommendService, PlanGeneratorService],
})
export class RecommendModule {}
