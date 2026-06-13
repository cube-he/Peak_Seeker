-- AlterTable
ALTER TABLE `supplementary_records` ADD COLUMN `group_code` VARCHAR(50) NULL,
    ADD COLUMN `major_code` VARCHAR(50) NULL,
    ADD COLUMN `subject` VARCHAR(20) NULL;

-- CreateIndex
CREATE INDEX `supplementary_records_year_university_id_group_code_subject_idx` ON `supplementary_records`(`year`, `university_id`, `group_code`, `subject`);

