# -*- coding: utf-8 -*-
"""
生成征集志愿数据的 dry-run 重命名映射清单。
不执行任何 rename/mv，仅产出 .md 和 .csv。
"""
import os
import sys
import json
import csv

sys.stdout.reconfigure(encoding='utf-8')

ROOT_ABS = r'C:\Users\Administrator\Documents\VolunteerHelper\data\13_征集志愿\普通高考'
TREE_JSON = r'C:\Users\Administrator\Documents\VolunteerHelper\docs\superpowers\specs\_tmp_tree_summary.json'
OUT_MD = r'C:\Users\Administrator\Documents\VolunteerHelper\docs\superpowers\specs\2026-04-17-rename-plan.md'
OUT_CSV = r'C:\Users\Administrator\Documents\VolunteerHelper\docs\superpowers\specs\2026-04-17-rename-plan.csv'

# ================ 真值表（手工录入，严格对齐两份 ground-truth md） ================

# 2023-2024
gt_23_24 = {
    "3264": dict(year=2023, cat="专项计划", kl="文理综合", pc="本科提前批", zt="国家优师专项+军事+公安+司法", dt="征集志愿", cs="第一次"),
    "3269": dict(year=2023, cat="提前批",   kl="理科",     pc="本科提前批", zt="军事+公安+司法+航海类",         dt="征集志愿", cs="第一次"),
    "3270": dict(year=2023, cat="专项计划", kl="文科",     pc="本科批_一二批混合", zt="", dt="征集志愿", cs="第一次",
                 note="K1关键字0命中（既无一批控制线也无二批控制线字样），需人工查对应png/jpg公告标题图复核"),
    "3282": dict(year=2023, cat="专项计划", kl="文理综合", pc="本科一批", zt="国家专项", dt="征集志愿", cs="第二次",
                 note="K3 特殊处理：大批次=本科一批，子类型=国家专项"),
    "3284": dict(year=2023, cat="本科批次", kl="文理综合", pc="本科一批", zt="", dt="征集志愿", cs="第一次"),
    "3285": dict(year=2023, cat="少数民族", kl="文理综合", pc="一类模式本科一批", zt="", dt="征集志愿", cs="第一次"),
    "3286": dict(year=2023, cat="专项计划", kl="文理综合", pc="本科批_一二批混合", zt="省属高校帮扶", dt="征集志愿", cs="第三次和第二次",
                 note="K1关键字0命中；院校备注含'省属高校帮扶'11次（通常对应本科一批专项），建议人工复核"),
    "3289": dict(year=2023, cat="本科批次", kl="文理综合", pc="本科一批", zt="", dt="征集志愿", cs="第二次"),
    "3290": dict(year=2023, cat="本科批次", kl="文理综合", pc="本科一批预科", zt="", dt="征集志愿", cs="第一次"),
    "3293": dict(year=2023, cat="本科批次", kl="文理综合", pc="本科一批", zt="", dt="征集志愿", cs="第三次"),
    "3294": dict(year=2023, cat="专项计划", kl="理科",     pc="本科一批", zt="", dt="征集志愿", cs="第四次"),
    "3296": dict(year=2023, cat="本科批次", kl="理科",     pc="本科一批预科", zt="", dt="征集志愿", cs="第二次"),
    "3298": dict(year=2023, cat="少数民族", kl="文理综合", pc="一类模式本科一批预科", zt="", dt="征集志愿", cs="第一次"),
    "3303": dict(year=2023, cat="专项计划", kl="理科",     pc="本科批_一二批混合", zt="省级公费师范生+地方优师+乡村振兴", dt="征集志愿", cs="第一次",
                 note="K1关键字0命中；含'省级公费师范生'62次/'乡村振兴'6次，建议人工复核"),
    "3309": dict(year=2023, cat="本科批次", kl="文理综合", pc="本科二批", zt="", dt="征集志愿", cs="第一次"),
    "3311": dict(year=2023, cat="本科批次", kl="理科",     pc="二类模式本科批", zt="", dt="征集志愿", cs="第一次"),
    "3312": dict(year=2023, cat="少数民族", kl="文理综合", pc="一类模式本科二批", zt="", dt="征集志愿", cs="第一次"),
    "3314": dict(year=2023, cat="本科批次", kl="文理综合", pc="本科二批", zt="", dt="征集志愿", cs="第二次"),
    "3316": dict(year=2023, cat="本科批次", kl="文理综合", pc="本科二批预科", zt="", dt="征集志愿", cs="第一次"),
    "3321": dict(year=2023, cat="本科批次", kl="文理综合", pc="本科二批", zt="", dt="征集志愿", cs="第三次"),
    "3322": dict(year=2023, cat="本科批次", kl="理科",     pc="本科二批预科", zt="", dt="征集志愿", cs="第二次"),
    "3324": dict(year=2023, cat="本科批次", kl="文理综合", pc="本科二批", zt="", dt="征集志愿", cs="第四次"),
    "3329": dict(year=2023, cat="提前批",   kl="文理综合", pc="专科提前批", zt="军事+公安+司法+航空服务", dt="征集志愿", cs="第一次"),
    "3330": dict(year=2023, cat="提前批",   kl="文理综合", pc="专科提前批", zt="军事+公安+司法+航空服务", dt="征集志愿", cs="第二次"),
    "3335": dict(year=2023, cat="专科批次", kl="文科",     pc="专科批", zt="", dt="征集志愿", cs="第一次"),
    "3336": dict(year=2023, cat="专科批次", kl="理科",     pc="专科批", zt="", dt="招生计划", cs=""),
    "3337": dict(year=2023, cat="少数民族", kl="文理综合", pc="一类模式专科批", zt="", dt="征集志愿", cs="第一次"),
    "3338": dict(year=2023, cat="专科批次", kl="理科",     pc="专科批", zt="", dt="征集志愿", cs="第一次"),
    "3339": dict(year=2023, cat="专科批次", kl="理科",     pc="专科批", zt="", dt="招生计划", cs=""),
    "3340": dict(year=2023, cat="专科批次", kl="文科",     pc="专科批", zt="", dt="征集志愿", cs="第二次"),
    # 2024
    "3770": dict(year=2024, cat="专项计划", kl="理科",     pc="本科提前批", zt="国家优师专项+免费医学定向+军事+公安+司法", dt="征集志愿", cs="第一次"),
    "3778": dict(year=2024, cat="提前批",   kl="未分科",   pc="本科提前批", zt="", dt="征集志愿", cs="第一次",
                 note="空表，科类无法判定，用未分科"),
    "3780": dict(year=2024, cat="专项计划", kl="文理综合", pc="本科一批", zt="", dt="征集志愿", cs="第一次"),
    "3791": dict(year=2024, cat="专项计划", kl="文理综合", pc="本科批_一二批混合", zt="", dt="征集志愿", cs="第二次",
                 note="K1关键字0命中，需人工复核（相邻ID推断倾向本科一批）"),
    "3792": dict(year=2024, cat="本科批次", kl="文理综合", pc="本科一批", zt="", dt="征集志愿", cs="第一次"),
    "3793": dict(year=2024, cat="少数民族", kl="文理综合", pc="一类模式本科一批", zt="", dt="征集志愿", cs="第一次"),
    "3796": dict(year=2024, cat="专项计划", kl="理科",     pc="本科批_一二批混合", zt="", dt="征集志愿", cs="第三次",
                 note="K1关键字0命中，需人工复核"),
    "3799": dict(year=2024, cat="本科批次", kl="文理综合", pc="本科一批", zt="", dt="征集志愿", cs="第二次"),
    "3801": dict(year=2024, cat="本科批次", kl="文理综合", pc="本科一批预科", zt="", dt="征集志愿", cs="第一次", has_supp=True),
    "3802": dict(year=2024, cat="专项计划", kl="理科",     pc="本科一批", zt="", dt="征集志愿", cs="第三次"),
    "3805": dict(year=2024, cat="本科批次", kl="文理综合", pc="本科一批", zt="", dt="征集志愿", cs="第三次", has_supp=True),
    "3806": dict(year=2024, cat="本科批次", kl="文理综合", pc="本科一批预科", zt="", dt="征集志愿", cs="第二次", has_supp=True),
    "3807": dict(year=2024, cat="少数民族", kl="理科",     pc="一类模式本科一批预科", zt="", dt="征集志愿", cs="第一次",
                 note="原文件夹名写作'本科第一批预科'，统一为'一类模式本科一批预科'"),
    "3808": dict(year=2024, cat="专项计划", kl="文理综合", pc="本科一批", zt="", dt="征集志愿", cs="第四次"),
    "3810": dict(year=2024, cat="专项计划", kl="文理综合", pc="本科批_一二批混合", zt="省级公费师范生+地方优师", dt="征集志愿", cs="第一次",
                 note="K1关键字0命中；含'省级公费师范生'117次/'地方优师'21次，建议复核"),
    "3812": dict(year=2024, cat="专项计划", kl="文理综合", pc="本科批_一二批混合", zt="省级公费师范生", dt="征集志愿", cs="第二次",
                 note="K1关键字0命中；含'省级公费师范生'3次，建议复核"),
    "3817": dict(year=2024, cat="本科批次", kl="文理综合", pc="本科二批", zt="", dt="征集志愿", cs="第一次", has_supp=True),
    "3818": dict(year=2024, cat="本科批次", kl="文理综合", pc="二类模式本科批", zt="", dt="征集志愿", cs="第一次", has_supp=True),
    "3819": dict(year=2024, cat="少数民族", kl="未分科",   pc="一类模式本科二批", zt="", dt="征集志愿", cs="第一次",
                 note="空表，科类用未分科；原名批次'本科二批'按真值表归入'一类模式本科二批'"),
    "3820": dict(year=2024, cat="专项计划", kl="文理综合", pc="本科二批", zt="", dt="征集志愿", cs="第一次"),
    "3824": dict(year=2024, cat="本科批次", kl="文理综合", pc="本科二批", zt="", dt="征集志愿", cs="第二次", has_supp=True),
    "3825": dict(year=2024, cat="本科批次", kl="文理综合", pc="本科二批预科", zt="", dt="征集志愿", cs="第一次", has_supp=True),
    "3827": dict(year=2024, cat="本科批次", kl="文理综合", pc="本科二批", zt="", dt="征集志愿", cs="第三次", has_supp=True),
    "3829": dict(year=2024, cat="本科批次", kl="文理综合", pc="本科二批预科", zt="", dt="征集志愿", cs="第二次", has_supp=True),
    "3837": dict(year=2024, cat="提前批",   kl="文理综合", pc="专科提前批", zt="军事+公安+司法+航海类", dt="征集志愿", cs="第一次"),
    "3839": dict(year=2024, cat="提前批",   kl="文理综合", pc="专科提前批", zt="军事+公安+司法+航海类", dt="征集志愿", cs="第二次"),
    "3850": dict(year=2024, cat="专科批次", kl="文科",     pc="专科批", zt="", dt="征集志愿", cs="第一次"),
    "3851": dict(year=2024, cat="专科批次", kl="理科",     pc="专科批", zt="", dt="单招招生计划", cs=""),
    "3854": dict(year=2024, cat="少数民族", kl="文理综合", pc="一类模式专科批", zt="", dt="征集志愿", cs="第一次"),
    "3855": dict(year=2024, cat="专科批次", kl="文理综合", pc="专科批", zt="军事+公安+司法", dt="征集志愿", cs="第二次"),
}

