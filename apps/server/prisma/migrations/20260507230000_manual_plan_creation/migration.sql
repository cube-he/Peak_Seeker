-- AlterTable: add new batch/recommend/reviewer/gradient fields to volunteer_plans
ALTER TABLE `volunteer_plans`
  ADD COLUMN `batch_name` VARCHAR(100) NULL,
  ADD COLUMN `batch_config_id` INT NULL,
  ADD COLUMN `recommend_type` ENUM('AI_GENERATED', 'MANUAL', 'HYBRID') NULL,
  ADD COLUMN `current_reviewer_id` INT NULL,
  ADD COLUMN `gradient_source` VARCHAR(20) NULL;

-- Data backfill: map legacy batch enum → batch_name (best-effort; no-op if table is empty or BatchConfig has no matching rows)
UPDATE `volunteer_plans` vp
JOIN `student_profiles` sp ON sp.id = vp.student_id
JOIN `batch_configs` bc
  ON bc.year = vp.year
  AND bc.province = COALESCE(sp.province, '四川')
SET
  vp.batch_name = CASE vp.plan_batch
    WHEN 'EARLY_BATCH'   THEN '本科提前批'
    WHEN 'FIRST_BATCH'   THEN '本科批'
    WHEN 'SECOND_BATCH'  THEN '专科批'
    WHEN 'SPECIAL_BATCH' THEN '特殊类型批'
    ELSE NULL
  END,
  vp.batch_config_id = bc.id
WHERE vp.plan_batch IS NOT NULL
  AND bc.batch LIKE CONCAT(
    CASE vp.plan_batch
      WHEN 'EARLY_BATCH'   THEN '本科提前批'
      WHEN 'FIRST_BATCH'   THEN '本科批'
      WHEN 'SECOND_BATCH'  THEN '专科批'
      ELSE '特殊'
    END, '%');

-- Set recommend_type = MANUAL for all pre-existing rows that have no value
UPDATE `volunteer_plans` SET `recommend_type` = 'MANUAL' WHERE `recommend_type` IS NULL;

-- Drop old unique constraint (batch-based) and replace with batchConfigId-based one
ALTER TABLE `volunteer_plans` DROP INDEX `volunteer_plans_student_id_plan_batch_version_no_key`;
ALTER TABLE `volunteer_plans` ADD UNIQUE INDEX `plan_natural_key`(`student_id`, `batch_config_id`, `version_no`);

-- New indexes for query performance
CREATE INDEX `volunteer_plans_batch_config_id_idx` ON `volunteer_plans`(`batch_config_id`);
CREATE INDEX `volunteer_plans_current_reviewer_id_idx` ON `volunteer_plans`(`current_reviewer_id`);
