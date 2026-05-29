-- P3 专业增强: 专业字典扩展 (01_专业字典) + 薪酬就业 (02_专业薪酬就业) + 4 维满意度
-- 数据源: data/03_专家版主表/output/专业全量数据_多Sheet.xlsx
-- 导入脚本: scripts/import-major-p3.ts

ALTER TABLE `majors`
  -- 专业字典扩展
  ADD COLUMN `first_impression` VARCHAR(500) NULL,
  ADD COLUMN `elective_advice` VARCHAR(200) NULL,
  ADD COLUMN `what_is` TEXT NULL,
  ADD COLUMN `what_study` TEXT NULL,
  ADD COLUMN `what_do` TEXT NULL,
  ADD COLUMN `employment_prospects` TEXT NULL,
  ADD COLUMN `similar_majors` JSON NULL,
  ADD COLUMN `training_objective` TEXT NULL,
  ADD COLUMN `training_requirements` TEXT NULL,
  ADD COLUMN `discipline_req` TEXT NULL,
  ADD COLUMN `knowledge_ability` TEXT NULL,
  ADD COLUMN `famous_people` JSON NULL,
  ADD COLUMN `internship_desc` TEXT NULL,
  ADD COLUMN `professional_certs` JSON NULL,
  ADD COLUMN `post_upgrade_direction` TEXT NULL,
  -- 满意度 4 维
  ADD COLUMN `satisfaction_overall_count` INTEGER NULL,
  ADD COLUMN `satisfaction_teaching` DOUBLE NULL,
  ADD COLUMN `satisfaction_teaching_count` INTEGER NULL,
  ADD COLUMN `satisfaction_condition` DOUBLE NULL,
  ADD COLUMN `satisfaction_condition_count` INTEGER NULL,
  ADD COLUMN `satisfaction_employment` DOUBLE NULL,
  ADD COLUMN `satisfaction_employment_count` INTEGER NULL,
  -- 薪酬就业
  ADD COLUMN `historical_salary` JSON NULL,
  ADD COLUMN `salary_distribution` JSON NULL,
  ADD COLUMN `experience_distribution` JSON NULL,
  ADD COLUMN `education_distribution` JSON NULL,
  ADD COLUMN `region_distribution` JSON NULL,
  ADD COLUMN `industry_distribution` JSON NULL,
  ADD COLUMN `position_top` JSON NULL,
  ADD COLUMN `top_region` VARCHAR(50) NULL,
  ADD COLUMN `top_industry` VARCHAR(100) NULL,
  ADD COLUMN `employment_ranking` VARCHAR(50) NULL,
  ADD COLUMN `employment_ranking_desc` TEXT NULL,
  ADD COLUMN `employment_direction_desc` TEXT NULL,
  ADD COLUMN `year_salary_map` JSON NULL;
