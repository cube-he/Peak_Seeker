-- P2 院校增强: 历年排名 (新表) + 满意度 1-5 星分布 / 网络满意度 (universities 加列)
-- 数据源: data/03_专家版主表/output/院校全量数据_多Sheet.xlsx
--   - 03_历年排名 (4293 行) -> university_rankings 新表
--   - 04_院校满意度 (3835 行) -> universities 新列

-- ============ universities 新增满意度细分字段 ============
ALTER TABLE `universities`
  ADD COLUMN `satisfaction_distribution` JSON NULL,
  ADD COLUMN `satisfaction_online_overall` DOUBLE NULL,
  ADD COLUMN `satisfaction_online_overall_count` INTEGER NULL,
  ADD COLUMN `satisfaction_online_life` DOUBLE NULL,
  ADD COLUMN `satisfaction_online_life_count` INTEGER NULL,
  ADD COLUMN `satisfaction_online_environ` DOUBLE NULL,
  ADD COLUMN `satisfaction_online_environ_count` INTEGER NULL;

-- ============ 新建 university_rankings 表 ============
CREATE TABLE `university_rankings` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `university_id` INTEGER NOT NULL,

  `year` SMALLINT NOT NULL,
  `list_name` VARCHAR(50) NOT NULL,
  `category` VARCHAR(50) NOT NULL,

  `rank_value` INTEGER NULL,
  `rank_text` VARCHAR(50) NULL,
  `world_rank` VARCHAR(50) NULL,
  `national_ref_rank` INTEGER NULL,
  `score` DECIMAL(8, 2) NULL,

  `detailed_scores` JSON NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `university_rankings_university_id_year_list_name_category_key`
    (`university_id`, `year`, `list_name`, `category`),
  INDEX `university_rankings_university_id_idx` (`university_id`),
  INDEX `university_rankings_year_idx` (`year`),
  INDEX `university_rankings_list_name_idx` (`list_name`),

  CONSTRAINT `university_rankings_university_id_fkey`
    FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
