-- 专业热度 TOP50 榜单字段（2025 本科热度），仅上榜专业有值
-- 见 docs/superpowers/specs/2026-06-07-major-popularity-top50-design.md
ALTER TABLE `majors`
    ADD COLUMN `popularity_rank` INTEGER NULL,
    ADD COLUMN `popularity_heat` INTEGER NULL,
    ADD COLUMN `popularity_year` SMALLINT NULL;
