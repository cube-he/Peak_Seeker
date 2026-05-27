-- CreateTable
CREATE TABLE `plan_review_drafts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `plan_id` INTEGER NOT NULL,
    `reviewer_id` INTEGER NOT NULL,
    `comment` TEXT NULL,
    `item_annotations` JSON NULL,

    INDEX `plan_review_drafts_plan_id_idx`(`plan_id`),
    UNIQUE INDEX `plan_review_drafts_plan_id_reviewer_id_key`(`plan_id`, `reviewer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `plan_review_drafts` ADD CONSTRAINT `plan_review_drafts_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `volunteer_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_review_drafts` ADD CONSTRAINT `plan_review_drafts_reviewer_id_fkey` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
