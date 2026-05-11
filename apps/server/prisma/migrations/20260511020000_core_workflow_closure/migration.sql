-- Extend student intake and plan lifecycle workflow.

ALTER TABLE `student_profiles`
  ADD COLUMN `intake_status` ENUM('DRAFT', 'SUBMITTED', 'NEEDS_CHANGES', 'VERIFIED') NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN `intake_submitted_at` DATETIME(3) NULL,
  ADD COLUMN `intake_reviewed_at` DATETIME(3) NULL,
  ADD COLUMN `intake_reviewed_by` INTEGER NULL,
  ADD COLUMN `intake_review_comment` TEXT NULL;

ALTER TABLE `volunteer_plans`
  MODIFY `status` ENUM('DRAFT', 'PENDING_REVIEW', 'REVIEWING', 'APPROVED', 'STUDENT_CONFIRMED', 'REJECTED', 'FINALIZED', 'PUBLISHED', 'OUTDATED') NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN `student_confirmed_at` DATETIME(3) NULL,
  ADD COLUMN `student_change_requested_at` DATETIME(3) NULL,
  ADD COLUMN `student_change_request` TEXT NULL;

ALTER TABLE `plan_reviews`
  MODIFY `reviewer_role` ENUM('TEACHER', 'SUPERVISOR', 'STUDENT') NOT NULL,
  MODIFY `action` ENUM('APPROVE', 'REJECT', 'REQUEST_CHANGE', 'COMMENT', 'STUDENT_CONFIRM', 'STUDENT_REQUEST_CHANGE') NOT NULL;

ALTER TABLE `plan_items`
  ADD COLUMN `override_soft_fail` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `soft_fail_reasons` JSON NULL,
  ADD COLUMN `override_reason` VARCHAR(500) NULL;

CREATE INDEX `student_profiles_intake_status_idx` ON `student_profiles`(`intake_status`);
