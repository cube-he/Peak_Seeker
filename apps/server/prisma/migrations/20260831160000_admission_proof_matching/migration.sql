-- AlterTable
ALTER TABLE `student_profiles`
    ADD COLUMN `admission_analysis_revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `student_admission_results`
    ADD COLUMN `admitted_uni_code` VARCHAR(20) NULL,
    ADD COLUMN `major_sequence_no` SMALLINT NULL,
    ADD COLUMN `is_adjusted` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `match_status` VARCHAR(30) NULL,
    ADD COLUMN `submission_attachment_id` INTEGER NULL,
    ADD COLUMN `match_confidence` SMALLINT NULL,
    ADD COLUMN `match_evidence` JSON NULL,
    ADD COLUMN `recognized_at` DATETIME(3) NULL,
    ADD COLUMN `match_confirmed_at` DATETIME(3) NULL,
    ADD COLUMN `match_confirmed_by_id` INTEGER NULL;

-- Existing rows were saved and reviewed manually before automatic matching
-- existed. Preserve their archived/confirmed semantics after the new UI starts
-- checking match_confirmed_at.
UPDATE `student_admission_results`
SET `match_status` = 'MANUAL_CONFIRMED',
    `match_confirmed_at` = `updated_at`
WHERE `admitted_uni_name` IS NOT NULL
  AND TRIM(`admitted_uni_name`) <> '';

-- CreateIndex
CREATE INDEX `student_admission_results_match_status_idx`
    ON `student_admission_results`(`match_status`);
