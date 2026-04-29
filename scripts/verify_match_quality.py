# -*- coding: utf-8 -*-
"""验证3个年份匹配质量：一致率统计"""
import pandas as pd
import numpy as np
import re, warnings
warnings.filterwarnings('ignore')

master = pd.read_excel(
    r"C:\Users\Administrator\Documents\VolunteerHelper\data\03_专家版主表\output\专业招生主表.xlsx"
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

master.loc[has_map, 'jk'] = (
    master.loc[has_map, '院校全名'].astype(str) + '||' +
    master.loc[has_map, '批次_m'].astype(str) + '||' +
    master.loc[has_map, '科类_m'].astype(str) + '||' +
    master.loc[has_map, '专业'].astype(str).str.strip()
)

year_configs = {
    2024: {
        'fields': [('24录取人数','录取人数'), ('24最低分','最低分'), ('24最低分位次','最低位次'),
                   ('24平均分','平均分'), ('24最高分','最高分')],
    },
    2023: {
        'fields': [('23录取人数','录取人数'), ('23最低分','最低分'), ('23最低分位次','最低位次'),
                   ('23平均分','平均分'), ('23最高分','最高分')],
    },
    2022: {
        'fields': [('22录取人数','录取人数'), ('22最低分','最低分'), ('22最低分位次','最低位次'),
                   ('22平均分','平均分'), ('22最高分','最高分')],
    },
}

for year, cfg in year_configs.items():
    score = pd.read_excel(
        rf"C:\Users\Administrator\Documents\VolunteerHelper\data\01_核心录取数据\专业分数线_四川_{year}.xlsx"
    )
    score['jk'] = (
        score['院校名称'].astype(str) + '||' +
        score['批次'].astype(str) + '||' +
        score['科类'].astype(str) + '||' +
        score['专业名称'].astype(str).str.strip()
    )

    score_slim = score[['jk','录取人数','最低分','最低位次','平均分','最高分']].copy()
    score_slim.columns = ['jk','s_录取人数','s_最低分','s_最低位次','s_平均分','s_最高分']
    score_slim = score_slim.drop_duplicates(subset='jk', keep='first')

    merged = master[has_map].merge(score_slim, on='jk', how='inner')

    print(f"\n{'='*60}")
    print(f"{year}年 匹配质量验证 (合并{len(merged)}条)")
    print(f"{'='*60}")

    for m_col, s_col in cfg['fields']:
        s_col_name = 's_' + s_col
        m_val = pd.to_numeric(merged[m_col], errors='coerce')
        s_val = pd.to_numeric(merged[s_col_name], errors='coerce')
        both_nz = m_val.notna() & s_val.notna() & (m_val != 0) & (s_val != 0)
        same = (m_val[both_nz] == s_val[both_nz]).sum()
        total = both_nz.sum()
        diff = total - same
        pct = same / total * 100 if total > 0 else 0
        print(f"  {m_col:12s}: 可比={total:6d}, 一致={same:6d} ({pct:5.1f}%), 差异={diff:5d}")
