-- 四川招录统计物化列 (scripts/materialize-major-sichuan-stats.ts 全量重算)
-- 列表页填报指标: 最新计划年的在川计划规模 + 各院校最低分/位次的跨校范围
ALTER TABLE `majors`
  ADD COLUMN `sc_plan_count` INT NULL,
  ADD COLUMN `sc_plan_unis` INT NULL,
  ADD COLUMN `sc_plan_year` SMALLINT NULL,
  ADD COLUMN `sc_batches` VARCHAR(300) NULL,
  ADD COLUMN `sc_score_year` SMALLINT NULL,
  ADD COLUMN `sc_phy_score_lo` INT NULL,
  ADD COLUMN `sc_phy_score_hi` INT NULL,
  ADD COLUMN `sc_phy_rank_lo` INT NULL,
  ADD COLUMN `sc_phy_rank_hi` INT NULL,
  ADD COLUMN `sc_his_score_lo` INT NULL,
  ADD COLUMN `sc_his_score_hi` INT NULL,
  ADD COLUMN `sc_his_rank_lo` INT NULL,
  ADD COLUMN `sc_his_rank_hi` INT NULL;