# 2025
gt_25 = {
    "4387": dict(year=2025, cat="提前批",   kl="物理类",   pc="本科提前批次", zt="A段", dt="征集志愿", cs="第一次"),
    "4395": dict(year=2025, cat="提前批",   kl="物历综合", pc="本科提前批次", zt="B段", dt="征集志愿", cs="第一次"),
    "4398": dict(year=2025, cat="提前批",   kl="物历综合", pc="本科提前批次", zt="B段", dt="征集志愿", cs="第二次"),
    "4402": dict(year=2025, cat="专项计划", kl="物历综合", pc="本科批次", zt="A段国家专项", dt="征集志愿", cs="第一次"),
    "4403": dict(year=2025, cat="专项计划", kl="物历综合", pc="本科批次", zt="A段国家专项第二次+A段地方专项第一次", dt="征集志愿", cs=""),
    "4407": dict(year=2025, cat="专项计划", kl="物历综合", pc="本科批次", zt="A段地方专项第二次+B段第一次", dt="征集志愿", cs=""),
    "4409": dict(year=2025, cat="少数民族", kl="物历综合", pc="原民族语言授课为主本科批次+原加授少数民族语文本科批次", zt="", dt="征集志愿", cs="第一次"),
    "4412": dict(year=2025, cat="少数民族", kl="物历综合", pc="本科批次", zt="B段+B段原民族语言授课为主预科", dt="征集志愿", cs="第二次"),
    "4413": dict(year=2025, cat="少数民族", kl="物历综合", pc="本科批次", zt="区域教育均衡+省属高校少数民族预科", dt="征集志愿", cs="第一次"),
    "4414": dict(year=2025, cat="本科批次", kl="物历综合", pc="本科批次", zt="B段", dt="征集志愿", cs="第三次"),
    "4418": dict(year=2025, cat="少数民族", kl="物理类",   pc="本科批次", zt="省属高校少数民族预科", dt="征集志愿", cs="第二次"),
    "4423": dict(year=2025, cat="提前批",   kl="物历综合", pc="专科提前批次", zt="定向培养军士+航海类", dt="征集志愿", cs="第一次"),
    "4428": dict(year=2025, cat="专科批次", kl="历史类",   pc="专科批次", zt="", dt="征集志愿", cs="第一次"),
    "4429": dict(year=2025, cat="专科批次", kl="物理类",   pc="专科批次", zt="", dt="单招招生计划", cs=""),
    "4431": dict(year=2025, cat="少数民族", kl="物历综合", pc="原民族语言授课为主专科批次+原加授少数民族语文专科批次", zt="", dt="征集志愿", cs="第一次"),
    "4433": dict(year=2025, cat="专科批次", kl="历史类",   pc="专科批次", zt="", dt="征集志愿", cs="第二次"),
    "4434": dict(year=2025, cat="专科批次", kl="物理类",   pc="专科批次", zt="", dt="招生计划", cs=""),
    "4435": dict(year=2025, cat="少数民族", kl="物历综合", pc="原民族语言授课为主专科批次+原加授少数民族语文专科批次", zt="", dt="征集志愿", cs="第二次"),
}

