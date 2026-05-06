-- CreateTable
CREATE TABLE `university_campus_facilities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `campus_id` INTEGER NOT NULL,
    `category` VARCHAR(30) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `latitude` DECIMAL(9, 6) NOT NULL,
    `longitude` DECIMAL(9, 6) NOT NULL,
    `address` VARCHAR(500) NULL,
    `amap_id` VARCHAR(50) NOT NULL,
    `typecode` VARCHAR(100) NOT NULL,
    `distance_meters` INTEGER NOT NULL,
    `confidence` VARCHAR(10) NOT NULL,
    `match_method` VARCHAR(30) NOT NULL,
    `source` VARCHAR(30) NOT NULL DEFAULT 'amap_text',
    `fetched_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `obsolete` BOOLEAN NOT NULL DEFAULT false,

    INDEX `university_campus_facilities_campus_id_category_idx`(`campus_id`, `category`),
    INDEX `university_campus_facilities_category_confidence_idx`(`category`, `confidence`),
    UNIQUE INDEX `university_campus_facilities_campus_id_amap_id_key`(`campus_id`, `amap_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `university_campus_facilities` ADD CONSTRAINT `university_campus_facilities_campus_id_fkey` FOREIGN KEY (`campus_id`) REFERENCES `university_campuses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
