# -*- coding: utf-8 -*-
"""统一应用2024/2023/2022三年修复清单到主表"""
import pandas as pd
import json, warnings
warnings.filterwarnings('ignore')

master_path = r"C:\Users\Administrator\Documents\VolunteerHelper\data\03_专家版主表\output\专业招生主表.xlsx"
master = pd.read_excel(master_path)
print(f"读取主表: {len(master)} 行")

total_applied = {}

for year in [2024, 2023, 2022]:
    fix_path = rf"C:\Users\Administrator\Documents\VolunteerHelper\scripts\fixes_{year}.json"
    with open(fix_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    fixes = data['score_fixes']
    fee_fixes = data['fee_fixes']

    count = 0
    for fix in fixes:
        idx = fix['idx']
        col = fix['col']
        master.at[idx, col] = fix['new']
        count += 1
        total_applied.setdefault(col, 0)
        total_applied[col] += 1

    for fix in fee_fixes:
        idx = fix['idx']
        master.at[idx, '学费'] = fix['new']
        count += 1
        total_applied.setdefault('学费', 0)
        total_applied['学费'] += 1

    print(f"[{year}] 应用 {count} 条修复 (分数={len(fixes)}, 学费={len(fee_fixes)})")

master.to_excel(master_path, index=False)

print(f"\n已保存。各字段修复汇总:")
for col, cnt in sorted(total_applied.items()):
    print(f"  {col}: {cnt} 条")
print(f"总计: {sum(total_applied.values())} 条")
