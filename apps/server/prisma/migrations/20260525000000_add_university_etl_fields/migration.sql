-- AlterTable
ALTER TABLE `universities`
    ADD COLUMN `first_class_category` VARCHAR(50) NULL,
    ADD COLUMN `has_grad_school` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `has_recommend_qualification` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_101_plan` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_qiangji` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `website` VARCHAR(500) NULL,
    ADD COLUMN `admission_website` VARCHAR(500) NULL,
    ADD COLUMN `admission_phone` VARCHAR(200) NULL,
    ADD COLUMN `admission_email` VARCHAR(200) NULL,
    ADD COLUMN `city_tier` VARCHAR(20) NULL,
    ADD COLUMN `university_tier` VARCHAR(50) NULL,
    ADD COLUMN `university_background` VARCHAR(50) NULL,
    ADD COLUMN `first_class_discipline_count` INTEGER NULL,
    ADD COLUMN `national_feature_major_count` INTEGER NULL,
    ADD COLUMN `national_key_discipline_count` INTEGER NULL,
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `heat_score` INTEGER NULL,
    ADD COLUMN `banner_url` VARCHAR(500) NULL,
    ADD COLUMN `ranking_times` INTEGER NULL;

-- CreateIndex
CREATE INDEX `universities_heat_score_idx` ON `universities`(`heat_score`);

-- CreateIndex
CREATE INDEX `universities_ranking_alumni_idx` ON `universities`(`ranking_alumni`);

-- CreateIndex
CREATE INDEX `universities_ranking_qs_idx` ON `universities`(`ranking_qs`);

-- CreateIndex
CREATE INDEX `universities_ranking_us_news_idx` ON `universities`(`ranking_us_news`);

-- CreateIndex
CREATE INDEX `universities_ranking_times_idx` ON `universities`(`ranking_times`);

-- CreateIndex
CREATE INDEX `universities_a_class_discipline_count_idx` ON `universities`(`a_class_discipline_count`);

-- CreateIndex
CREATE INDEX `universities_first_class_discipline_count_idx` ON `universities`(`first_class_discipline_count`);
