-- 四川招录统计物化列第二批: 科类计划人数 / 特殊招生形式 / 征集计划
-- (apps/server/scripts/materialize-major-sichuan-stats.ts 全量重算)
ALTER TABLE `majors`
  ADD COLUMN `sc_phy_plan_count` INT NULL,
  ADD COLUMN `sc_his_plan_count` INT NULL,
  ADD COLUMN `sc_recruit_types` VARCHAR(500) NULL,
  ADD COLUMN `sc_suppl_count` INT NULL;
