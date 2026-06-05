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
OUTPUT = ROOT / 'apps' / 'web' / 'public' / 'data' / 'rank-map-2025.json'

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


def main():
    df = pd.read_excel(EXCEL)
    print(f'读取主表: {len(df)} 行')

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
        'version': '2025-06-05',
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

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f'\n写入: {OUTPUT}')
    print(f'物理类: {len(out["tracks"]["物理"]["batches"])} 批次 / 招生计划合计 {out["tracks"]["物理"]["招生计划合计"]}')
    print(f'历史类: {len(out["tracks"]["历史"]["batches"])} 批次 / 招生计划合计 {out["tracks"]["历史"]["招生计划合计"]}')


if __name__ == '__main__':
    main()
