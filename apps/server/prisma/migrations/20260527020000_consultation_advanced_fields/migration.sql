ALTER TABLE `consultation_appointments`
  ADD COLUMN `created_by_actor` VARCHAR(20) NOT NULL DEFAULT 'teacher',
  ADD COLUMN `queue_number` INTEGER NULL,
  ADD COLUMN `queued_at` DATETIME(3) NULL,
  ADD COLUMN `called_at` DATETIME(3) NULL;

CREATE INDEX `consultation_appointments_teacher_id_scheduled_at_queue_number_idx`
  ON `consultation_appointments`(`teacher_id`, `scheduled_at`, `queue_number`);
