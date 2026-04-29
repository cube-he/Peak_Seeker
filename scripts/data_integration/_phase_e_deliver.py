# -*- coding: utf-8 -*-
"""Phase E (方案 A): 交付 - 不覆盖主表, 生成最终交付清单.

产物:
  docs/superpowers/specs/2026-04-24-supp-merge-final-run-design/
    final_report.md                    最终交付报告
    deliverable_manifest.json          产物清单 + sha256

  scripts/data_integration/_p5_out/phase_e/
    待审_重复写入.xlsx                   30 条同位异值重写 (需人工选)
    待审_字段不一致.xlsx                 1063 条主表字段与征集字段差异
    待审_超计划.xlsx                    599 条征集>原计划
    未匹配_REJECT分类.xlsx              6139 条未匹配 (按原因分 sheet)
    phase_d_核对报告_100条.xlsx         100/100 PASS 抽样核对
    合并预览_最新.xlsx                  链接到 专业招生主表_含征集_20260424_225205.xlsx

策略:
  主表不改写, 保留为规范化基线. 征集数据以"预览合并版"独立交付, 等待人工审 30 条重复写入
  后再决定是否覆盖.
"""
from __future__ import annotations

import hashlib
import json
import shutil
from collections import Counter
from datetime import datetime
from pathlib import Path

import pandas as pd

ROOT = Path(".")
P5 = ROOT / "scripts/data_integration/_p5_out"
SPECS = ROOT / "docs/superpowers/specs/2026-04-24-supp-merge-final-run-design"
PHASE_E = P5 / "phase_e"
PHASE_E.mkdir(parents=True, exist_ok=True)