gt_all = {**gt_23_24, **gt_25}


def build_new_folder(ID, info):
    parts = [ID, str(info['year']), info['kl'], info['pc']]
    if info.get('zt'):
        parts.append(info['zt'])
    parts.append(info['dt'])
    if info.get('cs'):
        parts.append(info['cs'])
    return '_'.join(parts)


# ================ 主流程 ================

with open(TREE_JSON, 'r', encoding='utf-8') as f:
    tree = json.load(f)

mappings = []  # list of dicts: type, old_rel, new_rel, old_abs, new_abs, note
new_folder_by_id = {}
new_paths_seen = {}

for cat, folders in tree.items():
    for folder, info in folders.items():
        ID = folder.split('_')[0]
        gt = gt_all.get(ID)
        if not gt:
            mappings.append(dict(kind="错误", cat=cat, old=folder, new="", note=f"缺失真值表条目"))
            continue
        new_folder = build_new_folder(ID, gt)
        new_folder_by_id[ID] = new_folder

        # 顶层分类保持不变
        old_cat_rel = f"{cat}/{folder}"
        new_cat_rel = f"{cat}/{new_folder}"

        # 文件夹映射
        mappings.append(dict(
            kind="文件夹",
            cat=cat,
            old_rel=old_cat_rel,
            new_rel=new_cat_rel,
            note=gt.get('note', '')
        ))
        new_paths_seen.setdefault(new_cat_rel, []).append(old_cat_rel)

        # xlsx 映射
        for xlsx in info['xlsx']:
            if xlsx == 'supplementary_2025_PaddleOCR-VL-1.5.xlsx':
                # D2: {父文件夹新名}_补充数据_PaddleOCR-VL-1.5.xlsx
                new_xlsx = f"{new_folder}_补充数据_PaddleOCR-VL-1.5.xlsx"
            else:
                # 解析引擎后缀：把 xlsx 名里"_.xlsx"的最后一段当作引擎
                stem = xlsx[:-5]  # strip .xlsx
                # 引擎枚举
                ENGINES = ['mimo-v2-omni_corrected', 'mimo-v2-omni', 'claude', '多引擎', 'PaddleOCR-VL-1.5']
                engine = None
                for e in ENGINES:
                    if stem.endswith('_' + e):
                        engine = e
                        break
                if engine is None:
                    # 容错
                    engine = stem.split('_')[-1]
                new_xlsx = f"{new_folder}_{engine}.xlsx"

            old_xlsx_rel = f"{cat}/{folder}/{xlsx}"
            new_xlsx_rel = f"{cat}/{new_folder}/{new_xlsx}"
            mappings.append(dict(
                kind="xlsx" if xlsx != 'supplementary_2025_PaddleOCR-VL-1.5.xlsx' else "补充数据",
                cat=cat,
                old_rel=old_xlsx_rel,
                new_rel=new_xlsx_rel,
                note=""
            ))
            new_paths_seen.setdefault(new_xlsx_rel, []).append(old_xlsx_rel)

