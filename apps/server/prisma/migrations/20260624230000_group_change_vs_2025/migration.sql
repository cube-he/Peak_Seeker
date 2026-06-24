-- AlterTable
ALTER TABLE `enrollment_plans` ADD COLUMN `group_change_type` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `enrollment_plans` ADD COLUMN `old_group_majors_2025` TEXT NULL;
