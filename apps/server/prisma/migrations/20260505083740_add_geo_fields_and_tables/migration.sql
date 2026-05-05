-- AlterTable
ALTER TABLE `universities` ADD COLUMN `address` VARCHAR(500) NULL,
    ADD COLUMN `latitude` DECIMAL(9, 6) NULL,
    ADD COLUMN `longitude` DECIMAL(9, 6) NULL,
    ADD COLUMN `geo_status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    ADD COLUMN `geo_source` VARCHAR(50) NULL,
    ADD COLUMN `geo_updated_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `university_campuses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `university_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `is_main` BOOLEAN NOT NULL DEFAULT false,
    `province` VARCHAR(50) NULL,
    `city` VARCHAR(100) NULL,
    `district` VARCHAR(100) NULL,
    `address` VARCHAR(500) NULL,
    `latitude` DECIMAL(9, 6) NULL,
    `longitude` DECIMAL(9, 6) NULL,
    `geo_status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `geo_source` VARCHAR(50) NULL,
    `geo_updated_at` DATETIME(3) NULL,
    `distance_to_city_center` INTEGER NULL,
    `nearest_subway_meters` INTEGER NULL,
    `nearest_airport_km` DECIMAL(6, 2) NULL,
    `discovered_from` VARCHAR(50) NULL,

    UNIQUE INDEX `university_campuses_university_id_name_key`(`university_id`, `name`),
    INDEX `university_campuses_university_id_geo_status_idx`(`university_id`, `geo_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `university_campus_pois` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `campus_id` INTEGER NOT NULL,
    `amap_id` VARCHAR(50) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `category` VARCHAR(50) NOT NULL,
    `typecode` VARCHAR(20) NULL,
    `latitude` DECIMAL(9, 6) NOT NULL,
    `longitude` DECIMAL(9, 6) NOT NULL,
    `address` VARCHAR(500) NULL,
    `distance` INTEGER NOT NULL,
    `metadata` JSON NULL,
    `source` VARCHAR(50) NOT NULL DEFAULT 'amap_around',
    `fetched_at` DATETIME(3) NOT NULL,
    `obsolete` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `university_campus_pois_campus_id_amap_id_key`(`campus_id`, `amap_id`),
    INDEX `university_campus_pois_campus_id_category_distance_idx`(`campus_id`, `category`, `distance`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `university_geo_issues` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `university_id` INTEGER NOT NULL,
    `campus_id` INTEGER NULL,
    `issue_type` VARCHAR(50) NOT NULL,
    `detail` JSON NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `last_retry_at` DATETIME(3) NULL,
    `resolved_at` DATETIME(3) NULL,
    `resolved_by` VARCHAR(50) NULL,

    INDEX `university_geo_issues_university_id_idx`(`university_id`),
    INDEX `university_geo_issues_status_idx`(`status`),
    INDEX `university_geo_issues_issue_type_idx`(`issue_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `university_campuses` ADD CONSTRAINT `university_campuses_university_id_fkey` FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `university_campus_pois` ADD CONSTRAINT `university_campus_pois_campus_id_fkey` FOREIGN KEY (`campus_id`) REFERENCES `university_campuses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `university_geo_issues` ADD CONSTRAINT `university_geo_issues_university_id_fkey` FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
