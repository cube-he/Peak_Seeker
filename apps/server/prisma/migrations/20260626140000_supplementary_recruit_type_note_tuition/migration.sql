-- 征集表补列: 招生类型 / 专业备注 / 学费
-- 候选征集匹配从「批次族」升级为「批次族+招生类型」对齐(跨年), 需原始招生类型;
-- 专业备注/学费用于同名专业变体兜底区分。数据由 import-supplementary-xlsx.ts 从总合并表重导回填。
ALTER TABLE `supplementary_records`
  ADD COLUMN `recruit_type` VARCHAR(100) NULL,
  ADD COLUMN `major_note` TEXT NULL,
  ADD COLUMN `tuition` INT NULL;
