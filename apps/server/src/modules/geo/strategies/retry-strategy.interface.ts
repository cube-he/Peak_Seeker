import { GeoResult } from '../dto/geo-result.dto';

export interface RetryContext {
  /** Original input that the upstream pipeline tried first. */
  universityName: string;
  campusName?: string;
  /** Best-known hint (e.g. from EnrollmentPlan or charter parsing). */
  province?: string;
  city?: string;
  /** Previous attempt's address (for "no bracket" fix). */
  previousAddress?: string;
  /** Previous attempt's POI candidates (for "pick highest score"). */
  previousCandidates?: { score: number; geo: GeoResult }[];
}

export interface RetryStrategyResult {
  /** True if the strategy produced a usable GeoResult. */
  success: boolean;
  /** Recovered geo data, when success. */
  fix?: GeoResult;
  /** Diagnostic for logging. */
  reason?: string;
}

export interface RetryStrategy {
  /** Stable name used in logs and resolvedBy field. */
  readonly name: string;
  execute(ctx: RetryContext): Promise<RetryStrategyResult>;
}