# 冲突检测
conflicts = {k: v for k, v in new_paths_seen.items() if len(v) > 1}

# 最长路径
max_len = 0
max_path = ""
for m in mappings:
    p = m.get('new_rel', '')
    if p and len(p) > max_len:
        max_len = len(p)
        max_path = p

# 分组统计
folders_n = sum(1 for m in mappings if m['kind'] == '文件夹')
xlsx_n = sum(1 for m in mappings if m['kind'] == 'xlsx')
supp_n = sum(1 for m in mappings if m['kind'] == '补充数据')
err_n = sum(1 for m in mappings if m['kind'] == '错误')

# PNG/jpg 不动数量
png_total = 0
for cat, folders in tree.items():
    for folder, info in folders.items():
        png_total += info['png_count']
        png_total += sum(1 for x in info['others'] if x.lower().endswith('.jpg'))

# ================ 写 Markdown ================

def md_cell(s):
    return (s or '').replace('|', '\\|')

lines = []
lines.append("# 征集志愿数据重命名预案（Dry-Run）")
lines.append("")
lines.append(f"生成时间：2026-04-17  ")
lines.append(f"生成者：Rename Mapper Agent C  ")
lines.append(f"总条目数：{folders_n} 个文件夹 + {xlsx_n} 个 xlsx + {supp_n} 个补充数据 = {folders_n + xlsx_n + supp_n} 条重命名")
lines.append("")
lines.append("**本文件是 dry-run 清单，未执行任何 rename 操作。**")
lines.append("")
lines.append("## 一、规则摘要")
lines.append("")
lines.append("### 模板（D1）")
lines.append("```")
lines.append("文件夹：{ID}_{年份}_{科类}_{大批次}[_{子类型}]_{数据类型}[_第N次]")
lines.append("xlsx：{文件夹新名}_{引擎}.xlsx")
lines.append("supplementary（D2）：{父文件夹新名}_补充数据_PaddleOCR-VL-1.5.xlsx")
lines.append("```")
lines.append("")
lines.append("### 顶层分类（D3）")
lines.append("保留 5 个顶级分类目录不变：`本科批次`、`少数民族`、`提前批`、`专科批次`、`专项计划`")
lines.append("")
lines.append("### 复合批次（D4+K2）")
lines.append("子类型中含多个子项时用 `+` 连接，保留完整语义。")
lines.append("")
lines.append("### 一类/二类模式（D5）")
lines.append("作为独立大批次（如 `一类模式本科一批`、`二类模式本科批`），不占子类型位。")
lines.append("")
lines.append("### K1 · 本科批模糊条目细分")
lines.append("按用户指令：打开 xlsx 搜索「执行本科一批控制线」/「执行本科二批控制线」关键字。")
lines.append("**结果：7 个条目关键字全部 0 命中**——xlsx 里不存在这类字样。保守处理：")
lines.append("- 大批次统一记为 `本科批_一二批混合`")
lines.append("- 备注列附注相邻关键词线索（如'省级公费师范生'/'省属高校帮扶'等出现次数）")
lines.append("- 建议用户查对应 `NNNN_000.jpg/png` 公告标题图人工复核后再执行")
lines.append("")
lines.append("### K3 · 3282 特殊处理")
lines.append("大批次 = `本科一批`，子类型 = `国家专项`（已采纳用户指令）。")
lines.append("")
lines.append("### PNG/JPG 图片")
lines.append(f"**不重命名**，保留原名；共计 {png_total} 个图片文件不入本表。")
lines.append("")
lines.append("### 字段取值域（严格对齐真值表）")
lines.append("- 科类：2023-2024 `理科` / `文科` / `文理综合` / `未分科`；2025 `物理类` / `历史类` / `物历综合`")
lines.append("- 大批次（旧）：本科提前批 / 本科一批 / 本科二批 / 本科一批预科 / 本科二批预科 / 二类模式本科批 / 一类模式本科一批 / 一类模式本科一批预科 / 一类模式本科二批 / 一类模式专科批 / 专科提前批 / 专科批 / **本科批_一二批混合（K1）**")
lines.append("- 大批次（新 2025）：本科提前批次 / 本科批次 / 专科提前批次 / 专科批次 / 原民族语言授课为主本科批次（及其+加授组合）")
lines.append("- 数据类型：征集志愿 / 招生计划 / 单招招生计划 / 补充数据")
lines.append("")
lines.append("---")
lines.append("")
lines.append("## 二、K1 细分结果（7 个模糊条目）")
lines.append("")
lines.append("按用户指令实际打开 xlsx 搜索关键字得到的原始统计：")
lines.append("")
lines.append("| ID | 原文件夹 | 「一批控制线」命中 | 「二批控制线」命中 | 其他关键词线索 | 判定大批次 |")
lines.append("|---|---|---|---|---|---|")
k1_rows = [
    ("3270", "3270_征集志愿_第一次_2023_本科批", 0, 0, "—（纯普通本科院校专业，文科 324 行）", "本科批_一二批混合"),
    ("3286", "3286_征集志愿_第三次和第二次_2023_本科批", 0, 0, "省属高校帮扶 ×11", "本科批_一二批混合"),
    ("3303", "3303_征集志愿_第一次_2023_本科批", 0, 0, "省级公费师范生 ×62、地方优师 ×1、乡村振兴 ×6", "本科批_一二批混合"),
    ("3791", "3791_征集志愿_第二次_2024_本科批", 0, 0, "—（普通本科院校，文理混 159 行）", "本科批_一二批混合"),
    ("3796", "3796_征集志愿_第三次_2024_本科批", 0, 0, "—（普通本科院校，理科 32 行）", "本科批_一二批混合"),
    ("3810", "3810_征集志愿_第一次_2024_本科批", 0, 0, "省级公费师范生 ×117、地方优师 ×21、乡村振兴 ×4", "本科批_一二批混合"),
    ("3812", "3812_征集志愿_第二次_2024_本科批", 0, 0, "省级公费师范生 ×3", "本科批_一二批混合"),
]
for r in k1_rows:
    lines.append("| " + " | ".join(md_cell(str(x)) for x in r) + " |")
