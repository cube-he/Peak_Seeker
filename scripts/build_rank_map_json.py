"""
生成「位次档位地图」静态 JSON。
读取专业招生主表 + 2025 批次结构, 聚合后输出到 apps/web/public/data/rank-map-2025.json。
每年高考完后重跑一次即可 (替换 STRUCT_2025 + EXCEL 路径)。

注: data/03_专家版主表/ 在 .gitignore 里, 主表不入版本控制;
    本脚本入 scripts/ 版本控制, 在本地运行时读取 ROOT/data/03_专家版主表 下的 Excel.

用法:
  python scripts/build_rank_map_json.py
"""
import json
import sys
import io
from pathlib import Path

# 输出 UTF-8 防 Windows 控制台乱码
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
EXCEL = ROOT / 'data' / '03_专家版主表' / 'output' / '专业招生主表.xlsx'
# 主表无办学性质列, 需 join 院校信息表(按院校代码)拿公办/民办
UNI_INFO_EXCEL = ROOT / 'data' / '03_专家版主表' / 'output' / '院校信息表.xlsx'
OUTPUT = ROOT / 'apps' / 'web' / 'public' / 'data' / 'rank-map-2025.json'

# 公办&民办都达到此组数, 该(批次,类型)才纳入公私对比(自然得到本科批B段普通类/专科批普通类)
NATURE_MIN_GROUPS = 10

# 2025 批次结构 (同步自 2025年批次结构.xlsx, 删 NaN + 整理顺序)
STRUCT_2025 = [
    (1, 1.0,  '1',     '本科提前批(国家专项)', '国家专项计划'),
    (2, 2.0,  '2',     '本科提前批A段',         '军事类'),
    (3, 2.0,  '2',     '本科提前批A段',         '飞行技术'),
    (4, 2.0,  '2',     '本科提前批A段',         '公安类、司法类'),
    (6, 2.0,  '2',     '本科提前批A段',         '航海类'),
    (7, 2.0,  '2',     '本科提前批A段',         '消防救援'),
    (8, 2.0,  '2',     '本科提前批A段',         '高校综合评价'),
    (9, 2.0,  '2',     '本科提前批A段',         '其他'),
    (10, 3.0, '3',     '本科提前批(高校专项)', '高校专项计划'),
    (11, 4.0, '4',     '本科提前批B段',         '国家公费师范生'),
    (12, 4.0, '4',     '本科提前批B段',         '国家优师专项'),
    (13, 4.0, '4',     '本科提前批B段',         '农村订单定向医学生'),
    (14, 4.0, '4',     '本科提前批B段',         '省级公费师范生'),
    (15, 4.0, '4',     '本科提前批B段',         '地方优师计划'),
    (16, 4.0, '4',     '本科提前批B段',         '乡村振兴计划'),
    (17, 4.0, '4',     '本科提前批B段',         '其他'),
    (18, 5.0, '5',     '本科批A段',             '国家专项计划'),
    (19, 6.0, '6',     '本科批A段',             '地方专项计划'),
    (20, 7.0, '7',     '本科批(高校专项)',     '高校专项计划'),
    (21, 7.5, '7→8之间', '本科批(高水平运动队)', '高水平运动队'),
    (22, 8.0, '8',     '本科批B段',             '普通类本科'),
    (23, 8.0, '8',     '本科批B段',             '本科层次职业教育人才培养改革试点'),
    (24, 8.0, '8',     '本科批B段',             '民族班'),
    (25, 8.0, '8',     '本科批B段',             '非西藏生源定向西藏就业'),
    (26, 8.0, '8',     '本科批B段',             '其他定向招生'),
    (27, 8.0, '8',     '本科批B段',             '部委属和外省属高校少数民族预科、边防军人子女预科、四川大学国防科研试验基地预科'),
    (28, 8.5, '8→9之间', '本科批(原"少数民族语言授课为主")', '本科'),
    (29, 8.5, '8→9之间', '本科批(原"少数民族语言授课为主")', '预科'),
    (30, 8.6, '紧随其后', '本科批(原"加授少数民族语文")',     '原"加授少数民族语文"'),
    (32, 9.0, '9',     '本科批(省属高校少数民族预科)', '省属高校少数民族预科'),
    (31, 10.0, '10',   '本科批(区域教育均衡发展专项)', '区域教育均衡发展专项计划'),
    (33, 11.0, '11',   '高职(专科)提前批',     '定向培养军士'),
    (34, 11.0, '11',   '高职(专科)提前批',     '公安类、司法类'),
    (36, 11.0, '11',   '高职(专科)提前批',     '航海类'),
    (37, 12.0, '12',   '高职(专科)批',         '普通类高职(专科)'),
    (38, 12.5, '12之后', '高职(专科)批',         '原"少数民族语言授课为主"'),
    (39, 12.9, '最后', '高职(专科)批',         '原"加授少数民族语文"'),
]

