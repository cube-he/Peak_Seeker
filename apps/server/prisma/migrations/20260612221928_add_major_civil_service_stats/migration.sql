-- AlterTable
ALTER TABLE `majors` ADD COLUMN `cs_competition` DOUBLE NULL,
    ADD COLUMN `cs_confidence` DOUBLE NULL,
    ADD COLUMN `cs_jobs_2023` INTEGER NULL,
    ADD COLUMN `cs_jobs_2024` INTEGER NULL,
    ADD COLUMN `cs_jobs_2025` INTEGER NULL,
    ADD COLUMN `cs_jobs_2026` INTEGER NULL,
    ADD COLUMN `cs_jobs_total` INTEGER NULL,
    ADD COLUMN `cs_recruit_total` INTEGER NULL,
    ADD COLUMN `cs_region_top3` VARCHAR(120) NULL,
    ADD COLUMN `cs_sc_jobs_2026` INTEGER NULL,
    ADD COLUMN `cs_system_top3` VARCHAR(300) NULL,
    ADD COLUMN `cs_trend_delta` INTEGER NULL,
    ADD COLUMN `cs_trend_label` VARCHAR(20) NULL,
    ADD COLUMN `cs_year` SMALLINT NULL;

