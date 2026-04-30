-- CreateTable: timeline_events for gaokao progress tracking
CREATE TABLE `timeline_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `key` VARCHAR(30) NOT NULL,
    `name` VARCHAR(30) NOT NULL,
    `status` VARCHAR(30) NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `start_date` DATETIME(3) NULL,
    `end_date` DATETIME(3) NULL,
    `detail` JSON NULL,
    `source_url` VARCHAR(500) NULL,
    `year` INTEGER NOT NULL,

    UNIQUE INDEX `timeline_events_key_year_key`(`key`, `year`),
    INDEX `timeline_events_year_idx`(`year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
