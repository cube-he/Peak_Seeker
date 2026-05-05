"""
抓 682 所缺 logo 的院校：必应图搜 `{校名} 校徽` → 下载前 N 张候选。

流程:
  1. 读 universities_enriched.json，过滤 logoUrl 为空的
  2. 必应图搜 cn.bing.com，解析 <a class="iusc" m="...">
  3. 优先排序: .edu.cn > 教育聚合站 (eol/chsi/gaokao.com/youzy) > 其他
  4. 下载前 N 张到 data/logo_candidates/{enrollCode}/cand_{i}.{ext}
  5. 写每校 metadata.json 记录候选 URL/title/source/score

跑法（限制条数测试）:
  python scripts/scrape_missing_logos.py --limit 20
全量:
  python scripts/scrape_missing_logos.py
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import quote, urlparse
import requests

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'scripts' / 'data-processing' / 'output' / 'universities_enriched.json'
OUT_DIR = ROOT / 'data' / 'logo_candidates'
OUT_DIR.mkdir(parents=True, exist_ok=True)

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

# 候选来源优先级（域名分数；越高越靠前）
PREFERRED = {
    'edu.cn': 100,        # 学校官网
    'chsi.com.cn': 90,    # 教育部学信网
    'eol.cn': 80,         # 教育在线
    'gaokao.com': 75,
    'eduyun.cn': 75,
    'youzy.cn': 70,       # 优志愿
    'gaokao.chsi.com.cn': 95,
    'mcdn.chatgk.com': 85,
}

# 不要的来源（图床/广告/不可靠站）
BLACKLIST = {
    'pinterest.com',
    '5118.com',
    'bdstatic.com',
}

CANDIDATES_PER_SCHOOL = 6


def domain_score(url: str) -> int:
    try:
        host = urlparse(url).hostname or ''
    except Exception:
        return 0
    if any(b in host for b in BLACKLIST):
        return -1
    score = 0
    for k, v in PREFERRED.items():
        if k in host:
            score = max(score, v)
    return score


def parse_bing_results(html: str) -> list:
    """从 bing 图搜 HTML 提取候选。每个候选: {murl, turl, t, purl, score}."""
    results = []
    # bing 把每个结果的 metadata 放在 <a class="iusc" m="JSON" ...>
    matches = re.findall(r'<a[^>]*class="iusc"[^>]*\bm="([^"]+)"', html)
    seen_urls = set()
    for raw in matches:
        decoded = (raw
                   .replace('&quot;', '"')
                   .replace('&amp;', '&')
                   .replace('&#39;', "'"))
        try:
            data = json.loads(decoded)
        except json.JSONDecodeError:
            continue
        murl = data.get('murl')
        if not murl or murl in seen_urls:
            continue
        seen_urls.add(murl)
        score = domain_score(murl) + domain_score(data.get('purl', ''))
        results.append({
            'murl': murl,
            'turl': data.get('turl'),
            'title': data.get('t', '')[:200],
            'purl': data.get('purl', '')[:300],
            'score': score,
        })
    # 按分数降序 → 不分享分数的按 bing 原顺序
    results.sort(key=lambda x: -x['score'])
    return results


LOGO_KEYWORDS = ('校徽', 'logo', 'LOGO', '标志', '徽标', '校标')


def search_bing(name: str) -> list:
    """搜索某校，返回候选列表。优先透明 PNG（校徽典型），不够再回退普通搜索。"""
    headers = {'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9'}

    queries = [
        # 第一轮: 透明 PNG 滤镜 + 关键词 "校徽"
        f'https://cn.bing.com/images/search?q={quote(f"{name} 校徽")}&qft=+filterui:photo-transparent&first=1',
        # 第二轮: clipart 滤镜（线条/插画风）
        f'https://cn.bing.com/images/search?q={quote(f"{name} 校徽")}&qft=+filterui:photo-clipart&first=1',
        # 第三轮: 无滤镜兜底
        f'https://cn.bing.com/images/search?q={quote(f"{name} 校徽 logo")}&first=1',
    ]

    all_results = []
    seen_urls = set()
    for url in queries:
        try:
            r = requests.get(url, headers=headers, timeout=20)
            if r.status_code != 200:
                continue
            for c in parse_bing_results(r.text):
                if c['murl'] in seen_urls:
                    continue
                seen_urls.add(c['murl'])
                # title 含 "校徽" / "logo" 加分
                t = (c.get('title') or '').lower()
                if any(k.lower() in t for k in LOGO_KEYWORDS):
                    c['score'] += 80
                all_results.append(c)
            if len(all_results) >= CANDIDATES_PER_SCHOOL * 2:
                break  # 已经够多了
        except Exception:
            continue
        time.sleep(0.5)
    # 重新按分数排序（含新加的 title 加分）
    all_results.sort(key=lambda x: -x['score'])
    return all_results


def guess_ext(url: str, content_type: str) -> str:
    ct = (content_type or '').lower()
    if 'png' in ct: return 'png'
    if 'webp' in ct: return 'webp'
    if 'gif' in ct: return 'gif'
    if 'svg' in ct: return 'svg'
    if 'jpeg' in ct or 'jpg' in ct: return 'jpg'
    # fallback to URL
    p = urlparse(url).path.lower()
    for ext in ['png', 'webp', 'gif', 'svg', 'jpg', 'jpeg']:
        if p.endswith('.' + ext):
            return 'jpg' if ext == 'jpeg' else ext
    return 'jpg'


def download_one_candidate(url: str, dest_no_ext: Path, source_referer: str) -> tuple[bool, str, int]:
    headers = {
        'User-Agent': UA,
        'Referer': source_referer or 'https://cn.bing.com/',
    }
    try:
        r = requests.get(url, headers=headers, timeout=15, stream=True)
        if r.status_code != 200:
            return False, f'HTTP {r.status_code}', 0
        ct = r.headers.get('Content-Type', '')
        if 'image' not in ct.lower():
            return False, f'not image ({ct})', 0
        # 限制大小
        size_limit = 5 * 1024 * 1024  # 5MB
        chunks = []
        total = 0
        for chunk in r.iter_content(chunk_size=8192):
            chunks.append(chunk)
            total += len(chunk)
            if total > size_limit:
                return False, 'too large', total
        if total < 500:
            return False, 'too small', total
        ext = guess_ext(url, ct)
        dest = dest_no_ext.with_suffix(f'.{ext}')
        dest.write_bytes(b''.join(chunks))
        return True, str(dest.name), total
    except Exception as e:
        return False, f'{type(e).__name__}: {str(e)[:100]}', 0


def process_school(uni: dict) -> dict:
    enroll_code = uni.get('enrollCode')
    name = uni.get('name', '')
    out_dir = OUT_DIR / str(enroll_code)
    out_dir.mkdir(parents=True, exist_ok=True)

    # 已经处理过（有 metadata.json 且 success > 0）的跳过
    meta_path = out_dir / 'metadata.json'
    if meta_path.exists():
        existing = json.loads(meta_path.read_text(encoding='utf-8'))
        if existing.get('success_count', 0) > 0:
            return {'enrollCode': enroll_code, 'name': name, 'status': 'cached', 'count': existing['success_count']}

    candidates = search_bing(name)
    candidates = candidates[:CANDIDATES_PER_SCHOOL]
    if not candidates:
        meta_path.write_text(json.dumps({'name': name, 'enrollCode': enroll_code, 'candidates': [], 'success_count': 0}, ensure_ascii=False, indent=2), encoding='utf-8')
        return {'enrollCode': enroll_code, 'name': name, 'status': 'no_results', 'count': 0}

    saved = []
    for i, c in enumerate(candidates, 1):
        dest_no_ext = out_dir / f'cand_{i}'
        ok, info, sz = download_one_candidate(c['murl'], dest_no_ext, c.get('purl', ''))
        c['index'] = i
        c['saved'] = ok
        c['saved_filename'] = info if ok else None
        c['error'] = info if not ok else None
        c['size'] = sz
        if ok:
            saved.append(i)

    meta = {
        'name': name,
        'enrollCode': enroll_code,
        'candidates': candidates,
        'success_count': len(saved),
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
    return {'enrollCode': enroll_code, 'name': name, 'status': 'ok' if saved else 'all_failed', 'count': len(saved)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=0, help='只处理前 N 所（0 = 全量）')
    parser.add_argument('--workers', type=int, default=2, help='并发数（保守，避免触发反爬）')
    args = parser.parse_args()

    data = json.loads(SRC.read_text(encoding='utf-8'))
    missing = [u for u in data if not u.get('logoUrl')]
    if args.limit:
        missing = missing[:args.limit]
    print(f'目标: {len(missing)} 所院校')

    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(process_school, u): u for u in missing}
        for i, fut in enumerate(as_completed(futs), 1):
            results.append(fut.result())
            r = results[-1]
            if i % 5 == 0 or i == len(missing):
                ok_count = sum(1 for x in results if x['status'] in ('ok', 'cached'))
                print(f'  [{i}/{len(missing)}] ok={ok_count}  recent: {r["name"]} ({r["status"]}, {r["count"]} 候选)')

    print('---')
    by_status = {}
    for r in results:
        by_status[r['status']] = by_status.get(r['status'], 0) + 1
    for k, v in by_status.items():
        print(f'  {v:5d}  {k}')


if __name__ == '__main__':
    main()
