# -*- coding: utf-8 -*-
"""分析2024差异模式，辅助判断数据可信度"""
import pandas as pd
import numpy as np
import re, json, warnings
warnings.filterwarnings('ignore')
pd.set_option('display.width', 250)
pd.set_option('display.max_colwidth', 18)

master = pd.read_excel(
    r"C:\Users\Administrator\Documents\VolunteerHelper\data\03_专家版主表\output\专业招生主表.xlsx"
)
score = pd.read_excel(
    r"C:\Users\Administrator\Documents\VolunteerHelper\data\01_核心录取数据\专业分数线_四川_2024.xlsx"
)

# ── 匹配 ──
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

score_slim = score[['jk','院校名称','批次','科类','专业名称',
                     '录取人数','最低分','最低位次','平均分','平均位次','最高分','最高位次']].copy()
score_slim.columns = ['jk','s_院校名称','s_批次','s_科类','s_专业名称',
                       's_录取人数','s_最低分','s_最低位次','s_平均分','s_平均位次','s_最高分','s_最高位次']
score_slim = score_slim.drop_duplicates(subset='jk', keep='first')

merged = master[has_map].merge(score_slim, on='jk', how='inner')

# ── 各字段差异分析 ──
fields = [
    ('24录取人数', 's_录取人数', '录取人数'),
    ('24最低分',   's_最低分',   '最低分'),
    ('24最低分位次','s_最低位次', '最低位次'),
    ('24平均分',   's_平均分',   '平均分'),
    ('24最高分',   's_最高分',   '最高分'),
]

for m_col, s_col, label in fields:
    m_val = pd.to_numeric(merged[m_col], errors='coerce')
    s_val = pd.to_numeric(merged[s_col], errors='coerce')
    both_nz = m_val.notna() & s_val.notna() & (m_val != 0) & (s_val != 0)
    diff = both_nz & (m_val != s_val)

    if diff.sum() == 0:
        continue

    delta = (m_val[diff] - s_val[diff])

    print(f"\n{'='*70}")
    print(f"{label}: 差异{diff.sum()}条 (可比{both_nz.sum()}条中)")
    print(f"{'='*70}")
    print(f"  主表偏大: {(delta > 0).sum()} 条, 主表偏小: {(delta < 0).sum()} 条")
    print(f"  差值绝对值: min={abs(delta).min():.0f}, median={abs(delta).median():.0f}, "
          f"max={abs(delta).max():.0f}, mean={abs(delta).mean():.1f}")

    # 按招生类型分布
    type_dist = merged[diff]['招生类型'].value_counts().head(10)
    print(f"  按招生类型分布: {type_dist.to_dict()}")

    # 按批次分布
    batch_dist = merged[diff]['老批次'].value_counts().head(10)
    print(f"  按老批次分布: {batch_dist.to_dict()}")

    # 逐条列出(前15)
    print(f"\n  前15条差异:")
    diff_rows = merged[diff].head(15)
    for _, row in diff_rows.iterrows():
        d = float(row[m_col]) - float(row[s_col])
        # 检查主表值是否等于专业组级别的值(24专业组最低分等)
        group_val = ''
        if '最低分' in label and '24专业组最低分' in merged.columns:
            gv = row.get('24专业组最低分', '')
            group_val = f' | 24专业组最低分={gv}'
        elif '录取人数' in label and '24专业组录取人数' in merged.columns:
            gv = row.get('24专业组录取人数', '')
            group_val = f' | 24专业组录取={gv}'

        print(f"    {row['院校名称']:12s} | {row['专业']:12s} | {row['招生类型']:6s} | "
              f"老批次={str(row['老批次']):16s} | "
              f"主表={float(row[m_col]):.0f} vs 分数线={float(row[s_col]):.0f} (差={d:+.0f}){group_val}")

# ── 关键问题：主表值是否来自专业组聚合？──
print(f"\n{'='*70}")
print(f"关键验证：主表24最低分 vs 24专业组最低分 关系")
print(f"{'='*70}")
m_low = pd.to_numeric(merged['24最低分'], errors='coerce')
s_low = pd.to_numeric(merged['s_最低分'], errors='coerce')
g_low = pd.to_numeric(merged['24专业组最低分'], errors='coerce')

both_nz = m_low.notna() & s_low.notna() & g_low.notna() & (m_low != 0) & (s_low != 0) & (g_low != 0)
diff = both_nz & (m_low != s_low)

if diff.sum() > 0:
    m_eq_g = (m_low[diff] == g_low[diff]).sum()  # 主表最低分 == 专业组最低分
    s_eq_g = (s_low[diff] == g_low[diff]).sum()
    print(f"  在最低分不一致的记录中(有专业组数据的):")
    print(f"    主表最低分 == 24专业组最低分: {m_eq_g}/{diff.sum()}")
    print(f"    分数线最低分 == 24专业组最低分: {s_eq_g}/{diff.sum()}")
    print(f"    → 主表最低分来自专业组聚合值的比例: {m_eq_g/diff.sum()*100:.1f}%")

# 同样检查录取人数
print(f"\n关键验证：主表24录取人数 vs 24专业组录取人数 关系")
m_rec = pd.to_numeric(merged['24录取人数'], errors='coerce')
s_rec = pd.to_numeric(merged['s_录取人数'], errors='coerce')
g_rec = pd.to_numeric(merged['24专业组录取人数'], errors='coerce')

both_nz2 = m_rec.notna() & s_rec.notna() & g_rec.notna() & (m_rec != 0) & (s_rec != 0) & (g_rec != 0)
diff2 = both_nz2 & (m_rec != s_rec)

if diff2.sum() > 0:
    m_eq_g2 = (m_rec[diff2] == g_rec[diff2]).sum()
    s_eq_g2 = (s_rec[diff2] == g_rec[diff2]).sum()
    print(f"  在录取人数不一致的记录中(有专业组数据的):")
    print(f"    主表录取人数 == 24专业组录取人数: {m_eq_g2}/{diff2.sum()}")
    print(f"    分数线录取人数 == 24专业组录取人数: {s_eq_g2}/{diff2.sum()}")
    print(f"    → 主表录取人数来自专业组聚合值的比例: {m_eq_g2/diff2.sum()*100:.1f}%")
