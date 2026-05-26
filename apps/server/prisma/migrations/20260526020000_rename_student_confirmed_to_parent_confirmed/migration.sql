-- Step 1: 给 status 列加上新的 enum value (保留旧 value 以便迁移期间数据可读写)
ALTER TABLE `volunteer_plans`
  MODIFY COLUMN `status` ENUM(
    'DRAFT',
    'PENDING_REVIEW',
    'REVIEWING',
    'APPROVED',
    'STUDENT_CONFIRMED',
    'PARENT_CONFIRMED',
    'REJECTED',
    'FINALIZED',
    'PUBLISHED',
    'OUTDATED'
  ) NOT NULL DEFAULT 'DRAFT';

-- Step 2: 迁移已有数据
UPDATE `volunteer_plans` SET `status` = 'PARENT_CONFIRMED' WHERE `status` = 'STUDENT_CONFIRMED';

-- Step 3: 删除旧 enum value
ALTER TABLE `volunteer_plans`
  MODIFY COLUMN `status` ENUM(
    'DRAFT',
    'PENDING_REVIEW',
    'REVIEWING',
    'APPROVED',
    'PARENT_CONFIRMED',
    'REJECTED',
    'FINALIZED',
    'PUBLISHED',
    'OUTDATED'
  ) NOT NULL DEFAULT 'DRAFT';

-- Step 4: 重命名 3 个字段(数据自动跟随)
ALTER TABLE `volunteer_plans`
  CHANGE COLUMN `student_confirmed_at` `parent_confirmed_at` DATETIME(3) NULL;

ALTER TABLE `volunteer_plans`
  CHANGE COLUMN `student_change_requested_at` `parent_change_requested_at` DATETIME(3) NULL;

ALTER TABLE `volunteer_plans`
  CHANGE COLUMN `student_change_request` `parent_change_request` TEXT NULL;
