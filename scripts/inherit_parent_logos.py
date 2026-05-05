"""
分校/校区/医学院继承本部 logo。

策略:
  对缺 logo 的院校，按命名模式匹配本部，如本部已有 /logos/X.webp 则继承。
  覆盖模式: (校区) / 分校 / 医学院 等

输出:
  生成 SQL UPDATE 语句到 scripts/_tmp_inherit_logos.sql（部署时手动 scp + 跑）
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
ENRICHED = ROOT / 'scripts' / 'data-processing' / 'output' / 'universities_enriched.json'
LOCAL_MAP = ROOT / 'config' / 'logo-local-paths.json'
SQL_OUT = ROOT / 'scripts' / '_tmp_inherit_logos.sql'

PATTERNS = [
    re.compile(r'^(.+?)[（(].+?校区[)）]$'),         # 中国人民大学(苏州校区)
    re.compile(r'^(.+?)[（(][^（()]+?[)）]$'),       # 哈尔滨工业大学(威海) / (深圳)
    re.compile(r'^(.+?)分校$'),                     # 山东大学威海分校
    re.compile(r'^(.+?)秦皇岛分校$'),                # 东北大学秦皇岛分校
    re.compile(r'^(.+?)医学院$'),                   # 复旦大学医学院
]

# enrollCode 主键 → /logos/...webp（本地映射）
local_map = json.loads(LOCAL_MAP.read_text(encoding='utf-8'))
data = json.loads(ENRICHED.read_text(encoding='utf-8'))

# 名字 → enrollCode（本部）
name_to_ec = {u['name']: str(u.get('enrollCode')) for u in data if u.get('enrollCode')}

inherits = []  # (child_enroll_code, child_name, parent_name, parent_logo_path)
for u in data:
    if u.get('logoUrl'):
        continue
    name = u['name']
    ec = u.get('enrollCode')
    if not ec:
        continue
    for pat in PATTERNS:
        m = pat.match(name)
        if not m:
            continue
        parent = m.group(1)
        parent_ec = name_to_ec.get(parent)
        if not parent_ec:
            continue
        parent_logo = local_map.get(parent_ec)
        if not parent_logo:
            continue
        # 找到了！本部已有自托管 logo
        inherits.append((str(ec), name, parent, parent_logo))
        break

print(f'可继承本部 logo 的院校: {len(inherits)}')
for ec, name, parent, logo in inherits:
    print(f'  [{ec:>6}] {name:30} ← {parent}  ({logo})')

if inherits:
    lines = ['-- inherit parent logos one-shot', 'USE volunteer_helper;']
    for ec, name, parent, logo in inherits:
        ec_safe = ec.replace("'", "''")
        logo_safe = logo.replace("'", "''")
        lines.append(f"UPDATE universities SET logo_url='{logo_safe}' WHERE code='{ec_safe}';")
    SQL_OUT.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'\nSQL 写入: {SQL_OUT}')
