# -*- coding: utf-8 -*-
"""列出计划人数不一致的全部记录"""
import pandas as pd
import numpy as np
import re, warnings
warnings.filterwarnings('ignore')

master = pd.read_excel(
    r"C:\Users\Administrator\Documents\VolunteerHelper\data\03_专家版主表\output\专业招生主表.xlsx"
)
score = pd.read_excel(
    r"C:\Users\Administrator\Documents\VolunteerHelper\data\01_核心录取数据\专业分数线_四川_2025.xlsx"
)

# 批次映射
batch_map = {
    '本科B':'本科批B段', '专科':'专科批',
    '本科A(国家专项)':'本科批A段(国家专项)',
    '本科(高校专项)':'本科批(高校专项)',
    '本科A(地方专项)':'本科批A段(地方专项)',
    '本科(区域均衡专项)':'本科批(区域教育均衡发展专项)',
}
score['批次_mapped'] = score['批次'].map(batch_map).fillna(score['批次'])

def extract_group_code(name):
    if pd.isna(name): return np.nan
    m = re.search(r'专业组(\d+)', str(name))
    return int(m.group(1)) if m else np.nan

score['专业组代码_parsed'] = score['院校原始名称'].apply(extract_group_code)

master['join_key'] = (
    master['院校名称'].astype(str) + '||' +
    master['批次'].astype(str) + '||' +
    master['科目'].astype(str) + '||' +
    master['专业组代码'].astype(str) + '||' +
    master['专业代码'].astype(str).str.strip()
)
score['join_key'] = (
    score['院校名称'].astype(str) + '||' +
    score['批次_mapped'].astype(str) + '||' +
    score['科类'].astype(str) + '||' +
    score['专业组代码_parsed'].astype(str) + '||' +
    score['专业招生代码'].astype(str).str.strip()
)

merged = master.merge(score, on='join_key', how='inner', suffixes=('_主表','_分数线'))

# 修正主表：最低位次、平均分、最高分 以分数线为准
master_path = r"C:\Users\Administrator\Documents\VolunteerHelper\data\03_专家版主表\output\专业招生主表.xlsx"

score_lookup = score.set_index('join_key')[['最低位次','平均分','最高分']].to_dict()

fix_map = {
    '25最低位次': '最低位次',
    '25平均分':   '平均分',
    '25最高分':   '最高分',
}

master_full = pd.read_excel(master_path)
master_full['join_key'] = (
    master_full['院校名称'].astype(str) + '||' +
    master_full['批次'].astype(str) + '||' +
    master_full['科目'].astype(str) + '||' +
    master_full['专业组代码'].astype(str) + '||' +
    master_full['专业代码'].astype(str).str.strip()
)

counts = {k: 0 for k in fix_map}
for idx, row in master_full.iterrows():
    key = row['join_key']
    for m_col, s_col in fix_map.items():
        if key not in score_lookup[s_col]:
            continue
        old = pd.to_numeric(row[m_col], errors='coerce')
        new = pd.to_numeric(score_lookup[s_col][key], errors='coerce')
        if pd.isna(old) or pd.isna(new) or old == 0 or new == 0:
            continue
        if old != new:
            master_full.at[idx, m_col] = new
            counts[m_col] += 1

master_full.drop(columns=['join_key'], inplace=True)
master_full.to_excel(master_path, index=False)

print("修正完成：")
for col, cnt in counts.items():
    print(f"  {col}: {cnt} 条")
print("已保存")
