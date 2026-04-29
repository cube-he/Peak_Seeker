# -*- coding: utf-8 -*-
"""提前批招生计划 vs 主表比对 - 2024/2023/2022年
提前批是招生计划表，只有计划人数/学费/学制
老高考：科类=文理，批次=提前批/国家专项等
"""
import pandas as pd
import re, sys, json, warnings
warnings.filterwarnings('ignore')
pd.set_option('display.width', 250)

year = int(sys.argv[1])
prefix = str(year)[2:]

master = pd.read_excel(
    r"C:\Users\Administrator\Documents\VolunteerHelper\data\03_专家版主表\output\专业招生主表.xlsx"
)
plan = pd.read_excel(
    rf"C:\Users\Administrator\Documents\VolunteerHelper\data\01_核心录取数据\提前批招生计划_四川_{year}.xlsx"
)

# ── 提前批：只取M类型 ──
pm = plan[plan['数据类型'] == 'M'].copy()
print(f"[{year}] 提前批M记录: {len(pm)}")

# ── 解析标题(老高考格式) ──
def parse_title(title):
    s = str(title)
    kemu = None
    if '理科' in s or '理工' in s: kemu = '理科'
    elif '文科' in s or '文史' in s: kemu = '文科'
    elif '物理' in s: kemu = '理科'
    elif '历史' in s: kemu = '文科'

    batch = None
    if '国家专项' in s and '国家优师' not in s: batch = '国家专项'
    elif '高校专项' in s: batch = '高校专项'
    elif '地方专项' in s: batch = '地方专项'
    elif '专科' in s or '高职' in s: batch = '专科提前'
    elif '提前' in s or '本科' in s: batch = '本科提前'
    return kemu, batch

pm[['解析科类','解析批次']] = pm['标题'].apply(lambda x: pd.Series(parse_title(x)))

print(f"  解析科类: {pm['解析科类'].value_counts().to_dict()}")
print(f"  解析批次: {pm['解析批次'].value_counts().to_dict()}")

# ── 主表：提前批记录，用老批次匹配 ──
early_batches = ['本科提前批A段','本科提前批B段','专科提前批','本科提前批(国家专项)','本科提前批(高校专项)']
early_m = master[master['批次'].isin(early_batches)].copy()

kemu_map = {'物理': '理科', '历史': '文科'}
early_m['科类_m'] = early_m['科目'].map(kemu_map)

# 主表老批次 → 提前批解析批次
def map_master_batch(row):
    batch = str(row['批次'])
    old = str(row.get('老批次', ''))
    if '国家专项' in old or '国家专项' in batch: return '国家专项'
    if '高校专项' in old or '高校专项' in batch: return '高校专项'
    if '地方专项' in old: return '地方专项'
    if '专科' in batch or '专科' in old: return '专科提前'
    return '本科提前'

early_m['批次_m'] = early_m.apply(map_master_batch, axis=1)

# ── 用专业名称匹配（跨年专业代码不稳定）──
valid_p = pm['解析批次'].notna() & pm['解析科类'].notna() & pm['专业名称'].notna()
pm.loc[valid_p, 'jk'] = (
    pm.loc[valid_p, '院校名称'].astype(str).str.replace(r'\([^)]*\)', '', regex=True).str.strip() + '||' +
    pm.loc[valid_p, '解析批次'].astype(str) + '||' +
    pm.loc[valid_p, '解析科类'].astype(str) + '||' +
    pm.loc[valid_p, '专业名称'].astype(str).str.strip()
)

early_m['jk'] = (
    early_m['院校名称'].astype(str) + '||' +
    early_m['批次_m'].astype(str) + '||' +
    early_m['科类_m'].astype(str) + '||' +
    early_m['专业'].astype(str).str.strip()
)

mk = set(early_m['jk'])
sk = set(pm['jk'].dropna())
matched = mk & sk
print(f"\n[{year}] 匹配: {len(matched)}/{len(mk)} ({len(matched)/len(mk)*100:.1f}%)")

# ── 合并 ──
pm_slim = pm[valid_p][['jk','院校名称','专业名称','计划人数','学费','学制']].copy()
pm_slim.columns = ['jk','p_院校','p_专业','p_计划','p_学费','p_学制']
pm_slim = pm_slim.drop_duplicates(subset='jk', keep='first')

merged = early_m.merge(pm_slim, on='jk', how='inner')
print(f"[{year}] 合并行数: {len(merged)}")

# ── 主表对应年份的计划人数列名 ──
plan_col = f'{prefix}计划人数' if f'{prefix}计划人数' in merged.columns else None

# ── 比对 ──
compare_fields = []
if plan_col:
    compare_fields.append((plan_col, 'p_计划', '计划人数'))
compare_fields.append(('学制', 'p_学制', '学制'))
compare_fields.append(('学费', 'p_学费', '学费'))

for m_col, p_col, label in compare_fields:
    m_num = pd.to_numeric(merged[m_col], errors='coerce')
    p_num = pd.to_numeric(merged[p_col], errors='coerce')
    both_nz = m_num.notna() & p_num.notna() & (m_num != 0) & (p_num != 0)
    total = both_nz.sum()
    if total == 0:
        print(f"\n  {label}: 无可比数据")
        continue
    same = (m_num[both_nz] == p_num[both_nz]).sum()
    diff_count = total - same
    print(f"\n  {label}: 可比={total}, 一致={same} ({same/total*100:.1f}%), 差异={diff_count}")

    if diff_count > 0:
        diff_mask = both_nz & (m_num != p_num)
        rows = merged[diff_mask].head(15)
        for _, row in rows.iterrows():
            print(f"    {row['院校名称']:14s} | {row['专业']:12s} | {row['批次']:12s} | {row['科目']} | "
                  f"主表={row[m_col]} vs 提前批={row[p_col]}")
