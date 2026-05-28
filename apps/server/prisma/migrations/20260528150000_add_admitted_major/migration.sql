-- 学生录取专业 (录取凭证截图来源)
ALTER TABLE `student_admission_results`
  ADD COLUMN `admitted_major_group_code` VARCHAR(10) NULL,
  ADD COLUMN `admitted_major_code`       VARCHAR(10) NULL,
  ADD COLUMN `admitted_major_name`       VARCHAR(200) NULL;