# 位次档位 (按各科类末档位次精挑)
RANK_BANDS = {
    '物理': [
        {'min': 0,       'max': 17000,  'label': '顶尖', 'desc': '国家公费师范级'},
        {'min': 17000,   'max': 85000,  'label': '高分', 'desc': '提前批+特殊本科主战场'},
        {'min': 85000,   'max': 207000, 'label': '中分', 'desc': '本科批B段主战场'},
        {'min': 207000,  'max': 285000, 'label': '低分', 'desc': '仅专科批'},
        {'min': 285000,  'max': None,   'label': '超低', 'desc': '无可填批次'},
    ],
    '历史': [
        {'min': 0,       'max': 2200,   'label': '顶尖', 'desc': '国家公费师范级'},
        {'min': 2200,    'max': 17000,  'label': '高分', 'desc': '提前批+特殊本科主战场'},
        {'min': 17000,   'max': 70000,  'label': '中分', 'desc': '本科批B段主战场'},
        {'min': 70000,   'max': 178000, 'label': '低分', 'desc': '仅专科批'},
        {'min': 178000,  'max': None,   'label': '超低', 'desc': '无可填批次'},
    ],
}

# 2025 参考人数 (一段表最低累计)
TOTAL_APPLICANTS = {'物理': 284789, '历史': 177978}


def norm_nature(v):
    """办学性质归一. 公私对比只关心公办/民办, 中外合作等返回 None 不纳入。"""
    s = str(v)
    if '公办' in s or '公立' in s:
        return '公办'
    if '民办' in s or '独立' in s:
        return '民办'
    return None


def build_nature_breakdown(df, track):
    """按 (批次, 类型, 性质) 算「组末位」五分位分布。

    单看末位公私无差异(批次地板共用), 差异在分布: 公办整体靠前、民办靠后。
    末位取自专业组级字段 25专业组最低位次, 故先去重到专业组粒度(一组一个末位)。
    只收公办&民办都 >= NATURE_MIN_GROUPS 组的 (批次,类型), 其他批次基本全公办无对比意义。
    """
    sub = df[(df['科目'] == track) & (df['性质'].notna()) & (df['25专业组最低位次'] > 0)].copy()
    grp = sub.drop_duplicates(['院校代码', '专业组代码', '录取批次', '招生类型'])

    result = []
    for (batch, rtype), g in grp.groupby(['录取批次', '招生类型']):
        natures = {}
        for nat in ['公办', '民办']:
            v = g[g['性质'] == nat]['25专业组最低位次']
            if len(v) == 0:
                continue
            # 计划: 该 (批次,类型,性质) 全部专业行(非去重)的计划人数之和
            plan = int(
                sub[(sub['录取批次'] == batch) & (sub['招生类型'] == rtype) & (sub['性质'] == nat)]['计划人数']
                .fillna(0)
                .sum()
            )
            natures[nat] = {
                '组数': int(len(v)),
                '最优': int(v.min()),
                'p25': int(v.quantile(0.25)),
                '中位': int(v.median()),
                'p75': int(v.quantile(0.75)),
                '末位': int(v.max()),
                '计划': plan,
            }
        if (
            '公办' in natures
            and '民办' in natures
            and natures['公办']['组数'] >= NATURE_MIN_GROUPS
            and natures['民办']['组数'] >= NATURE_MIN_GROUPS
        ):
            result.append({'批次': batch, '招生类型': rtype, 'natures': natures})

    # 按投档顺序排(本科在前专科在后), 用 STRUCT_2025 里该批次类型的最小排序号
    order = {}
    for 序号, 顺序排序, 投档顺序, 录取批次, 招生类型 in STRUCT_2025:
        order.setdefault((录取批次, 招生类型), 顺序排序)
    result.sort(key=lambda x: order.get((x['批次'], x['招生类型']), 999))
    return result


