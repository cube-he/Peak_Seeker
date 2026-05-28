ALTER TABLE `student_admission_results`
  ADD COLUMN `admitted_major_id` INTEGER NULL;

CREATE INDEX `student_admission_results_admitted_major_id_idx`
  ON `student_admission_results`(`admitted_major_id`);
