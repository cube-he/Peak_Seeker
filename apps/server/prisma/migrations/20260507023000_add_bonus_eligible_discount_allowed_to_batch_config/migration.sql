-- AlterTable
ALTER TABLE `batch_configs`
  ADD COLUMN `bonus_eligible` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN `discount_allowed` INT NOT NULL DEFAULT 0;
