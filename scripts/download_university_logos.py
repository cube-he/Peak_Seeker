"""
一次性脚本：把 universities_enriched.json 中的 logoUrl（mcdn.chatgk.com）下载到本地。

输出:
  apps/web/public/logos/{schoolId}.{ext}        每张 logo
  scripts/data-processing/output/logo_local_paths.json   {enrollCode -> '/logos/xxx.ext'}

跑法: python scripts/download_university_logos.py
幂等: 已下载的文件跳过。
"""
import json
import sys
import re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'scripts' / 'data-processing' / 'output' / 'universities_enriched.json'
DEST_DIR = ROOT / 'apps' / 'web' / 'public' / 'logos'
MAP_OUT = ROOT / 'scripts' / 'data-processing' / 'output' / 'logo_local_paths.json'

DEST_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.gaokao.cn/',
}

URL_RE = re.compile(r'^https?://[^/]+/(?:school/)?([^/]+)/logo\.([a-zA-Z0-9]+)')


def parse_url(url: str):
    """从 URL 提取 schoolId + 扩展名。失败返回 (None, None)."""
    m = URL_RE.match(url)
    if not m:
        return None, None
    return m.group(1), m.group(2).lower()


def download_one(item):
    enroll_code, name, url = item
    sid, ext = parse_url(url)
    if not sid:
        return ('skip_badurl', enroll_code, name, url, 0)
    fname = f'{sid}.{ext}'
    dest = DEST_DIR / fname
    if dest.exists() and dest.stat().st_size > 0:
        return ('cached', enroll_code, name, fname, dest.stat().st_size)
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        if not r.content:
            return ('fail_empty', enroll_code, name, url, 0)
        dest.write_bytes(r.content)
        return ('ok', enroll_code, name, fname, len(r.content))
    except requests.HTTPError as e:
        return ('fail_http', enroll_code, name, f'{url}: {e.response.status_code}', 0)
    except Exception as e:
        return ('fail', enroll_code, name, f'{url}: {type(e).__name__}: {e}', 0)


def main():
    print(f'reading {SRC}')
    data = json.loads(SRC.read_text(encoding='utf-8'))
    items = [
        (u.get('enrollCode'), u.get('name'), u.get('logoUrl'))
        for u in data if u.get('logoUrl')
    ]
    print(f'total with logoUrl: {len(items)}')

    results = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(download_one, it): it for it in items}
        for i, fut in enumerate(as_completed(futs), 1):
            results.append(fut.result())
            if i % 100 == 0:
                ok = sum(1 for r in results if r[0] in ('ok', 'cached'))
                print(f'  [{i}/{len(items)}] ok={ok}')

    ok = [r for r in results if r[0] == 'ok']
    cached = [r for r in results if r[0] == 'cached']
    fails = [r for r in results if r[0].startswith('fail') or r[0] == 'skip_badurl']

    total_bytes = sum(r[4] for r in ok + cached)
    n_have = len(ok) + len(cached)
    print('---')
    print(f'OK new: {len(ok)}')
    print(f'cached: {len(cached)}')
    print(f'failed: {len(fails)}')
    print(f'total size: {total_bytes/1024/1024:.2f} MB ({total_bytes} bytes)')
    if n_have:
        print(f'avg size:   {total_bytes/n_have/1024:.2f} KB')
        sizes = sorted([r[4] for r in ok + cached])
        print(f'min/median/max: {sizes[0]/1024:.1f} / {sizes[len(sizes)//2]/1024:.1f} / {sizes[-1]/1024:.1f} KB')

    if fails:
        print('--- first 10 failures ---')
        for r in fails[:10]:
            print(f'  [{r[0]}] {r[1]} {r[2]} - {r[3]}')

    # Build mapping for DB backfill: enrollCode -> /logos/<file>
    mapping = {}
    for r in ok + cached:
        ec = r[1]
        fname = r[3]
        if ec is not None:
            mapping[str(ec)] = f'/logos/{fname}'
    MAP_OUT.write_text(json.dumps(mapping, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'mapping saved: {MAP_OUT} ({len(mapping)} entries)')


if __name__ == '__main__':
    main()
