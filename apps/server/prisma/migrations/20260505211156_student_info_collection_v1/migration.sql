-- AlterTable
ALTER TABLE `student_profiles` ADD COLUMN `bonus_items` JSON NULL,
    ADD COLUMN `bonus_policy_status` ENUM('NONE', 'HAS_BONUS', 'UNKNOWN') NULL,
    ADD COLUMN `cold_major_acceptance` ENUM('ABSOLUTELY_NO', 'FAMOUS_OK', 'DEVELOPED_AREA_OK', 'GOOD_PROSPECT_OK') NULL,
    ADD COLUMN `exam_location_city` VARCHAR(100) NULL,
    ADD COLUMN `exam_location_county` VARCHAR(100) NULL,
    ADD COLUMN `exam_location_province` VARCHAR(50) NULL,
    ADD COLUMN `form_filler` ENUM('STUDENT', 'PARENT', 'TOGETHER') NULL,
    ADD COLUMN `intake_form_version` VARCHAR(10) NULL DEFAULT '2025-v1',
    ADD COLUMN `medical_history` TEXT NULL,
    ADD COLUMN `parent_signed_at` DATETIME(3) NULL,
    ADD COLUMN `political_status` ENUM('PARTY_MEMBER', 'LEAGUE_MEMBER', 'MASSES') NULL,
    ADD COLUMN `preferred_batches` JSON NULL,
    ADD COLUMN `remote_area_acceptance` ENUM('ABSOLUTELY_NO', 'BACKUP_ONLY', 'FAMOUS_OK', 'GOOD_MAJOR_OK') NULL,
    ADD COLUMN `vision_left` DECIMAL(3, 1) NULL,
    ADD COLUMN `vision_left_corrected` DECIMAL(3, 1) NULL,
    ADD COLUMN `vision_right` DECIMAL(3, 1) NULL,
    ADD COLUMN `vision_right_corrected` DECIMAL(3, 1) NULL;

