-- 客观纯净度表：按 (year, province, universityId, groupCode, batch, subjects) 维度
-- 与 PlanItem.cleanliness（主观，按学生偏好）正交
-- 见 apps/server/src/modules/group-purity/group-purity.service.ts

CREATE TABLE `group_purities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `year` SMALLINT NOT NULL,
    `province` VARCHAR(50) NOT NULL,
    `university_id` INTEGER NOT NULL,
    `group_code` VARCHAR(50) NOT NULL,
    `batch` VARCHAR(50) NOT NULL,
    `subjects` VARCHAR(50) NOT NULL,
    `level` VARCHAR(2) NOT NULL,
    `major_count` INTEGER NOT NULL,
    `dominant_category` VARCHAR(100) NULL,
    `dominant_category_ratio` DOUBLE NOT NULL,
    `dominant_discipline` VARCHAR(100) NULL,
    `dominant_discipline_ratio` DOUBLE NOT NULL,
    `cross_category_count` INTEGER NOT NULL,
    `has_foreign` BOOLEAN NOT NULL DEFAULT false,
    `mixed_foreign` BOOLEAN NOT NULL DEFAULT false,
    `reasons` JSON NULL,

    UNIQUE INDEX `group_purity_natural_key`(`year`, `province`, `university_id`, `group_code`, `batch`, `subjects`),
    INDEX `group_purities_year_province_idx`(`year`, `province`),
    INDEX `group_purities_university_id_idx`(`university_id`),
    INDEX `group_purities_level_idx`(`level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
