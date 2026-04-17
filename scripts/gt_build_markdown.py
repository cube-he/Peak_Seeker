# -*- coding: utf-8 -*-
"""
Build ground-truth Markdown from _gt_2023_2024.json.
Pure static mapping — each folder gets a record. Confidence rules:
- 高: xlsx data row shows 科类 cleanly (理科/文科/文理综合) AND folder name批次词 matches 2024 dict.
- 中: data rows non-empty but 科类 ambiguous (e.g. 国家专项计划 as 科类), OR folder name不规范但能从 xlsx 内容推断.
- 低: data empty, must rely on folder name alone.
"""
import json
import re
from collections import Counter
from pathlib import Path

IN = Path(r"C:\Users\Administrator\Documents\VolunteerHelper\scripts\_gt_2023_2024.json")
OUT = Path(r"C:\Users\Administrator\Documents\VolunteerHelper\docs\superpowers\specs\2026-04-17-groundtruth-2023-2024.md")

# Batch keyword mapping — folder tail token -> normalized batch name per 2024-science dict
BATCH_NORMALIZE = {
    "本科提前批": "本科提前批",
    "本科一批": "本科一批",
    "本科二批": "本科二批",
    "本科一批预科": "本科一批预科",
    "本科第一批预科": "本科一批预科",
    "本科二批预科": "本科二批预科",
    "本科批": "本科批（合并/未分一二批）",  # ambiguous in folder name
    "二类模式本科批": "二类模式本科批",
    "一类模式本科一批": "一类模式本科一批",
    "一类模式本科二批": "一类模式本科二批",
    "一类模式专科批": "一类模式专科批",
    "一类模式本科一批预科": "一类模式本科一批预科",
    "一类模式本科第一批预科": "一类模式本科一批预科",
    "专科批": "专科批",
    "专科提前批": "专科提前批",
    "专项计划批": "专项计划批（批次名占位符，真实批次需看内容）",
}

KELEI_CANON = {
    "文科": "文科",
    "理科": "理科",
    "文理综合": "文理综合",
}

DATA_TYPE_MAP = {
    "征集志愿": "征集志愿",
    "招生计划": "招生计划",
    "单招招生计划": "单招招生计划",
    "补充数据": "补充数据",
}


def parse_folder(name: str):
    """Extract fields from folder name like '3284_征集志愿_第一次_2023_本科一批'."""
    parts = name.split("_")
    fid = parts[0]
    year = next((p for p in parts if p in ("2023", "2024")), "")
    # data-type marker in parts[1]
    dt_marker = parts[1] if len(parts) > 1 else ""
    # batch = everything after year
    try:
        year_idx = parts.index(year)
        batch_raw = "_".join(parts[year_idx + 1:]) if year_idx + 1 < len(parts) else ""
    except ValueError:
        batch_raw = ""
    # session (第N次) — look for 第..次 token
    session = ""
    for p in parts:
        if "第" in p and ("次" in p or "批" in p):
            if "次" in p:
                session = p
                break
    return fid, year, dt_marker, batch_raw, session


def classify_kelei(head_dict):
    """Use pre-computed full-table 科类 values if present; fall back to head preview."""
    if not isinstance(head_dict, dict):
        return set(), "empty", 0
    # prefer pre-computed full-table values
    full_key = None
    data_rows_key = None
    for k in head_dict:
        if isinstance(k, str) and k.startswith("__") and k.endswith("__kelei_全表唯一值"):
            full_key = k
        if isinstance(k, str) and k.startswith("__") and k.endswith("__data_rows"):
            data_rows_key = k
    data_rows = head_dict.get(data_rows_key, 0) if data_rows_key else 0
    if full_key is not None:
        vals_all = set(head_dict.get(full_key, []))
        if data_rows == 0:
            return vals_all, "empty", 0
        return vals_all, "ok", data_rows
    # fallback to head
    sheet_rows = head_dict.get("征集志愿")
    if not sheet_rows or isinstance(sheet_rows, str):
        return set(), "empty", 0
    header = sheet_rows[0] if sheet_rows else []
    kelei_idx = None
    for i, c in enumerate(header):
        if str(c).strip() == "科类":
            kelei_idx = i
            break
    if kelei_idx is None:
        return set(), "no_kelei_col", 0
    vals = set()
    for r in sheet_rows[1:]:
        if kelei_idx < len(r):
            v = str(r[kelei_idx]).strip()
            if v:
                vals.add(v)
    return vals, "ok", len(sheet_rows) - 1


