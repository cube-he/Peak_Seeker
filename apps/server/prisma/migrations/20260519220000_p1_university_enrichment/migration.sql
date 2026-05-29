-- P1 院校增强: 身份/资质标签 + 学科建设详情 + 招生章程结构化 + 就业流向
-- 数据源: data/03_专家版主表/output/院校全量数据_多Sheet.xlsx
-- 导入脚本: scripts/import-university-p1.ts
-- 注意: 全部为 nullable 或带默认值，向后兼容，不影响现有 universities 数据。

ALTER TABLE `universities`
  -- 身份/资质标签
  -- is_101_plan / is_qiangji / first_class_category 已由 master 后续 migration 加入, 此处跳过避免 duplicate column
  ADD COLUMN `has_graduate_school` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `has_postgrad_recommend` BOOLEAN NOT NULL DEFAULT false,
  -- 学科建设详情
  -- national_feature_major_count 已由 master 后续加入, 此处跳过
  ADD COLUMN `key_lab_count` INTEGER NULL,
  ADD COLUMN `double_first_class_subject_count` INTEGER NULL,
  ADD COLUMN `provincial_feature_major_count` INTEGER NULL,
  ADD COLUMN `discipline_evaluation_detail` JSON NULL,
  ADD COLUMN `national_feature_majors` JSON NULL,
  ADD COLUMN `provincial_feature_majors` JSON NULL,
  ADD COLUMN `double_first_class_majors` JSON NULL,
  -- 招生章程结构化
  ADD COLUMN `charter_filing_ratio` VARCHAR(200) NULL,
  ADD COLUMN `charter_major_assignment` TEXT NULL,
  ADD COLUMN `charter_tiebreak_rule` TEXT NULL,
  ADD COLUMN `charter_foreign_lang_req` TEXT NULL,
  ADD COLUMN `charter_subject_req` TEXT NULL,
  ADD COLUMN `charter_physical_limit` TEXT NULL,
  ADD COLUMN `charter_bonus_policy` TEXT NULL,
  ADD COLUMN `charter_tuition_desc` TEXT NULL,
  ADD COLUMN `charter_transfer_limit` TEXT NULL,
  ADD COLUMN `charter_accept_adjust` TEXT NULL,
  -- 就业流向
  ADD COLUMN `signing_region_flow` JSON NULL,
  ADD COLUMN `signing_unit_nature` JSON NULL,
  ADD COLUMN `main_employers` JSON NULL,
  ADD COLUMN `main_employers_note` TEXT NULL;