def main():
    df = pd.read_excel(EXCEL)
    print(f'读取主表: {len(df)} 行')

    # join 院校信息表拿办学性质(主表无此列), 归一成 公办/民办
    uni_info = pd.read_excel(UNI_INFO_EXCEL)[['院校代码', '办学性质']]
    df = df.merge(uni_info, on='院校代码', how='left')
    df['性质'] = df['办学性质'].map(norm_nature)
    print(f'办学性质命中: {df["办学性质"].notna().sum()}/{len(df)}')

    # 聚合
    agg = df.groupby(['录取批次', '招生类型', '科目'], dropna=False).agg(
        招生计划=('计划人数', 'sum'),
        实际录取=('25录取人数', 'sum'),
        最低分=('25专业组最低分', lambda s: s[s > 0].min() if (s > 0).any() else None),
        最低位次=('25专业组最低位次', lambda s: s[s > 0].max() if (s > 0).any() else None),
        专业组数=('专业组代码', 'nunique'),
    ).reset_index()

    # NaN → None for JSON
    def clean(v):
        if pd.isna(v):
            return None
        if isinstance(v, (int,)):
            return int(v)
        if hasattr(v, 'item'):
            return v.item()
        return v

    out = {
        'version': '2026-06-07',
        'year': 2025,
        'province': '四川',
        'tracks': {},
        'rankBands': RANK_BANDS,
    }

    for track in ['物理', '历史']:
        batches = []
        for 序号, 顺序排序, 投档顺序, 录取批次, 招生类型 in STRUCT_2025:
            row = agg[
                (agg['录取批次'] == 录取批次)
                & (agg['招生类型'] == 招生类型)
                & (agg['科目'] == track)
            ]
            if len(row) == 0:
                # 主表未拆分
                entry = {
                    '序号': 序号,
                    '投档顺序排序': 顺序排序,
                    '投档顺序': 投档顺序,
                    '录取批次': 录取批次,
                    '招生类型': 招生类型,
                    '招生计划': None,
                    '实际录取': None,
                    '最低分': None,
                    '最低位次': None,
                    '组数': None,
                    '主表对齐': False,
                }
            else:
                r = row.iloc[0]
                entry = {
                    '序号': 序号,
                    '投档顺序排序': 顺序排序,
                    '投档顺序': 投档顺序,
                    '录取批次': 录取批次,
                    '招生类型': 招生类型,
                    '招生计划': clean(r['招生计划']),
                    '实际录取': clean(r['实际录取']),
                    '最低分': clean(r['最低分']),
                    '最低位次': clean(r['最低位次']),
                    '组数': clean(r['专业组数']),
                    '主表对齐': True,
                }
            batches.append(entry)

        # 按"投档顺序排序"+ 序号排
        batches.sort(key=lambda x: (x['投档顺序排序'], x['序号']))

        # 累计
        cum_plan = 0
        cum_admit = 0
        for b in batches:
            cum_plan += b['招生计划'] or 0
            cum_admit += b['实际录取'] or 0
            b['累计招生计划'] = cum_plan
            b['累计实际录取'] = cum_admit

        out['tracks'][track] = {
            '参考人数': TOTAL_APPLICANTS[track],
            '招生计划合计': cum_plan,
            '实际录取合计': cum_admit,
            'batches': batches,
        }

    # 公办 vs 民办 录取位次分布(新增区块用)
    out['natureBreakdown'] = {
        track: build_nature_breakdown(df, track) for track in ['物理', '历史']
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f'\n写入: {OUTPUT}')
    print(f'物理类: {len(out["tracks"]["物理"]["batches"])} 批次 / 招生计划合计 {out["tracks"]["物理"]["招生计划合计"]}')
    print(f'历史类: {len(out["tracks"]["历史"]["batches"])} 批次 / 招生计划合计 {out["tracks"]["历史"]["招生计划合计"]}')
    for track in ['物理', '历史']:
        nb = out['natureBreakdown'][track]
        print(f'natureBreakdown {track}: {len(nb)} 批次 → ' + ', '.join(
            f'{x["批次"]}·{x["招生类型"]}(公办中位{x["natures"]["公办"]["中位"]}/民办中位{x["natures"]["民办"]["中位"]})'
            for x in nb
        ))


if __name__ == '__main__':
    main()
