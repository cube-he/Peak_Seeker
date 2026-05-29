-- 专业「增设年份」字段：用于在专业详情页标识新兴专业
-- 数据来自 01_专业字典 的「增设年份」列（教育部 2024/2025/2026 本科专业目录）
-- 由 import-major-p3.ts 按专业名称回填

ALTER TABLE `majors`
  ADD COLUMN `setup_year` SMALLINT NULL;
