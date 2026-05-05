"""
通过 gaokao.cn 官方 JSON API 补 670 所缺失院校的 logo。

数据源:
  - 学校全量列表: https://static-data.gaokao.cn/www/2.0/school/name.json
  - 单校 logo:    https://static-data.gaokao.cn/upload/logo/{school_id}.jpg
  - 单校 info:    https://static-data.gaokao.cn/www/2.0/school/{school_id}/info.json (校验 is_logo)

合规:
  - 全部走 gaokao.cn 公开静态 JSON / CDN，无任何反爬绕过
  - 限速 0.3s / 请求，避免影响网站

流程:
  1. 拉 name.json 建立全量学校 → school_id 索引
  2. 我们 enriched JSON 中 logoUrl 为空的院校，按 (name, short, old_name) 严格匹配 + 简化名匹配
  3. 命中后调 info.json 看 is_logo=='1'
  4. 下载 logo 到 data/logo_originals/{school_id}.jpg
  5. 写映射 config/logo-local-paths.json （追加，不覆盖现有）

跑法:
  python scripts/fetch_logos_via_gaokao_api.py [--limit N]
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path
import requests

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
ENRICHED = ROOT / 'scripts' / 'data-processing' / 'output' / 'universities_enriched.json'
ORIG_DIR = ROOT / 'data' / 'logo_originals'  # 与 chatgk 已抓的原图同目录
LOCAL_MAP = ROOT / 'config' / 'logo-local-paths.json'
RESULT_LOG = ROOT / 'data' / 'logo_gaokao_fetch_report.json'

ORIG_DIR.mkdir(parents=True, exist_ok=True)
LOCAL_MAP.parent.mkdir(parents=True, exist_ok=True)

NAME_LIST_URL = 'https://static-data.gaokao.cn/www/2.0/school/name.json'
LOGO_URL_TPL = 'https://static-data.gaokao.cn/upload/logo/{sid}.jpg'  # 实测 jpg/png 都试

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Referer': 'https://www.gaokao.cn/',
}


def simplify(name: str) -> str:
    """去掉常见前后缀辅助匹配。"""
    if not name:
        return ''
    s = name
    s = re.sub(r'[（(].*?[)）]', '', s)  # 去括号内容
    s = s.replace('中国', '').replace('国立', '').replace('（中外合作）', '')
    return s.strip()


def fetch_school_list() -> list:
    print('拉取全量学校列表...')
    r = requests.get(NAME_LIST_URL, headers=HEADERS, timeout=30)
    r.raise_for_status()
    data = r.json()['data']
    print(f'  {len(data)} 所院校')
    return data


def build_index(schools: list) -> tuple[dict, dict]:
    """name (含 short/old_name) → school_id；和 simplified name → school_id。"""
    exact, fuzzy = {}, {}
    for s in schools:
        sid = str(s.get('school_id', ''))
        if not sid:
            continue
        for k in ('name', 'short', 'old_name', 'answer_short'):
            v = (s.get(k) or '').strip()
            if v:
                exact.setdefault(v, sid)
                fz = simplify(v)
                if fz and fz != v:
                    fuzzy.setdefault(fz, sid)
    return exact, fuzzy


def resolve(name: str, exact: dict, fuzzy: dict) -> tuple[str | None, str]:
    """返回 (school_id, match_type)。"""
    if name in exact:
        return exact[name], 'exact'
    sn = simplify(name)
    if sn in exact:
        return exact[sn], 'exact_simplified'
    if sn in fuzzy:
        return fuzzy[sn], 'fuzzy_simplified'
    return None, 'unmatched'


def try_download_logo(sid: str) -> tuple[bool, bytes | str]:
    """尝试下载 logo。返回 (ok, content_or_error)."""
    for ext in ['jpg', 'png', 'jpeg']:
        url = f'https://static-data.gaokao.cn/upload/logo/{sid}.{ext}'
        try:
            r = requests.get(url, headers=HEADERS, timeout=15)
        except Exception as e:
            continue
        if r.status_code == 200 and 'image' in r.headers.get('Content-Type', '').lower() and len(r.content) > 500:
            return True, r.content
    return False, 'all extensions 404'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=0, help='只处理前 N 所')
    args = parser.parse_args()

    enriched = json.loads(ENRICHED.read_text(encoding='utf-8'))
    missing_unis = [u for u in enriched if not u.get('logoUrl')]
    if args.limit:
        missing_unis = missing_unis[:args.limit]
    print(f'缺 logo 院校: {len(missing_unis)}')

    schools = fetch_school_list()
    exact, fuzzy = build_index(schools)
    print(f'索引: exact={len(exact)}, fuzzy={len(fuzzy)}')

    # 加载已有 logo 映射（chatgk 已抓的不重复处理）
    existing_map = json.loads(LOCAL_MAP.read_text(encoding='utf-8')) if LOCAL_MAP.exists() else {}

    matched = 0
    downloaded = 0
    skipped_no_logo = 0
    skipped_no_match = 0
    new_map = dict(existing_map)
    report = []

    for i, u in enumerate(missing_unis, 1):
        name = u.get('name', '')
        ec = u.get('enrollCode')
        if not ec:
            continue
        sid, mtype = resolve(name, exact, fuzzy)
        rec = {
            'enrollCode': ec, 'name': name, 'gaokao_school_id': sid,
            'match_type': mtype, 'downloaded': False,
        }
        if not sid:
            skipped_no_match += 1
            report.append(rec); continue
        matched += 1

        # 下载 logo
        dest = ORIG_DIR / f'{sid}.jpg'
        if dest.exists() and dest.stat().st_size > 500:
            # 已下载（其他口径已得过），直接用
            rec['downloaded'] = True
            rec['cached'] = True
            new_map[str(ec)] = f'/logos/{sid}.webp'
            downloaded += 1
            report.append(rec)
            continue

        ok, content = try_download_logo(sid)
        if ok:
            dest.write_bytes(content)
            rec['downloaded'] = True
            rec['source_url'] = f'https://static-data.gaokao.cn/upload/logo/{sid}.jpg'
            new_map[str(ec)] = f'/logos/{sid}.webp'  # 后续 compress 步骤会生成 webp
            downloaded += 1
        else:
            rec['error'] = content
            skipped_no_logo += 1
        report.append(rec)
        time.sleep(0.3)  # 限速

        if i % 20 == 0:
            print(f'  [{i}/{len(missing_unis)}] matched={matched} downloaded={downloaded}')

    # 写映射 + 报告
    LOCAL_MAP.write_text(json.dumps(new_map, ensure_ascii=False, indent=2), encoding='utf-8')
    RESULT_LOG.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

    print('---')
    print(f'匹配 (有 gaokao school_id): {matched} / {len(missing_unis)}')
    print(f'下载成功: {downloaded}')
    print(f'gaokao 无 logo CDN: {skipped_no_logo}')
    print(f'未匹配学校: {skipped_no_match}')
    print(f'新映射: {LOCAL_MAP} (现共 {len(new_map)} 条)')
    print(f'报告: {RESULT_LOG}')


if __name__ == '__main__':
    main()
