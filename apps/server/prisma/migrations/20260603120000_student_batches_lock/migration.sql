-- Student batch lock state: 商业化流程要求学生填资料阶段选定批次后锁定, 老师可解锁
-- 见 docs/superpowers/specs/2026-06-02-batch-selection-at-intake-design.md § 三

ALTER TABLE `student_profiles`
  ADD COLUMN `batches_confirmed_at` DATETIME(3) NULL,
  ADD COLUMN `batches_unlocked_by` INT NULL,
  ADD COLUMN `batches_unlocked_at` DATETIME(3) NULL;
