# DEPRECATED — 勿用此目录入库

`scripts/import-data/`（`index.ts` / `generate-sql.ts`）是**废弃的旧入库路径**，勿再使用。

## 为什么废弃

- 用旧的 **4 字段唯一键** `universityId_majorId_year_province`，与现 Prisma schema 的 **8 字段自然主键**（`universityId, subjects, batch, recruitType, groupCode, majorCode, majorName, year`）不符 —— 跑会因 where 子句对不上 client 报错，或塌缩丢行。
- `index.ts` **不写 group_plan_count**（每行只写 plan_count），会重现"招生计划变动虚高"缺陷。
- 按硬编码列号读 xlsx，对任何当前主表（71/86 列）都错位。

## 唯一正确的入库路径（source of truth）

```
Python converter → JSON → scripts/data-processing/import_to_db.ts (8 字段全键, replace 模式) → MySQL
```

- 2026 数据：`scripts/data-processing/xlsx_to_json_2026.py`（按列名读 86 列主表，产 enrollment_plans 2026+历史 / admission_records / majors）。
- 院校：`scripts/data-processing/xlsx_to_json.py` 的 `convert_universities`（读 院校信息表.xlsx）。
- 远端执行：`scripts/data-processing/deploy_data.py`。

详见 `docs/superpowers/specs/2026-06-24-86col-converter-design.md`。