lines.append("")
lines.append("**结论**：K1 关键字在这批 xlsx 里全部 0 命中，无法区分。全部保守标为 `本科批_一二批混合`，由用户后续参考公告标题图（`NNNN_000.jpg`）人工再细分。")
lines.append("")
lines.append("---")
lines.append("")
lines.append("## 三、完整映射清单")
lines.append("")

# 按分类、按 ID 排序
by_cat = {}
for m in mappings:
    by_cat.setdefault(m['cat'], []).append(m)

# 每个分类块内部：先按 ID 升序，类型次序：文件夹 → xlsx... → 补充数据
def sort_key(m):
    ID = m['old_rel'].split('/')[1].split('_')[0]
    kind_order = {'文件夹': 0, 'xlsx': 1, '补充数据': 2, '错误': 99}
    return (int(ID) if ID.isdigit() else 999999, kind_order.get(m['kind'], 50), m.get('old_rel', ''))

cat_order = ['本科批次', '少数民族', '提前批', '专科批次', '专项计划']
idx = 0
for cat in cat_order:
    if cat not in by_cat:
        continue
    items = sorted(by_cat[cat], key=sort_key)
    lines.append(f"### {cat}/  （{sum(1 for x in items if x['kind']=='文件夹')} 个文件夹）")
    lines.append("")
    lines.append("| # | 类型 | 原路径（相对 `data/13_征集志愿/普通高考/`） | 新路径 | 备注 |")
    lines.append("|---|---|---|---|---|")
    for m in items:
        idx += 1
        lines.append("| " + " | ".join([
            str(idx),
            md_cell(m['kind']),
            '`' + md_cell(m['old_rel']) + '`',
            '`' + md_cell(m['new_rel']) + '`',
            md_cell(m.get('note', ''))
        ]) + " |")
    lines.append("")

