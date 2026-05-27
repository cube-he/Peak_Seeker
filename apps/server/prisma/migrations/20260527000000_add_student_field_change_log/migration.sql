-- CreateTable
CREATE TABLE `student_field_change_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `student_id` INTEGER NOT NULL,
    `changed_by_id` INTEGER NOT NULL,
    `actor` VARCHAR(20) NOT NULL,
    `field_key` VARCHAR(100) NOT NULL,
    `old_value` TEXT NULL,
    `new_value` TEXT NULL,

    INDEX `student_field_change_logs_student_id_created_at_idx`(`student_id`, `created_at`),
    INDEX `student_field_change_logs_field_key_idx`(`field_key`),
    INDEX `student_field_change_logs_changed_by_id_idx`(`changed_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `student_field_change_logs`
  ADD CONSTRAINT `student_field_change_logs_student_id_fkey`
  FOREIGN KEY (`student_id`) REFERENCES `student_profiles`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_field_change_logs`
  ADD CONSTRAINT `student_field_change_logs_changed_by_id_fkey`
  FOREIGN KEY (`changed_by_id`) REFERENCES `users`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
