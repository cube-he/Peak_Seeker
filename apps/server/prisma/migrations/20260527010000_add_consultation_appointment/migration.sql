CREATE TABLE `consultation_appointments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `student_id` INTEGER NOT NULL,
    `teacher_id` INTEGER NOT NULL,
    `scheduled_at` DATETIME(3) NOT NULL,
    `duration_est` INTEGER NULL,
    `duration_act` INTEGER NULL,
    `channel` VARCHAR(20) NOT NULL,
    `purpose` VARCHAR(50) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    `notes` TEXT NULL,
    `started_at` DATETIME(3) NULL,
    `ended_at` DATETIME(3) NULL,

    INDEX `consultation_appointments_student_id_scheduled_at_idx`(`student_id`, `scheduled_at`),
    INDEX `consultation_appointments_teacher_id_scheduled_at_idx`(`teacher_id`, `scheduled_at`),
    INDEX `consultation_appointments_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `consultation_appointments`
  ADD CONSTRAINT `consultation_appointments_student_id_fkey`
  FOREIGN KEY (`student_id`) REFERENCES `student_profiles`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `consultation_appointments`
  ADD CONSTRAINT `consultation_appointments_teacher_id_fkey`
  FOREIGN KEY (`teacher_id`) REFERENCES `teacher_profiles`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