lines.append("---")
lines.append("")
lines.append("## 四、冲突 / 警告")
lines.append("")
if conflicts:
    lines.append(f"**发现 {len(conflicts)} 个冲突**：")
    for newp, olds in conflicts.items():
        lines.append(f"- `{newp}` 被映射了 {len(olds)} 次：")
        for o in olds:
            lines.append(f"  - 来源：`{o}`")
else:
    lines.append("**无冲突。** 所有新路径唯一。")
lines.append("")
# 超长
overlong = [m for m in mappings if len(m.get('new_rel', '')) > 200]
if overlong:
    lines.append(f"**超过 200 字符的新路径（{len(overlong)} 条）**：")
    for m in overlong:
        lines.append(f"- ({len(m['new_rel'])}) `{m['new_rel']}`")
else:
    lines.append("**无超过 200 字符的新路径。**")
lines.append("")
lines.append(f"最长新路径长度：**{max_len}** 字符  ")
lines.append(f"最长路径：`{max_path}`")
lines.append("")

lines.append("---")
lines.append("")
lines.append("## 五、空表特殊处理")
lines.append("")
lines.append("- **3778**（提前批/2024）：xlsx 全表 0 数据行。科类字段用 `未分科`。")
lines.append("- **3819**（少数民族/2024）：xlsx 全表 0 数据行。科类字段用 `未分科`；原文件夹名是 `本科二批`，按真值表归入 `一类模式本科二批`。")
lines.append("")

