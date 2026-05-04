# Rank Prediction Runbook

## Overview

Predicted admission ranks live in the `rank_predictions` table. The frontend reads them via the `/admissions/aggregated` response field `predictedMinRank` (multi-to-one join: same prediction shared across all majors in a group). All computation is offline ETL; no realtime calculation in the API.

Spec: `docs/superpowers/specs/2026-05-04-rank-prediction-model-design.md`

## Files

| Purpose | Path |
|---|---|
| Configuration (target year, switch policy) | `config/rank-prediction.json` |
| Pure prediction functions (subjectWeight, planWeight, predictMinRank) | `apps/server/src/scripts/etl-predict-rank/predict.ts` |
| Subject normalization util | `apps/server/src/scripts/etl-predict-rank/subject-normalize.ts` |
| Province registration data (researched) | `apps/server/scripts/fetch-province-stats/seed-data.ts` |
| Province registration sources | `apps/server/scripts/fetch-province-stats/sources.md` |
| Seed `province_year_stats` | `apps/server/scripts/seed-province-stats.ts` |
| Main ETL — write `rank_predictions` | `apps/server/scripts/etl-predict-rank.ts` |
| Calibration (holdout MAE/MAPE report) | `apps/server/scripts/validate-rank-predictions.ts` |
| Latest validation report | `docs/data-reports/2026-05-04-rank-prediction-validation.md` |

## When to switch `targetYear`

**Trigger**: previous year's filing + admission cycle has fully closed AND that year's `admission_records`, `enrollment_plans`, and `province_year_stats` are loaded into the DB.

**Steps**:

1. Confirm new year's data is in DB:
   ```bash
   cd apps/server
   pnpm ts-node -e "
   import { PrismaClient } from '@prisma/client';
   import { PrismaMariaDb } from '@prisma/adapter-mariadb';
   const p = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
   (async () => {
     const NEW_YEAR = 2026; // adjust
     console.log('admission_records:', await p.admissionRecord.count({ where: { year: NEW_YEAR }}));
     console.log('enrollment_plans:', await p.enrollmentPlan.count({ where: { year: NEW_YEAR }}));
     console.log('province_year_stats:', await p.provinceYearStat.count({ where: { year: NEW_YEAR }}));
     await p.\$disconnect();
   })();
   "
   ```

2. Update `config/rank-prediction.json`:
   ```json
   {
     "targetYear": <NEW_YEAR + 1>,
     "switchTrigger": "manual",
     "lastSwitchedAt": "<YYYY-MM-DD>",
     "policyNote": "..."
   }
   ```

3. Re-seed province stats if new year's row missing or `registrants` is null:
   - Edit `apps/server/scripts/fetch-province-stats/seed-data.ts` to include new researched values.
   - Edit `apps/server/scripts/fetch-province-stats/sources.md` with new source URLs.
   - Run: `cd apps/server && pnpm ts-node scripts/seed-province-stats.ts`

4. Run ETL:
   ```bash
   cd apps/server
   pnpm ts-node scripts/etl-predict-rank.ts
   ```

5. Run validation against most recent fully-closed year:
   ```bash
   pnpm ts-node scripts/validate-rank-predictions.ts > ../../docs/data-reports/<YYYY-MM-DD>-rank-prediction-validation.md
   ```

6. Confirm validation thresholds pass:
   - Overall MAE < 3000
   - High-confidence MAE < 1500
   - 0–10000 段 MAE < 800

   If any threshold fails, debug before allowing the new predictions to ship to frontend. Options:
   - Improve model in `predict.ts` (revise weights, confidence rules)
   - Investigate calibration report's "Top 20 误差最大案例" for systemic issues
   - As a temporary measure, disable predictions in the frontend until next iteration

7. Restart server (the in-process `_cachedTargetYear` in `admission.service.ts` invalidates only on cold start).

## When to rerun ETL without changing `targetYear`

Whenever any of these change:
- `admission_records` (new historical year added, corrections to past data)
- `enrollment_plans` (target year plan adjustments by universities)
- `province_year_stats` (registration numbers updated/corrected)
- Model code in `predict.ts`

Rerun command:
```bash
cd apps/server
pnpm ts-node scripts/etl-predict-rank.ts
```

The script is idempotent (upsert by `rank_pred_natural_key`).

## Adding new province registration data points

1. Research the data — at least 2 independent sources per data point.
2. Update `apps/server/scripts/fetch-province-stats/sources.md` with new rows + source URLs + cross-validation notes.
3. Update `apps/server/scripts/fetch-province-stats/seed-data.ts` with the typed const array entries (verified values).
4. Run: `cd apps/server && pnpm ts-node scripts/seed-province-stats.ts`
5. Re-run ETL (above).

## Disabling predictions for a problematic group

If the model produces obviously wrong predictions for a specific (university, group, batch, recruitType), the safest mitigation is data-side:

1. Identify the row in `rank_predictions`.
2. Set `confidence` to `"insufficient"` directly via SQL — the API filter `confidence != 'insufficient'` (TBD in T10) will hide it from frontend response.
3. Or delete the row entirely; the API treats missing rows as `predictedMinRank: null`.

The systemic fix is to investigate why the model failed and either improve `predict.ts` or correct upstream data.

## Frontend integration

The API endpoint `/admissions/aggregated` adds a new field `predictedMinRank` per item. Same shape as the `PredictedMinRank` interface in `packages/shared/src/types/admission.ts`. Field is `null` when the model has insufficient data (history < 2 years, missing target pool, etc.).

spec-1 (the visual layer) consumes `point` for冲稳保 coloring, exposes `[optimistic, conservative]` and `confidence` in details/expanded rows.
