-- AlterTable
ALTER TABLE `student_profiles`
  ADD COLUMN `hukou_updated_by` VARCHAR(20) NULL,
  ADD COLUMN `hukou_updated_at` DATETIME(3) NULL,
  ADD COLUMN `bonus_updated_by` VARCHAR(20) NULL,
  ADD COLUMN `bonus_updated_at` DATETIME(3) NULL,
  ADD COLUMN `exam_location_updated_by` VARCHAR(20) NULL,
  ADD COLUMN `exam_location_updated_at` DATETIME(3) NULL;
