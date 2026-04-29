# -*- coding: utf-8 -*-
"""探索提前批招生计划数据结构，确定匹配策略"""
import pandas as pd
import re, warnings
warnings.filterwarnings('ignore')
pd.set_option('display.width', 200)

# ── 读取2025提前批 ──
df = pd.read_excel(
    r"C:\Users\Administrator\Documents\VolunteerHelper\data\01_核心录取数据\提前批招生计划_四川_2025.xlsx"
)

# 只看专业级记录(M类型)
m_rows = df[df['数据类型'] == 'M'].copy()
print(f"2025提前批 总行数={len(df)}, M类型(专业级)={len(m_rows)}")

# 从标题解析科类和批次
print("\n=== 标题分布(前20) ===")
print(m_rows['标题'].value_counts().head(20).to_string())

# 解析标题
def parse_title(title):
    s = str(title)
    kemu = '物理' if '物理' in s else ('历史' if '历史' in s else None)

    if '国家专项' in s: batch = '本科提前批(国家专项)'
    elif '高校专项' in s: batch = '本科提前批(高校专项)'
    elif 'A段' in s: batch = '本科提前批A段'
    elif 'B段' in s: batch = '本科提前批B段'
    elif '专科提前' in s: batch = '专科提前批'
    else: batch = None

    return kemu, batch

m_rows[['解析科类','解析批次']] = m_rows['标题'].apply(lambda x: pd.Series(parse_title(x)))
print(f"\n=== 解析结果 ===")
print(f"科类: {m_rows['解析科类'].value_counts().to_dict()}")
print(f"批次: {m_rows['解析批次'].value_counts().to_dict()}")

# 从院校名称解析专业组代码
def extract_group(name):
    if pd.isna(name): return None
    m = re.search(r'专业组(\d+)', str(name))
    return int(m.group(1)) if m else None

def extract_base_name(name):
    if pd.isna(name): return None
    return re.sub(r'\(专业组\d+\)', '', str(name)).strip()

m_rows['专业组'] = m_rows['院校名称'].apply(extract_group)
m_rows['院校基础名'] = m_rows['院校名称'].apply(extract_base_name)

print(f"\n=== 提前批样本数据(前10条M记录) ===")
cols = ['院校基础名','专业组','解析批次','解析科类','专业招生代码','专业名称','计划人数','学费','学制']
print(m_rows[cols].head(10).to_string())

# ── 主表提前批记录 ──
master = pd.read_excel(
    r"C:\Users\Administrator\Documents\VolunteerHelper\data\03_专家版主表\output\专业招生主表.xlsx"
)
early_batches = ['本科提前批A段','本科提前批B段','专科提前批','本科提前批(国家专项)','本科提前批(高校专项)']
early_m = master[master['批次'].isin(early_batches)].copy()
print(f"\n=== 主表提前批 ===")
print(f"总数: {len(early_m)}")
print(f"批次: {early_m['批次'].value_counts().to_dict()}")
print(f"科目: {early_m['科目'].value_counts().to_dict()}")

# ── 尝试匹配 ──
# 主表key: 院校名称 + 批次 + 科目 + 专业组代码 + 专业代码
early_m['jk'] = (
    early_m['院校名称'].astype(str) + '||' +
    early_m['批次'].astype(str) + '||' +
    early_m['科目'].astype(str) + '||' +
    early_m['专业组代码'].astype(str) + '||' +
    early_m['专业代码'].astype(str).str.strip()
)

# 提前批key
valid = m_rows['解析批次'].notna() & m_rows['解析科类'].notna() & m_rows['专业招生代码'].notna()
m_rows.loc[valid, 'jk'] = (
    m_rows.loc[valid, '院校基础名'].astype(str) + '||' +
    m_rows.loc[valid, '解析批次'].astype(str) + '||' +
    m_rows.loc[valid, '解析科类'].astype(str) + '||' +
    m_rows.loc[valid, '专业组'].astype(str) + '||' +
    m_rows.loc[valid, '专业招生代码'].astype(str).str.strip()
)

mk = set(early_m['jk'])
sk = set(m_rows['jk'].dropna())
print(f"\n=== 匹配统计(专业代码) ===")
print(f"主表key: {len(mk)}, 提前批key: {len(sk)}")
print(f"匹配: {len(mk & sk)} ({len(mk & sk)/len(mk)*100:.1f}%)")

# 也试试专业名称匹配
early_m['jk2'] = (
    early_m['院校名称'].astype(str) + '||' +
    early_m['批次'].astype(str) + '||' +
    early_m['科目'].astype(str) + '||' +
    early_m['专业组代码'].astype(str) + '||' +
    early_m['专业'].astype(str).str.strip()
)

m_rows.loc[valid, 'jk2'] = (
    m_rows.loc[valid, '院校基础名'].astype(str) + '||' +
    m_rows.loc[valid, '解析批次'].astype(str) + '||' +
    m_rows.loc[valid, '解析科类'].astype(str) + '||' +
    m_rows.loc[valid, '专业组'].astype(str) + '||' +
    m_rows.loc[valid, '专业名称'].astype(str).str.strip()
)

mk2 = set(early_m['jk2'])
sk2 = set(m_rows['jk2'].dropna())
print(f"\n=== 匹配统计(专业名称) ===")
print(f"主表key: {len(mk2)}, 提前批key: {len(sk2)}")
print(f"匹配: {len(mk2 & sk2)} ({len(mk2 & sk2)/len(mk2)*100:.1f}%)")

# 主表有哪些可比字段
print(f"\n=== 可比字段 ===")
print(f"提前批有: 计划人数, 学费, 学制, 专业名称, 选科要求")
print(f"提前批没有: 分数、位次、录取人数（这是招生计划表不是分数线表）")
