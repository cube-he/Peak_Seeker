-- AlterTable
ALTER TABLE `enrollment_plans` ADD COLUMN `group_purity_score` DOUBLE NULL;

-- AlterTable
ALTER TABLE `group_purities` ADD COLUMN `score` DOUBLE NULL;
