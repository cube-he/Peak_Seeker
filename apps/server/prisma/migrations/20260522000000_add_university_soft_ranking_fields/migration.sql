-- AlterTable
ALTER TABLE `universities` ADD COLUMN `soft_rank_list` VARCHAR(20) NULL,
    ADD COLUMN `soft_category` VARCHAR(50) NULL,
    ADD COLUMN `soft_category_rank` INTEGER NULL,
    ADD COLUMN `soft_rank_year` SMALLINT NULL;

-- CreateIndex
CREATE INDEX `universities_soft_ranking_idx` ON `universities`(`soft_ranking`);
