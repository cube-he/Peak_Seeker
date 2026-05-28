-- 历史档案标记
ALTER TABLE `student_profiles`
  ADD COLUMN `is_archived` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `student_profiles_is_archived_exam_year_idx`
  ON `student_profiles`(`is_archived`, `exam_year`);

ALTER TABLE `volunteer_plans`
  ADD COLUMN `is_historical` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `volunteer_plans_is_historical_idx`
  ON `volunteer_plans`(`is_historical`);

-- 学生录取结果 (1:1 student_profile)
CREATE TABLE `student_admission_results` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `student_id` INTEGER NOT NULL,
  `admitted_uni_name` VARCHAR(200) NOT NULL,
  `admitted_uni_id` INTEGER NULL,
  `admitted_min_score` SMALLINT NULL,
  `admitted_min_rank` INTEGER NULL,
  `score_diff` SMALLINT NULL,
  `sequence_no` SMALLINT NULL,
  `proof_attachment_id` INTEGER NULL,
  `batch_name` VARCHAR(100) NULL,
  UNIQUE INDEX `student_admission_results_student_id_key`(`student_id`),
  INDEX `student_admission_results_admitted_uni_id_idx`(`admitted_uni_id`),
  INDEX `student_admission_results_batch_name_idx`(`batch_name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `student_admission_results`
  ADD CONSTRAINT `student_admission_results_student_id_fkey`
  FOREIGN KEY (`student_id`) REFERENCES `student_profiles`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 学生附件 (1:N student_profile)
CREATE TABLE `student_attachments` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `student_id` INTEGER NOT NULL,
  `category` VARCHAR(40) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `storage_path` VARCHAR(500) NOT NULL,
  `mime_type` VARCHAR(100) NULL,
  `file_size` INTEGER NULL,
  `uploaded_by_id` INTEGER NULL,
  INDEX `student_attachments_student_id_category_idx`(`student_id`, `category`),
  INDEX `student_attachments_category_idx`(`category`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `student_attachments`
  ADD CONSTRAINT `student_attachments_student_id_fkey`
  FOREIGN KEY (`student_id`) REFERENCES `student_profiles`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
