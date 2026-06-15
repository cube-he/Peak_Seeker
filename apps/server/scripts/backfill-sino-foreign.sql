-- 回填 enrollment_plans.is_sino_foreign（中外合作办学标记）
--
-- 背景：中外合作的信号在 plan_notes（专业备注，如"专业备注：(中外合作办学)..."），
-- 但原始导入从未据此置位 is_sino_foreign → 整列全为 0，导致生成页"中外合作"筛选、
-- 资料页"是否接受中外合作"开关、候选卡"中外"标签全部失效。
--
-- 幂等：按 plan_notes 重算整列（命中→1，否则→0）。**每次重导 enrollment_plans 后必跑**，
-- 否则导入会把该列重置回 0。
--
-- 匹配口径（已对 2025 全量数据核对，见 docs/.../specs 2026-06-15 调查）：
--   含"中外合作"，但排除两类显式否定：
--     · (不含：中外合作办学)  —— 普通专业，备注声明不含中外合作
--     · (中外合作办学，专业除外) / (中外合作办学,专业除外)
--   注："中外人文交流/校际交流/学生交流计划"等不含"中外合作"，本就不会命中。
-- IFNULL 兜底 plan_notes 为 NULL 的行（否则布尔表达式得 NULL，写 NOT NULL 列会报错）。
--
-- 运行（生产，无 ts-node 故用 mysql CLI；密码走 MYSQL_PWD 不回显）：
--   MYSQL_PWD=<pwd> mysql -h <host> -u <user> <db> < apps/server/scripts/backfill-sino-foreign.sql
UPDATE enrollment_plans
SET is_sino_foreign = IFNULL((
  plan_notes LIKE '%中外合作%'
  AND plan_notes NOT LIKE '%不含%中外合作%'
  AND plan_notes NOT LIKE '%中外合作办学，专业除外%'
  AND plan_notes NOT LIKE '%中外合作办学,专业除外%'
), 0);
