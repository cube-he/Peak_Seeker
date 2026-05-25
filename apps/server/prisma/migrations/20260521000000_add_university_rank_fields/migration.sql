-- AlterTable
ALTER TABLE `universities` ADD COLUMN `min_score_physics` INTEGER NULL,
    ADD COLUMN `min_rank_physics` INTEGER NULL,
    ADD COLUMN `min_score_history` INTEGER NULL,
    ADD COLUMN `min_rank_history` INTEGER NULL,
    ADD COLUMN `pred_rank_physics` INTEGER NULL,
    ADD COLUMN `pred_rank_history` INTEGER NULL;

-- CreateIndex
CREATE INDEX `universities_min_rank_physics_idx` ON `universities`(`min_rank_physics`);

-- CreateIndex
CREATE INDEX `universities_min_rank_history_idx` ON `universities`(`min_rank_history`);

-- CreateIndex
CREATE INDEX `universities_pred_rank_physics_idx` ON `universities`(`pred_rank_physics`);

-- CreateIndex
CREATE INDEX `universities_pred_rank_history_idx` ON `universities`(`pred_rank_history`);