def infer_kelei(vals, status):
    """Return normalized 科类 label + confidence note."""
    if status == "empty" or not vals:
        return "（空表，无法判定）", "low-empty"
    has_li = "理科" in vals
    has_wen = "文科" in vals
    # non-standard annotations (like 国家专项计划, 文理综合子类) that leaked into 科类 column
    non_std = vals - {"理科", "文科"}
    if has_li and has_wen:
        if non_std:
            return f"文理综合（另含子类标注: {'/'.join(sorted(non_std))}）", "high"
        return "文理综合", "high"
    if has_li and not has_wen:
        if non_std:
            return f"理科（另含子类标注: {'/'.join(sorted(non_std))}）", "high"
        return "理科", "high"
    if has_wen and not has_li:
        if non_std:
            return f"文科（另含子类标注: {'/'.join(sorted(non_std))}）", "high"
        return "文科", "high"
    # only non-standard, no 文/理 → ambiguous
    return f"未分科（原始值: {'/'.join(sorted(vals))}）", "mid-nonstandard"


def detect_subtype(rows, folder):
    """Infer subtype from remark/program text + folder context."""
    if not rows or isinstance(rows, str) or len(rows) < 2:
        return "-"
    text = " ".join(str(c) for r in rows[1:] for c in r)
    subtypes = []
    # priority ordering: more specific markers first
    if "国家专项" in text or (rows[0] and any("国家专项" in str(c) for c in rows[0])):
        subtypes.append("国家专项")
    if "地方专项" in text:
        subtypes.append("地方专项")
    if "高校专项" in text:
        subtypes.append("高校专项")
    if "乡村振兴" in text:
        subtypes.append("乡村振兴专项")
    if "地方优师" in text:
        subtypes.append("地方优师专项")
    if "省级公费师范生" in text:
        subtypes.append("省级公费师范生")
    if "国家优师" in text:
        subtypes.append("国家优师专项")
    if "免费医学定向" in text:
        subtypes.append("免费医学定向")
    if "定向培养军士" in text:
        subtypes.append("定向培养军士")
    if "海军" in text or "武警部队" in text or "陆军" in text or "空军" in text or "公安" in text or "司法" in text or "消防" in text:
        if "军事" not in subtypes and "公安/司法/军事" not in subtypes:
            subtypes.append("军事/公安/司法")
    if "航空服务" in text or "空中乘务" in text or "民航空中安全保卫" in text:
        subtypes.append("航空服务")
    if "航海技术" in text:
        subtypes.append("航海类")
    if "高水平运动队" in text:
        subtypes.append("高水平运动队")
    if "少数民族预科" in text or "一类模式" in folder or "二类模式" in folder:
        if "预科" in folder:
            subtypes.append("预科")
    if "区域教育均衡" in text:
        subtypes.append("区域教育均衡发展专项")
    # Dedup preserve order
    seen = set()
    uniq = []
    for s in subtypes:
        if s not in seen:
            seen.add(s)
            uniq.append(s)
    return "/".join(uniq) if uniq else "-"


