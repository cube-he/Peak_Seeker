# -*- coding: utf-8 -*-
"""验证：用专业名称替代专业代码匹配"""
import pandas as pd
import numpy as np
import re, warnings
warnings.filterwarnings('ignore')

master = pd.read_excel(
    r"C:\Users\Administrator\Documents\VolunteerHelper\data\03_专家版主表\output\专业招生主表.xlsx"
)
score = pd.read_excel(
    r"C:\Users\Administrator\Documents\VolunteerHelper\data\01_核心录取数据\专业分数线_四川_2024.xlsx"
)

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
    if pd.isna(old_batch): return None
    s = str(old_batch)
    if '一批' in s or '一本' in s or '本一' in s: return '本一'
    if '二批' in s or '二本' in s or '本二' in s: return '本二'
    if '专科' in s: return '专科'
    return None

master['科类_m'] = master['科目'].map(kemu_map)
master['批次_m'] = master['老批次'].apply(map_old_batch)
master['后缀'] = master['招生类型'].map(suffix_map).fillna('')
master['院校全名'] = master['院校名称'] + master['后缀']

has_map = master['批次_m'].notna() & master['科类_m'].notna()

# ===== 方案A: 用专业代码 (旧方案) =====
master.loc[has_map, 'jk_code'] = (
    master.loc[has_map, '院校全名'].astype(str) + '||' +
    master.loc[has_map, '批次_m'].astype(str) + '||' +
    master.loc[has_map, '科类_m'].astype(str) + '||' +
    master.loc[has_map, '专业代码'].astype(str).str.strip()
)
score['jk_code'] = (
    score['院校名称'].astype(str) + '||' +
    score['批次'].astype(str) + '||' +
    score['科类'].astype(str) + '||' +
    score['专业招生代码'].astype(str).str.strip()
)

# ===== 方案B: 用专业名称 =====
master.loc[has_map, 'jk_name'] = (
    master.loc[has_map, '院校全名'].astype(str) + '||' +
    master.loc[has_map, '批次_m'].astype(str) + '||' +
    master.loc[has_map, '科类_m'].astype(str) + '||' +
    master.loc[has_map, '专业'].astype(str).str.strip()
)
score['jk_name'] = (
    score['院校名称'].astype(str) + '||' +
    score['批次'].astype(str) + '||' +
    score['科类'].astype(str) + '||' +
    score['专业名称'].astype(str).str.strip()
)

# 方案A统计
ma = set(master['jk_code'].dropna())
sa = set(score['jk_code'])
print(f"方案A(专业代码): 匹配={len(ma & sa)}/{len(ma)} ({len(ma & sa)/len(ma)*100:.1f}%)")

# 方案B统计
mb = set(master['jk_name'].dropna())
sb = set(score['jk_name'])
print(f"方案B(专业名称): 匹配={len(mb & sb)}/{len(mb)} ({len(mb & sb)/len(mb)*100:.1f}%)")

# 方案B重复key检查
s_dups = score['jk_name'].value_counts()
m_dups = master.loc[has_map, 'jk_name'].value_counts()
print(f"\n方案B重复key: 分数线={( s_dups>1).sum()}, 主表={(m_dups>1).sum()}")

# ── 方案B合并验证 ──
score_slim = score[['jk_name','院校名称','批次','科类','专业招生代码','专业名称',
                     '计划人数','录取人数','最低分','最低位次','平均分','最高分']].copy()
score_slim.columns = ['jk_name','s_院校名称','s_批次','s_科类','s_专业代码','s_专业名称',
                       's_计划人数','s_录取人数','s_最低分','s_最低位次','s_平均分','s_最高分']
# 去重（保留第一条）
score_slim = score_slim.drop_duplicates(subset='jk_name', keep='first')

merged = master[has_map].merge(score_slim, on='jk_name', how='inner')
print(f"\n方案B合并行数: {len(merged)}")

# 计划人数对比
m_plan = merged['24计划人数'].astype(float)
s_plan = merged['s_计划人数'].astype(float)
both_nz = m_plan.notna() & s_plan.notna() & (m_plan != 0) & (s_plan != 0)
same = both_nz & (m_plan == s_plan)
diff = both_nz & (m_plan != s_plan)
print(f"计划人数 - 双方非0: {both_nz.sum()}, 一致: {same.sum()} ({same.sum()/both_nz.sum()*100:.1f}%), 不一致: {diff.sum()}")

# 最低分对比
m_low = merged['24最低分'].astype(float)
s_low = merged['s_最低分'].astype(float)
both_nz2 = m_low.notna() & s_low.notna() & (m_low != 0) & (s_low != 0)
same2 = both_nz2 & (m_low == s_low)
diff2 = both_nz2 & (m_low != s_low)
print(f"最低分 - 双方非0: {both_nz2.sum()}, 一致: {same2.sum()} ({same2.sum()/both_nz2.sum()*100:.1f}%), 不一致: {diff2.sum()}")

# 录取人数对比
m_rec = merged['24录取人数'].astype(float)
s_rec = merged['s_录取人数'].astype(float)
both_nz3 = m_rec.notna() & s_rec.notna() & (m_rec != 0) & (s_rec != 0)
same3 = both_nz3 & (m_rec == s_rec)
diff3 = both_nz3 & (m_rec != s_rec)
print(f"录取人数 - 双方非0: {both_nz3.sum()}, 一致: {same3.sum()} ({same3.sum()/both_nz3.sum()*100:.1f}%), 不一致: {diff3.sum()}")

# 看看计划人数不一致的样本
print(f"\n=== 方案B 计划人数不一致样本(前10) ===")
for _, row in merged[diff].head(10).iterrows():
    print(f"  {row['院校名称']} | {row['专业']} | 老批次={row['老批次']} | 招生类型={row['招生类型']}")
    print(f"    → {row['s_院校名称']} | {row['s_批次']} | {row['s_科类']}")
    print(f"    24计划={row['24计划人数']:.0f} vs 分数线={row['s_计划人数']} | 24最低分={row['24最低分']} vs 分数线={row['s_最低分']}")
    print()
