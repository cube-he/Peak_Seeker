CREATE TABLE `plan_item_risks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `plan_item_id` INTEGER NOT NULL,
    `rule_code` VARCHAR(50) NOT NULL,
    `severity` VARCHAR(20) NOT NULL,
    `category` VARCHAR(20) NOT NULL,
    `message` TEXT NOT NULL,
    `detail` JSON NULL,
    `resolved_at` DATETIME(3) NULL,
    `resolution` VARCHAR(20) NULL,
    `resolver_note` VARCHAR(500) NULL,
    `resolved_by_id` INTEGER NULL,

    INDEX `plan_item_risks_plan_item_id_severity_idx`(`plan_item_id`, `severity`),
    INDEX `plan_item_risks_rule_code_idx`(`rule_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `plan_item_risks`
  ADD CONSTRAINT `plan_item_risks_plan_item_id_fkey`
  FOREIGN KEY (`plan_item_id`) REFERENCES `plan_items`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `plan_item_risks`
  ADD CONSTRAINT `plan_item_risks_resolved_by_id_fkey`
  FOREIGN KEY (`resolved_by_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
