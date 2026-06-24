# 2026 数据上线 Runbook（子项目 D）

按序执行，每步带**校验门**——通过才进下一步。多数运维脚本不在 deploy 自动化里、纯手动 SSH，**漏一步就出事**（卡片旧数 / 中外合作失效 / 征集不可见），本手册就是防漏的清单。

> 远端：`ssh -i cube.pem ubuntu@132.232.245.53`；仓库 `/home/ubuntu/apps/volunteer-helper`；DB `volunteer_helper`(mysql root)；服务 PM2 vh-server:3003 / vh-web:3004 / vh-ocr:8100。生产无 ts-node，脚本用 `pnpm ts-node` 或 `npx tsx`，SQL 用 `mysql` CLI。

## 阶段 0 · 前置（不满足不许往下）

- [ ] **代码已部署**：子项目 A（sourceYear 解耦）+ C（征集字段）+ B 脚本已上生产。**硬顺序：A 必须先于"导入 2026 计划"上线**，否则导入瞬间生成页全组无史线。
- [ ] **DB 备份**：`bash scripts/backup-db.sh`（import_to_db replace 模式会先 deleteMany/TRUNCATE 重建 universities/majors/enrollment/admission/supplementary，不可逆，先备份）。
- [ ] **补缺失院校**：B 的 converter 报告了 **103 个院校代码**在 `院校信息表.xlsx` 缺失（2026 新增/改名校）。把这些校补进院校信息表，否则其专业行入库被 skip。
  - 复核：`python scripts/data-processing/xlsx_to_json_2026.py --out-dir=/tmp/c26` 看输出末尾"院校代码 未命中"清单应为 0 或可接受。
- [ ] **2026 外部数据是否到位**（7 月）：①2026 一分一段表；②四川 2026 高考报名/实考人数。**两者缺任一**：score↔rank 换算 / 预估位次只能用 2025 代理池，生成页会显示 E 的"基于 2025 历史线预测"提示——可接受地降级上线，但要知会老师。

## 阶段 1 · 基准数据（位次/分换算的底座，先于主数据）

1. **一分一段 → score_segments**（需 2026 一分一段 xlsx）
   - `cd apps/server && pnpm ts-node scripts/etl-score-segments.ts --xlsx=<2026一分一段.xlsx>`（默认源写死到 2025，必须传新文件）
   - 校验：`mysql ... -e "SELECT year,exam_type,COUNT(*) FROM score_segments WHERE year=2026 GROUP BY exam_type"` → 物理/历史两行、非空。
2. **报名/实考 → province_year_stats**（需先在 `scripts/fetch-province-stats/seed-data.ts` 补 2026 行，现硬编码止于 2025）
   - `cd apps/server && pnpm ts-node scripts/seed-province-stats.ts`
   - 校验：`SELECT * FROM province_year_stats WHERE year=2026`。
3. **预估位次 → rank_predictions**（config/rank-prediction.json 已 2026）
   - `cd apps/server && pnpm ts-node scripts/etl-predict-rank.ts`
   - 校验：`SELECT COUNT(*) FROM rank_predictions WHERE target_year=2026` > 0。池子缺 2026 时会退 2025 代理（质量打折，日志会提示）。

## 阶段 2 · 主数据（计划 + 录取 + 院校 + 专业）

4. **产 JSON**：`python scripts/data-processing/xlsx_to_json_2026.py --out-dir=scripts/data-processing/output_2026`
   - 校验产出计数：enrollment_plans year=2026 ≈ 51878；2025/2024/2023 ≈ 36772/30746/28823；院校未命中清单已在阶段 0 处理。
5. **入库**：`cd apps/server && npx tsx ../../scripts/data-processing/import_to_db.ts --data=../../scripts/data-processing/output_2026`
   - ⚠️ 默认 `replace` 模式全量重建。也可 `--mode=upsert` 增量。
   - 校验：
     - `SELECT year,COUNT(*),SUM(group_plan_count IS NULL) FROM enrollment_plans GROUP BY year` → **2026 行存在、group_plan_count 非空**（不是旧库 2024/2023 那种全 NULL）。
     - `SELECT year,COUNT(*) FROM admission_records GROUP BY year` → 2025/2024/2023 有数。
     - import 日志 `skipped` 计数应接近 0（大量 skip = 院校未命中，回阶段 0）。

## 阶段 3 · 收尾（顺序敏感，全手动，最易漏）

6. **中外合作回填**：`mysql ... volunteer_helper < apps/server/scripts/backfill-sino-foreign.sql`
   - 必跑——import 把 `is_sino_foreign` 重置为 0；不跑则中外合作筛选/开关/标签全失效。
   - 校验：`SELECT SUM(is_sino_foreign) FROM enrollment_plans WHERE year=2026` > 0（≈ 含中外合作标记的行数）。
7. **物化在川统计**：`cd apps/server && pnpm ts-node scripts/materialize-major-sichuan-stats.ts`
   - 不在 deploy/package.json 里、只在记忆里，**极易漏**；不跑则专业/院校卡显旧数。
   - 校验：`SELECT COUNT(*) FROM majors WHERE sc_plan_count IS NOT NULL` 较导入前增长。
8. **批次资格种子**（若改过种子）：`cd apps/server && pnpm seed:eligibility`（幂等）。
9. **清 Redis**：`redis-cli --scan --pattern 'cache:university:*' | xargs redis-cli del`；同样清 `cache:enroll-level:*`。（RedisService 自动加 `cache:` 前缀。）
10. **重启**：`pm2 restart vh-server`（刷进程内候选缓存 + sino-foreign 候选缓存）。

## 阶段 4 · 验收（人工，对照"上线效果"）

- [ ] 打开一个 2026 学生的方案生成页：
  - 有候选、有冲稳保梯度（**不是全组无史线**）——A 解耦生效，用 2025 线预测。
  - 顶部显示 **E 的提示**"录取参考线与位次换算基于 2025 年历史数据预测"（当 2026 录取线未出时）。
  - 分数双滑块可用（scoreSegmentYear 命中 2025/2026 段表）。
  - 卡片"招生总计划"无 -5524 式虚高（previousPlanCount 只信 group_plan_count）。
- [ ] 抽查中外合作筛选/标签有数；抽查征集捡漏对候选卡可见（groupCode 已写）。
- [ ] `sanity-check`：`pnpm ts-node scripts/sanity-check-current-predictions.ts`（2026 录取闭环后把 REFERENCE_YEAR 改 2026）。

## 回滚

- 入库出错：从阶段 0 的备份恢复 DB（`mysql ... < backup.sql`），重启服务。
- 代码出错：`git revert` 对应提交 → 重新 deploy。

## 相关
设计/计划：`docs/superpowers/specs|plans/2026-*`。记忆：[[golive_2026_pipeline_gap]] [[sourceyear_coupling_blocker]] [[deploy_workflow]] [[post_deploy_clear_cache]] [[major_sichuan_stats_materialize]]。
