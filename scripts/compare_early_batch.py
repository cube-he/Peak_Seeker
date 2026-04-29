# -*- coding: utf-8 -*-
"""提前批招生计划 vs 主表比对 - 2025年"""
import pandas as pd
import re, warnings
warnings.filterwarnings('ignore')
pd.set_option('display.width', 250)
pd.set_option('display.max_colwidth', 18)

master = pd.read_excel(
    r"C:\Users\Administrator\Documents\VolunteerHelper\data\03_专家版主表\output\专业招生主表.xlsx"
)
plan = pd.read_excel(
    r"C:\Users\Administrator\Documents\VolunteerHelper\data\01_核心录取数据\提前批招生计划_四川_2025.xlsx"
)

# ── 只取M类型(专业级) ──
pm = plan[plan['数据类型'] == 'M'].copy()

# ── 解析标题 ──
def parse_title(title):
    s = str(title)
    kemu = '物理' if '物理' in s else ('历史' if '历史' in s else None)
    if '国家专项' in s and '提前' in s: batch = '本科提前批(国家专项)'
    elif '高校专项' in s and '提前' in s: batch = '本科提前批(高校专项)'
    elif '高职' in s or '专科提前' in s: batch = '专科提前批'
    elif 'A段' in s: batch = '本科提前批A段'
    elif 'B段' in s: batch = '本科提前批B段'
    else: batch = None
    return kemu, batch

pm[['解析科类','解析批次']] = pm['标题'].apply(lambda x: pd.Series(parse_title(x)))

# 从院校名称提取专业组和基础名
def extract_group(name):
    if pd.isna(name): return None
    m = re.search(r'专业组(\d+)', str(name))
    return int(m.group(1)) if m else None

def extract_base_name(name):
    if pd.isna(name): return None
    return re.sub(r'\(专业组\d+\)', '', str(name)).strip()

pm['专业组'] = pm['院校名称'].apply(extract_group)
pm['院校基础名'] = pm['院校名称'].apply(extract_base_name)

valid = pm['解析批次'].notna() & pm['解析科类'].notna() & pm['专业招生代码'].notna()
print(f"提前批M记录: {len(pm)}, 有效(可匹配): {valid.sum()}")
print(f"解析批次分布: {pm['解析批次'].value_counts().to_dict()}")

# ── 构建匹配键 ──
pm.loc[valid, 'jk'] = (
    pm.loc[valid, '院校基础名'].astype(str) + '||' +
    pm.loc[valid, '解析批次'].astype(str) + '||' +
    pm.loc[valid, '解析科类'].astype(str) + '||' +
    pm.loc[valid, '专业组'].astype(str) + '||' +
    pm.loc[valid, '专业招生代码'].astype(str).str.strip()
)

early_batches = ['本科提前批A段','本科提前批B段','专科提前批','本科提前批(国家专项)','本科提前批(高校专项)']
early_m = master[master['批次'].isin(early_batches)].copy()

early_m['jk'] = (
    early_m['院校名称'].astype(str) + '||' +
    early_m['批次'].astype(str) + '||' +
    early_m['科目'].astype(str) + '||' +
    early_m['专业组代码'].astype(str) + '||' +
    early_m['专业代码'].astype(str).str.strip()
)

mk = set(early_m['jk'])
sk = set(pm['jk'].dropna())
matched = mk & sk
print(f"\n匹配: {len(matched)}/{len(mk)} ({len(matched)/len(mk)*100:.1f}%)")

# ── 合并比对 ──
pm_slim = pm[valid][['jk','院校基础名','专业名称','计划人数','学费','学制']].copy()
pm_slim.columns = ['jk','p_院校','p_专业名','p_计划','p_学费','p_学制']
pm_slim = pm_slim.drop_duplicates(subset='jk', keep='first')

merged = early_m.merge(pm_slim, on='jk', how='inner')
print(f"合并行数: {len(merged)}")

# ── 逐字段比对 ──
fields = [
    ('计划人数', 'p_计划', '计划人数'),
    ('学制', 'p_学制', '学制'),
    ('学费', 'p_学费', '学费'),
]

for m_col, p_col, label in fields:
    m_val = merged[m_col].astype(str).str.strip().replace(['nan','None',''],'NaN_')
    p_val = merged[p_col].astype(str).str.strip().replace(['nan','None',''],'NaN_')
    both_valid = (m_val != 'NaN_') & (p_val != 'NaN_')
    total = both_valid.sum()

    if total == 0:
        print(f"\n{label}: 无可比数据")
        continue

    # 尝试数值比较
    m_num = pd.to_numeric(merged.loc[both_valid, m_col], errors='coerce')
    p_num = pd.to_numeric(merged.loc[both_valid, p_col], errors='coerce')
    both_num = m_num.notna() & p_num.notna()

    if both_num.sum() > total * 0.5:
        same = (m_num[both_num] == p_num[both_num]).sum()
        diff = both_num.sum() - same
        print(f"\n{label}: 可比={both_num.sum()}, 一致={same} ({same/both_num.sum()*100:.1f}%), 差异={diff}")
        if diff > 0 and diff <= 30:
            diff_mask = both_valid.copy()
            diff_mask[both_valid] = both_num & (m_num != p_num)
            print(f"  全部差异:")
            for _, row in merged[diff_mask].iterrows():
                print(f"    {row['院校名称']:14s} | {row['专业']:12s} | {row['批次']:12s} | {row['科目']} | "
                      f"主表={row[m_col]} vs 提前批={row[p_col]}")
        elif diff > 30:
            diff_mask = both_valid.copy()
            diff_mask[both_valid] = both_num & (m_num != p_num)
            print(f"  前15条差异:")
            for _, row in merged[diff_mask].head(15).iterrows():
                print(f"    {row['院校名称']:14s} | {row['专业']:12s} | {row['批次']:12s} | {row['科目']} | "
                      f"主表={row[m_col]} vs 提前批={row[p_col]}")
    else:
        same = (m_val[both_valid] == p_val[both_valid]).sum()
        diff = total - same
        print(f"\n{label}: 可比={total}, 一致={same} ({same/total*100:.1f}%), 差异={diff}")
        if diff > 0:
            diff_mask = both_valid & (m_val != p_val)
            for _, row in merged[diff_mask].head(15).iterrows():
                print(f"    {row['院校名称']:14s} | {row['专业']:12s} | 主表='{row[m_col]}' vs 提前批='{row[p_col]}'")

# 专业名称一致性验证
name_eq = merged['专业'].astype(str).str.strip() == merged['p_专业名'].astype(str).str.strip()
print(f"\n专业名称一致: {name_eq.sum()}/{len(merged)} ({name_eq.sum()/len(merged)*100:.1f}%)")