def normalize_batch(batch_raw: str, folder: str, category: str) -> (str, str):
    """Return (normalized_batch, note)."""
    if not batch_raw:
        return "（未知）", "folder lacks batch tail"
    b = batch_raw.strip()
    # direct lookup
    if b in BATCH_NORMALIZE:
        return BATCH_NORMALIZE[b], ""
    # special: 本科批 ambiguity, check category for hints
    if b == "本科批":
        return "本科批（一批或二批合称，需按内容细分）", "folder uses 本科批 as catch-all"
    # fallback
    return b, "batch tail not in standard dict"


def dt_from_marker(marker: str) -> str:
    if marker in DATA_TYPE_MAP:
        return DATA_TYPE_MAP[marker]
    if marker == "一类模式":
        return "征集志愿"  # folders like 3285 actual xlsx says 征集志愿
    if marker == "地方专项计划":
        return "招生计划"
    return marker or "（未知）"


def main():
    data = json.loads(IN.read_text(encoding="utf-8"))
    rows_out = []
    exceptions = []
    stat_batch = Counter()
    stat_kelei = Counter()
    stat_conf = Counter()
    stat_year = Counter()

    for rec in data:
        cat = rec["category"]
        folder = rec["folder"]
        year = rec["year"]
        stat_year[year] += 1
        fid, yr, dt_marker, batch_raw, session = parse_folder(folder)
        dt = dt_from_marker(dt_marker)
        batch_norm, batch_note = normalize_batch(batch_raw, folder, cat)
        # xlsx inspection
        kelei_vals, kelei_status, data_rows = classify_kelei(rec["head"] if isinstance(rec["head"], dict) else {})
        kelei_label, kelei_conf = infer_kelei(kelei_vals, kelei_status)
        sheet_preview = rec["head"].get("征集志愿") if isinstance(rec["head"], dict) else None
        subtype = detect_subtype(sheet_preview if sheet_preview else [], folder)

        # overall confidence
        if kelei_conf == "high" and "（未知）" not in batch_norm and "占位符" not in batch_norm:
            conf = "高"
        elif kelei_conf == "low-empty":
            conf = "低"
        elif kelei_conf.startswith("mid") or "占位符" in batch_norm or "本科批（" in batch_norm:
            conf = "中"
        else:
            conf = "中"

        # basis
        basis_bits = []
        if kelei_status == "ok" and kelei_vals:
            basis_bits.append(f"xlsx科类列(全{data_rows}行)={'/'.join(sorted(kelei_vals))}")
        elif kelei_status == "empty":
            basis_bits.append(f"xlsx数据行={data_rows}行（空表）")
        else:
            basis_bits.append(f"xlsx状态={kelei_status}")
        # engine versions
        basis_bits.append(f"引擎版本={len(rec['engines'])}个({', '.join([e.split('_')[-1].replace('.xlsx','') for e in rec['engines']])})")
        if batch_note:
            basis_bits.append(batch_note)
        basis = "；".join(basis_bits)

        # supplementary annotation
        if any("supplementary_2025" in e for e in rec["engines"]):
            basis += "；注：含 supplementary_2025_PaddleOCR 补充数据文件，年份按父目录定为 " + year

        row = {
            "id": fid,
            "year": year,
            "cat": cat,
            "folder": folder,
            "kelei": kelei_label,
            "batch": batch_norm,
            "subtype": subtype,
            "dt": dt,
            "session": session if session else "-",
            "basis": basis,
            "conf": conf,
        }
        rows_out.append(row)
        stat_batch[batch_norm] += 1
        stat_kelei[kelei_label.split("（")[0]] += 1
        stat_conf[conf] += 1
        if conf != "高":
            exceptions.append(row)

    # sort by year then id
    rows_out.sort(key=lambda r: (r["year"], r["id"]))

    lines = []
    lines.append("# 2023-2024 征集志愿数据真值表\n")
    lines.append("生成时间：2026-04-17  ")
    lines.append("数据源：`data/13_征集志愿/普通高考/` 下所有 2023/2024 年文件夹  ")
    lines.append("扫描器：`scripts/gt_scan_2023_2024.py`（只读 xlsx 前 10 行 + 表头，不改名不写数据文件）  ")
    lines.append("批次字典参考：`docs/superpowers/specs/2026-04-17-batch-dict-2024-science.md`\n")
    lines.append("## 提取方法说明\n")
    lines.append("1. 每个文件夹选取主 xlsx（优先 `mimo-v2-omni`，其次 `claude`，均排除 `_corrected`），读取「征集志愿」工作表前 10 行。")
    lines.append("2. 真·科类 直接取 xlsx 的「科类」列实际值集合推断：同表含「理科」+「文科」 = `文理综合`；仅一个值 = 对应单科；「国家专项计划」等非标准值标记为 `未分科`。")
    lines.append("3. 真·大批次 按文件夹尾部批次词做字典化（见 `BATCH_NORMALIZE`）。尾部仅写「本科批」时维持原样并打上「一批或二批合称」提示，需人工按数据内容细分。")
    lines.append("4. 真·子类型 扫描所有数据行文本关键词得到（公安/司法/军事/国家优师/免费医学定向/地方优师/省级公费师范生/预科等）。无命中则 `-`。")
    lines.append("5. 真·数据类型 由文件夹第 2 段决定（`征集志愿`/`招生计划`/`单招招生计划`/`一类模式`→实际 xlsx 为征集志愿）。")
    lines.append("6. 置信度：xlsx 科类清晰 + 批次命中字典 = **高**；xlsx 科类模糊或批次为笼统「本科批」 = **中**；数据为空只能靠文件夹名 = **低**。\n")
    lines.append("## 真值表\n")
    lines.append("| ID | 年份 | 分类目录 | 原文件夹 | 真·科类 | 真·大批次 | 真·子类型 | 真·数据类型 | 真·第N次 | 判断依据 | 置信度 |")
    lines.append("|---|---|---|---|---|---|---|---|---|---|---|")
    for r in rows_out:
        lines.append(
            f"| {r['id']} | {r['year']} | {r['cat']} | {r['folder']} | {r['kelei']} | {r['batch']} | {r['subtype']} | {r['dt']} | {r['session']} | {r['basis']} | {r['conf']} |"
        )

    lines.append("\n## 异常/待定条目（置信度非高）\n")
    if not exceptions:
        lines.append("无。\n")
    else:
        for r in exceptions:
            lines.append(f"### {r['id']} — {r['folder']}（置信度：{r['conf']}）")
            lines.append(f"- 分类目录：`{r['cat']}`")
            lines.append(f"- 真·科类：{r['kelei']}")
            lines.append(f"- 真·大批次：{r['batch']}")
            lines.append(f"- 真·子类型：{r['subtype']}")
            lines.append(f"- 真·数据类型：{r['dt']}  真·第N次：{r['session']}")
            lines.append(f"- 依据：{r['basis']}")
            lines.append("")

    lines.append("## 统计汇总\n")
    lines.append(f"- **总计**：{len(rows_out)} 个文件夹")
    for y, c in sorted(stat_year.items()):
        lines.append(f"- **{y} 年**：{c} 个")
    lines.append("")
    lines.append("### 置信度分布")
    for k in ("高", "中", "低"):
        lines.append(f"- {k}：{stat_conf.get(k, 0)} 个")
    lines.append("")
    lines.append("### 按大批次分布")
    for k, v in sorted(stat_batch.items(), key=lambda x: -x[1]):
        lines.append(f"- `{k}`：{v} 个")
    lines.append("")
    lines.append("### 按科类分布（归一化前缀）")
    for k, v in sorted(stat_kelei.items(), key=lambda x: -x[1]):
        lines.append(f"- `{k}`：{v} 个")
    lines.append("")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote: {OUT}")
    print(f"Total: {len(rows_out)}  高={stat_conf.get('高',0)}  中={stat_conf.get('中',0)}  低={stat_conf.get('低',0)}")


if __name__ == "__main__":
    main()