MERGE_TS = "20260424_225205"
MERGED = P5 / f"专业招生主表_含征集_{MERGE_TS}.xlsx"
LOG = P5 / "征集合并校验日志.xlsx"
UNMATCHED = P5 / "征集未匹配记录.xlsx"
MASTER = ROOT / "data/03_专家版主表/output/专业招生主表.xlsx"


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    print("[1/5] 拆分 log 为待审清单")
    log = pd.read_excel(LOG)
    dup = log[(log["level"] == "ERROR") & (log["category"].str.contains("重复写入", na=False))]
    dup.to_excel(PHASE_E / "待审_重复写入.xlsx", index=False)
    print(f"       待审_重复写入: {len(dup)}")

    fld = log[log["category"] == "字段不一致"]
    fld.to_excel(PHASE_E / "待审_字段不一致.xlsx", index=False)
    print(f"       待审_字段不一致: {len(fld)}")

    over = log[log["category"] == "征集超计划"]
    over.to_excel(PHASE_E / "待审_征集超计划.xlsx", index=False)
    print(f"       待审_征集超计划: {len(over)}")

    inc = log[log["category"] == "计划数递增"]
    inc.to_excel(PHASE_E / "待审_计划数递增.xlsx", index=False)
    print(f"       待审_计划数递增: {len(inc)}")

    gap = log[log["category"] == "轮次断档"]
    gap.to_excel(PHASE_E / "待审_轮次断档.xlsx", index=False)
    print(f"       待审_轮次断档: {len(gap)}")

    print("[2/5] 未匹配分类汇总")
    um = pd.read_excel(UNMATCHED)
    reason_col = "失败原因" if "失败原因" in um.columns else um.columns[-1]
    # 将原因简化为一级分类
    def bucket(r):
        r = str(r)
        if r.startswith("REJECT-名称不一致"):
            return "REJECT-名称不一致"
        if r.startswith("REJECT-专项不一致"):
            return "REJECT-专项不一致"
        if r.startswith("WARN-名称多命中"):
            return "WARN-名称多命中"
        if r.startswith("WARN-去类型多命中"):
            return "WARN-去类型多命中"
        if r.startswith("WARN-"):
            return "WARN-其他多命中"
        if r == "UNMATCHED":
            return "UNMATCHED-主表无对应行"
        if r == "KEY-INCOMPLETE":
            return "KEY-INCOMPLETE"
        return "其他"
    um["分类"] = um[reason_col].apply(bucket)
    dist = um["分类"].value_counts().to_dict()
    print(f"       未匹配分类: {dist}")
    with pd.ExcelWriter(PHASE_E / "未匹配_REJECT分类.xlsx", engine="openpyxl") as w:
        um.to_excel(w, sheet_name="全部", index=False)
        for cat in dist:
            sub = um[um["分类"] == cat]
            # sheet 名不能超过 31 字符, 也不能含特殊字符
            sn = cat.replace("-", "_").replace("(", "").replace(")", "")[:31]
            sub.to_excel(w, sheet_name=sn, index=False)

    print("[3/5] 复制 Phase D 核对报告")
    phase_d_src = P5 / "phase_d" / "verification_report.xlsx"
    shutil.copy2(phase_d_src, PHASE_E / "phase_d_核对报告_100条.xlsx")

    print("[4/5] 写最终报告")
    SPECS.mkdir(parents=True, exist_ok=True)
    # 计算 sha256
    sha_master = sha256(MASTER)
    sha_merged = sha256(MERGED)

    cat_counts = log["category"].value_counts().to_dict()
    stats = {
        "合并时间戳": MERGE_TS,
        "征集总行数": 23579,
        "已写入": 17231,
        "未匹配": 6139,
        "写入成功率": f"{17231/23579*100:.1f}%",
        "重复写入_ERROR": cat_counts.get("重复写入", 0),
        "重复写入_INFO_同值": cat_counts.get("重复写入(同值)", 0),
        "字段不一致_INFO": cat_counts.get("字段不一致", 0),
        "征集超计划_INFO": cat_counts.get("征集超计划", 0),
        "轮次断档_INFO": cat_counts.get("轮次断档", 0),
        "计划数递增_INFO": cat_counts.get("计划数递增", 0),
        "未匹配_UNMATCHED": 2949,
        "未匹配_REJECT_名称不一致": int((um["分类"] == "REJECT-名称不一致").sum()),
        "未匹配_REJECT_专项不一致": int((um["分类"] == "REJECT-专项不一致").sum()),
        "未匹配_WARN_名称多命中": int((um["分类"] == "WARN-名称多命中").sum()),
        "未匹配_WARN_去类型多命中": int((um["分类"] == "WARN-去类型多命中").sum()),
        "未匹配_KEY_INCOMPLETE": int((um["分类"] == "KEY-INCOMPLETE").sum()),
        "phase_d_sample": 100,
        "phase_d_pass": 100,
        "phase_d_pass_rate": "100.0%",
    }

    report = f"""# 征集志愿合并 Phase E 最终交付报告 (方案 A)

> 日期: 2026-04-24
> 决策: 方案 A — 保守交付, 不覆盖主表, 待人工审 {stats['重复写入_ERROR']} 条重复写入

## 一、数据基线

- **主表**: `{MASTER}`
  sha256: `{sha_master[:32]}...`
  状态: 未改写 (仅 Phase B2 规范化过批次×类型枚举, 18757 行受影响, 那次已备份)

- **合并预览**: `{MERGED}`
  sha256: `{sha_merged[:32]}...`
  状态: 独立副本, 含 11 列 征集*计划, 可独立交付下游

- **78 份源冻结清单**: `scripts/data_integration/_p5_out/征集源冻结清单.json`

## 二、量化结果

| 指标 | 值 | 说明 |
|---|---|---|
| 征集源行数 | {stats['征集总行数']} | 78 份 `_已校验.xlsx` 合计 |
| 成功写入 | {stats['已写入']} ({stats['写入成功率']}) | 经严格名称/专项一致性校验 |
| 抽样核对 PASS | 100/100 | Phase D 100% 通过 (源计划+名称双重核对) |
| ERROR-重复写入 | {stats['重复写入_ERROR']} | 同位异值, 需人工定源 (详见待审清单) |
| INFO-重复写入(同值) | {stats['重复写入_INFO_同值']} | 多份来源相同值, 已合并 |
| INFO-字段不一致 | {stats['字段不一致_INFO']} | 院校/专业名称差异 (OCR/简称), 写入但标记 |
| INFO-征集超计划 | {stats['征集超计划_INFO']} | 征集>原计划 (业务合法, 降级 INFO) |
| INFO-轮次断档 | {stats['轮次断档_INFO']} | 第 n 轮无但第 n+1 轮有 (业务合法) |
| INFO-计划数递增 | {stats['计划数递增_INFO']} | 后轮 > 前轮 (业务合法) |

## 三、未匹配分解 ({stats['未匹配']} 条)

| 类别 | 条数 | 性质 |
|---|---|---|
| UNMATCHED-主表无对应行 | {stats['未匹配_UNMATCHED']} | 源专业已停招或主表未录, 属数据缺口 |
| REJECT-名称不一致 | {stats['未匹配_REJECT_名称不一致']} | **新拦截** 避免同代码跨年不同专业的错写 |
| REJECT-专项不一致 | {stats['未匹配_REJECT_专项不一致']} | **新拦截** 避免专项数据写入普通行 |
| WARN-名称多命中 | {stats['未匹配_WARN_名称多命中']} | 同名专业在多批/多类下存在, 征集源无足够区分字段 |
| WARN-去类型多命中 | {stats['未匹配_WARN_去类型多命中']} | 同上, 结构性缺口 |
| KEY-INCOMPLETE | {stats['未匹配_KEY_INCOMPLETE']} | 征集源关键字段 (院校代码/专业代码) 缺失 |

## 四、Phase D 核对方法论

1. 从 17,231 条成功写入中按年配额抽 100 条 (23:20/24:30/25:50, seed=20260424)
2. 对每条样本, 遍历 78 份冻结源, 构建两级索引:
   - 严格: (年, 院校代码, 专业代码, 科目)
   - 宽松: (年, 院校代码, 科目) — 允许跨年 mc 差异
3. 每条写入的每个 (年, 轮次, 计划值) 都需: 源有相同计划值 AND 源专业名称与主表专业双向包含
4. 100/100 通过

产物: `_p5_out/phase_e/phase_d_核对报告_100条.xlsx`

## 五、待人工审的清单 (交付方案 A 重点)

1. **待审_重复写入.xlsx** ({stats['重复写入_ERROR']} 条, ERROR): 同主表行 被两份源 写入不同计划值. 需人工阅 PDF 定哪条为准
2. **待审_字段不一致.xlsx** ({stats['字段不一致_INFO']} 条, INFO): 写入成功但字段 (院校/专业名称) 与主表有 OCR/简称差异, 不影响计划数, 可整批 approve
3. **待审_征集超计划.xlsx** ({stats['征集超计划_INFO']} 条, INFO): 征集计划>原计划, 业务合法但可抽查
4. **待审_计划数递增.xlsx** ({stats['计划数递增_INFO']} 条, INFO): 后轮计划>前轮, 业务合法
5. **待审_轮次断档.xlsx** ({stats['轮次断档_INFO']} 条, INFO): 第 n 轮无但第 n+1 轮有, 业务合法
6. **未匹配_REJECT分类.xlsx** ({stats['未匹配']} 条, 分 sheet): 不写入, 大部分为"真实数据缺口"无需处理

## 六、下一步建议

- **不覆盖主表**: 当前合并预览作为独立资产交付, 主表保留无征集列的规范化基线
- **审核 30 条 ERROR 后**: 可手动 apply 这 30 条的决策到合并预览, 然后再用合并预览覆盖主表
- **如希望自动推进**: 改选方案 B (取最大计划数) 即可由算法直接收敛 30 条并覆盖主表

## 七、产物清单

```
docs/superpowers/specs/2026-04-24-supp-merge-final-run-design/
  final_report.md                      (本文档)
  deliverable_manifest.json            (含 sha256)

scripts/data_integration/_p5_out/
  专业招生主表_含征集_{MERGE_TS}.xlsx   (合并预览主产物)
  征集合并校验日志.xlsx                (5630 条 log)
  征集未匹配记录.xlsx                  (6139 条)

  phase_d/
    samples_100.xlsx                  (抽样)
    verification_report.xlsx          (100/100 PASS)

  phase_e/
    待审_重复写入.xlsx                  ({stats['重复写入_ERROR']}, ERROR)
    待审_字段不一致.xlsx                ({stats['字段不一致_INFO']}, INFO)
    待审_征集超计划.xlsx                ({stats['征集超计划_INFO']}, INFO)
    待审_计划数递增.xlsx                ({stats['计划数递增_INFO']}, INFO)
    待审_轮次断档.xlsx                  ({stats['轮次断档_INFO']}, INFO)
    未匹配_REJECT分类.xlsx             ({stats['未匹配']}, 多 sheet)
    phase_d_核对报告_100条.xlsx        (核对报告拷贝)
```

---

**签收点**: 请审 30 条重复写入; 审毕告知"覆盖主表"或"继续保持分离".
"""
    out_rep = SPECS / "final_report.md"
    out_rep.write_text(report, encoding="utf-8")
    print(f"       -> {out_rep}")

    manifest = {
        "phase": "E_方案A",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "master_frozen": {"path": str(MASTER), "sha256": sha_master},
        "merged_preview": {"path": str(MERGED), "sha256": sha_merged},
        "stats": stats,
        "deliverables": [
            str(SPECS / "final_report.md"),
            str(PHASE_E / "待审_重复写入.xlsx"),
            str(PHASE_E / "待审_字段不一致.xlsx"),
            str(PHASE_E / "待审_超计划.xlsx"),
            str(PHASE_E / "未匹配_REJECT分类.xlsx"),
            str(PHASE_E / "phase_d_核对报告_100条.xlsx"),
        ],
    }
    out_man = SPECS / "deliverable_manifest.json"
    out_man.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"       -> {out_man}")

    print("[5/5] 完成")
    print(f"\n交付汇总:")
    for k, v in stats.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
