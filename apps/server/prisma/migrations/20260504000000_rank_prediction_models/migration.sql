-- CreateTable
CREATE TABLE `province_year_stats` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `province` VARCHAR(50) NOT NULL,
    `year` SMALLINT NOT NULL,
    `exam_type` VARCHAR(50) NOT NULL,
    `registrants` INTEGER NULL,
    `examinees_actual` INTEGER NULL,
    `ranked_count` INTEGER NULL,
    `source` VARCHAR(500) NOT NULL,
    `fetched_date` DATETIME(3) NOT NULL,
    `notes` TEXT NULL,

    INDEX `province_year_stats_year_idx`(`year`),
    UNIQUE INDEX `province_year_stats_province_year_exam_type_key`(`province`, `year`, `exam_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rank_predictions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `university_id` INTEGER NOT NULL,
    `group_code` VARCHAR(50) NOT NULL,
    `batch` VARCHAR(50) NOT NULL,
    `recruit_type` VARCHAR(100) NOT NULL,
    `subjects` VARCHAR(50) NOT NULL,
    `target_year` SMALLINT NOT NULL,
    `point_rank` INTEGER NULL,
    `conservative_rank` INTEGER NULL,
    `optimistic_rank` INTEGER NULL,
    `basis_years` JSON NOT NULL,
    `confidence` VARCHAR(20) NOT NULL,
    `computed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `rank_predictions_target_year_subjects_idx`(`target_year`, `subjects`),
    UNIQUE INDEX `rank_pred_natural_key`(`university_id`, `group_code`, `batch`, `recruit_type`, `subjects`, `target_year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `rank_predictions` ADD CONSTRAINT `rank_predictions_university_id_fkey` FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
