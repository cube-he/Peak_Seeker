-- AlterTable: Add enriched fields to universities
ALTER TABLE `universities`
    ADD COLUMN `male_ratio` INTEGER NULL,
    ADD COLUMN `female_ratio` INTEGER NULL,
    ADD COLUMN `created_year` VARCHAR(20) NULL,
    ADD COLUMN `logo_url` VARCHAR(500) NULL,
    ADD COLUMN `a_class_discipline_count` INTEGER NULL,
    ADD COLUMN `ranking_alumni` INTEGER NULL,
    ADD COLUMN `ranking_qs` INTEGER NULL,
    ADD COLUMN `ranking_us_news` INTEGER NULL,
    ADD COLUMN `satisfaction_overall` DOUBLE NULL,
    ADD COLUMN `satisfaction_life` DOUBLE NULL,
    ADD COLUMN `satisfaction_environ` DOUBLE NULL,
    ADD COLUMN `satisfaction_count` INTEGER NULL,
    ADD COLUMN `employment_rate` VARCHAR(50) NULL,
    ADD COLUMN `further_study_rate` VARCHAR(50) NULL,
    ADD COLUMN `avg_salary` VARCHAR(50) NULL,
    ADD COLUMN `top_employers` TEXT NULL,
    ADD COLUMN `charter_info` JSON NULL;

-- AlterTable: Add enriched fields to majors
ALTER TABLE `majors`
    ADD COLUMN `major_description` TEXT NULL,
    ADD COLUMN `male_ratio` INTEGER NULL,
    ADD COLUMN `female_ratio` INTEGER NULL,
    ADD COLUMN `student_scale` VARCHAR(50) NULL,
    ADD COLUMN `career_directions` JSON NULL,
    ADD COLUMN `postgraduate_directions` JSON NULL,
    ADD COLUMN `satisfaction_score` DOUBLE NULL,
    ADD COLUMN `core_courses` JSON NULL,
    ADD COLUMN `degree` VARCHAR(100) NULL,
    ADD COLUMN `standard_duration` VARCHAR(20) NULL;

-- AlterTable: Add county field to student_profiles
ALTER TABLE `student_profiles`
    ADD COLUMN `county` VARCHAR(100) NULL;

-- CreateTable: health_restrictions
CREATE TABLE `health_restrictions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `condition_code` VARCHAR(50) NOT NULL,
    `condition_name` TEXT NOT NULL,
    `restriction_type` VARCHAR(50) NOT NULL,
    `severity` VARCHAR(20) NOT NULL,
    `section` VARCHAR(100) NULL,
    `restriction_scope` VARCHAR(20) NOT NULL,
    `major_category` VARCHAR(100) NULL,
    `major_code` VARCHAR(50) NULL,
    `major_name` VARCHAR(200) NULL,

    INDEX `health_restrictions_condition_code_idx`(`condition_code`),
    INDEX `health_restrictions_major_code_idx`(`major_code`),
    INDEX `health_restrictions_major_category_idx`(`major_category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: eligible_regions
CREATE TABLE `eligible_regions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `program` VARCHAR(50) NOT NULL,
    `program_label` VARCHAR(100) NOT NULL,
    `area` VARCHAR(100) NOT NULL,
    `county` VARCHAR(100) NULL,
    `detail` TEXT NULL,

    INDEX `eligible_regions_program_area_idx`(`program`, `area`),
    INDEX `eligible_regions_program_area_county_idx`(`program`, `area`, `county`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: qiangji_admissions
CREATE TABLE `qiangji_admissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `school` VARCHAR(200) NOT NULL,
    `major` VARCHAR(200) NOT NULL,
    `subject` VARCHAR(100) NULL,
    `admission_method` VARCHAR(200) NULL,
    `year` SMALLINT NOT NULL,
    `entry_score` INTEGER NULL,
    `admit_score` INTEGER NULL,
    `gaokao_score` INTEGER NULL,
    `gaokao_rank` INTEGER NULL,

    UNIQUE INDEX `qiangji_admissions_school_major_year_key`(`school`, `major`, `year`),
    INDEX `qiangji_admissions_school_idx`(`school`),
    INDEX `qiangji_admissions_year_idx`(`year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
