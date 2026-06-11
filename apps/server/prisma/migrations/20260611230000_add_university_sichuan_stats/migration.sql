-- 院校在川招录统计物化列 (apps/server/scripts/materialize-major-sichuan-stats.ts 全量重算)
ALTER TABLE `universities`
  ADD COLUMN `sc_plan_count` INT NULL,
  ADD COLUMN `sc_group_count` INT NULL,
  ADD COLUMN `sc_batches` VARCHAR(300) NULL,
  ADD COLUMN `sc_suppl_count` INT NULL;