lines.append("---")
lines.append("")
lines.append("## 六、统计汇总")
lines.append("")
lines.append(f"- 文件夹重命名：**{folders_n}** 条")
lines.append(f"- xlsx 重命名（普通引擎）：**{xlsx_n}** 条")
lines.append(f"- 补充数据（supplementary_2025_*.xlsx）：**{supp_n}** 条")
lines.append(f"- PNG/JPG 图片（不动）：**{png_total}** 个")
lines.append(f"- 冲突数：**{len(conflicts)}**")
lines.append(f"- 映射错误（缺真值表）：**{err_n}**")
lines.append(f"- 最长新路径字符数：**{max_len}**")
lines.append("")

lines.append("---")
lines.append("")
lines.append("## 七、附录：引擎后缀识别")
lines.append("")
lines.append("xlsx 文件名末尾支持的引擎：")
lines.append("- `mimo-v2-omni`")
lines.append("- `mimo-v2-omni_corrected`")
lines.append("- `claude`")
lines.append("- `多引擎`")
lines.append("- `PaddleOCR-VL-1.5`（仅用于补充数据命名）")
lines.append("")
lines.append("特殊：`supplementary_2025_PaddleOCR-VL-1.5.xlsx` → `{父文件夹新名}_补充数据_PaddleOCR-VL-1.5.xlsx`（D2）")
lines.append("")

with open(OUT_MD, 'w', encoding='utf-8') as w:
    w.write('\n'.join(lines))

# ================ 写 CSV ================

with open(OUT_CSV, 'w', encoding='utf-8', newline='') as w:
    writer = csv.writer(w)
    writer.writerow(['type', 'old_abs', 'new_abs', 'note'])
    for m in mappings:
        old_abs = os.path.join(ROOT_ABS, m['old_rel'].replace('/', os.sep))
        new_abs = os.path.join(ROOT_ABS, m['new_rel'].replace('/', os.sep))
        writer.writerow([m['kind'], old_abs, new_abs, m.get('note', '')])

print(f'wrote {OUT_MD}')
print(f'wrote {OUT_CSV}')
print(f'summary: folders={folders_n}, xlsx={xlsx_n}, supp={supp_n}, conflicts={len(conflicts)}, max_len={max_len}')
