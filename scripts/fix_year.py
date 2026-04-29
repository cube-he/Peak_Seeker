# -*- coding: utf-8 -*-
"""
对比主表 vs 指定年份分数线, 输出修复JSON
用法: python fix_year.py <year>  (2022/2023/2024)
匹配键: 院校全名 + 批次 + 科类 + 专业名称
"""
import pandas as pd
import numpy as np
import re, sys, json, warnings
warnings.filterwarnings('ignore')

year = int(sys.argv[1])
prefix = str(year)[2:]  # "24", "23", "22"

# ── 列映射: 主表列 → 分数线列（仅分数相关，排除计划人数）──
col_maps = {
    '24': {
        f'{prefix}录取人数': '录取人数',
        f'{prefix}最低分': '最低分',
        f'{prefix}最低分位次': '最低位次',
        f'{prefix}平均分': '平均分',
        f'{prefix}平均位': '平均位次',
        f'{prefix}最高分': '最高分',
        f'{prefix}最高位': '最高位次',
    },
    '23': {
        f'{prefix}录取人数': '录取人数',
        f'{prefix}最低分': '最低分',
        f'{prefix}最低分位次': '最低位次',
        f'{prefix}平均分': '平均分',
        f'{prefix}平均位': '平均位次',
        f'{prefix}最高分': '最高分',
        f'{prefix}最高位': '最高位次',
    },
    '22': {
        f'{prefix}录取人数': '录取人数',
        f'{prefix}最低分': '最低分',
        f'{prefix}最低分位次': '最低位次',
        f'{prefix}平均分': '平均分',
        f'{prefix}平均分位次': '平均位次',
        f'{prefix}最高分': '最高分',
        f'{prefix}最高分位次': '最高位次',
    },
}
fix_map = col_maps[prefix]

# ── 读取 ──
master = pd.read_excel(
    r"C:\Users\Administrator\Documents\VolunteerHelper\data\03_专家版主表\output\专业招生主表.xlsx"
)
score = pd.read_excel(
    rf"C:\Users\Administrator\Documents\VolunteerHelper\data\01_核心录取数据\专业分数线_四川_{year}.xlsx"
)
print(f"[{year}] 主表: {len(master)} 行, 分数线: {len(score)} 行")

# ── 映射 ──
kemu_map = {'物理': '理科', '历史': '文科'}

suffix_map = {
    '普通类': '', '国家专项': '(国家专项)', '中外合作': '(中外合作)',
    '高校专项': '(高校专项)', '地方专项': '(地方专项)',
    '区域教育均衡发展专项': '(区域教育均衡发展专项)',
    '预科': '(预科)', '省属预科': '(预科)',
    '定向': '(定向)', '民族班': '(民族班)',
    '宜宾校区': '(宜宾校区)',
    '应用本科': '(应用型人才联合培养计划)',
    '少数民族预科': '(预科)', '高收费': '(较高收费)',
    '宜宾校区区域教育均衡发展专项': '(宜宾校区)(区域教育均衡发展专项)',
}

def map_old_batch(old_batch):
    if pd.isna(old_batch):
        return None
    s = str(old_batch)
    if '一批' in s or '一本' in s or '本一' in s:
        return '本一'
    if '二批' in s or '二本' in s or '本二' in s:
        return '本二'
    if '专科' in s:
        return '专科'
    return None

master['科类_m'] = master['科目'].map(kemu_map)
master['批次_m'] = master['老批次'].apply(map_old_batch)
master['后缀'] = master['招生类型'].map(suffix_map).fillna('')
master['院校全名'] = master['院校名称'] + master['后缀']

has_map = master['批次_m'].notna() & master['科类_m'].notna()

# 用专业名称匹配
master.loc[has_map, 'jk'] = (
    master.loc[has_map, '院校全名'].astype(str) + '||' +
    master.loc[has_map, '批次_m'].astype(str) + '||' +
    master.loc[has_map, '科类_m'].astype(str) + '||' +
    master.loc[has_map, '专业'].astype(str).str.strip()
)

score['jk'] = (
    score['院校名称'].astype(str) + '||' +
    score['批次'].astype(str) + '||' +
    score['科类'].astype(str) + '||' +
    score['专业名称'].astype(str).str.strip()
)

# 匹配率
m_keys = set(master['jk'].dropna())
s_keys = set(score['jk'])
matched = m_keys & s_keys
print(f"[{year}] 匹配: {len(matched)}/{len(m_keys)} ({len(matched)/len(m_keys)*100:.1f}%)")

# ── 构建分数线查找表（去重）──
score_dedup = score.drop_duplicates(subset='jk', keep='first')
score_lookup = {}
for col_s in set(fix_map.values()):
    score_lookup[col_s] = score_dedup.set_index('jk')[col_s].to_dict()

# 学费查找表
score_lookup['学费'] = score_dedup.set_index('jk')['学费'].to_dict()

# ── 计算修复 ──
fixes = []
fee_fixes = []

for idx, row in master.iterrows():
    key = row.get('jk')
    if pd.isna(key) or key not in matched:
        continue

    # 分数相关字段: 双方非0时以分数线为准
    for m_col, s_col in fix_map.items():
        if key not in score_lookup.get(s_col, {}):
            continue
        old = pd.to_numeric(row[m_col], errors='coerce')
        new = pd.to_numeric(score_lookup[s_col][key], errors='coerce')
        if pd.isna(old) or pd.isna(new) or old == 0 or new == 0:
            continue
        if old != new:
            fixes.append({'idx': int(idx), 'col': m_col, 'old': float(old), 'new': float(new)})

    # 学费: 差异>=1万时以小的为准
    if key in score_lookup.get('学费', {}):
        m_fee = pd.to_numeric(str(row['学费']).strip(), errors='coerce')
        s_fee = pd.to_numeric(str(score_lookup['学费'][key]).strip(), errors='coerce')
        if not pd.isna(m_fee) and not pd.isna(s_fee) and m_fee != s_fee:
            diff_val = abs(m_fee - s_fee)
            if diff_val >= 10000:
                new_fee = min(m_fee, s_fee)
                if new_fee != m_fee:
                    fee_fixes.append({
                        'idx': int(idx), 'col': '学费',
                        'old': str(row['学费']), 'new': str(int(new_fee)),
                        'master_fee': float(m_fee), 'score_fee': float(s_fee),
                    })

# ── 保存 ──
out_path = rf"C:\Users\Administrator\Documents\VolunteerHelper\scripts\fixes_{year}.json"
result = {'year': year, 'score_fixes': fixes, 'fee_fixes': fee_fixes}
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

# ── 汇总 ──
from collections import Counter
col_counts = Counter(f['col'] for f in fixes)
print(f"\n[{year}] 分数字段修复统计:")
for col, cnt in sorted(col_counts.items()):
    print(f"  {col}: {cnt} 条")
print(f"[{year}] 学费修复(差>=1万): {len(fee_fixes)} 条")
if fee_fixes:
    for f in fee_fixes[:10]:
        print(f"  idx={f['idx']}, 主表={f['old']}, 分数线={f['new']}")
print(f"\n[{year}] 已保存: {out_path}")
