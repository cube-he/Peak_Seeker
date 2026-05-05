"""
本地审核 server：浏览器打开 http://localhost:8765/ 逐校审核校徽。

工作流:
  1. python scripts/logo_review_server.py
  2. 浏览器访问 http://localhost:8765/
  3. 每校 6 候选缩略图 + 键盘 1-6 选 / 0 拒绝 / N 跳过 / B 上一所
  4. 决策实时写入 data/logo_review_decisions.json:
     {
       "<enrollCode>": {
         "decision": "1" | "rejected" | null,
         "name": str,
         "source_url": "..."(来源 URL，bing murl),
         "page_url": "..."(来源页 URL, purl),
         "reviewed_at": "ISO8601",
         "filename_chosen": "cand_N.png"
       }
     }
  5. 审核完成后跑 apply_reviewed_logos.py 应用决策
"""
import json
import sys
import urllib.parse
from datetime import datetime, timezone, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
CAND_DIR = ROOT / 'data' / 'logo_candidates'
DECISIONS_PATH = ROOT / 'data' / 'logo_review_decisions.json'
CST = timezone(timedelta(hours=8))


def load_decisions() -> dict:
    if DECISIONS_PATH.exists():
        return json.loads(DECISIONS_PATH.read_text(encoding='utf-8'))
    return {}


def save_decisions(data: dict):
    DECISIONS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def list_pending() -> list:
    """返回所有有候选数据的院校列表，附决策状态。"""
    decisions = load_decisions()
    items = []
    if not CAND_DIR.exists():
        return items
    for school_dir in sorted(CAND_DIR.iterdir(), key=lambda p: int(p.name) if p.name.isdigit() else 0):
        if not school_dir.is_dir():
            continue
        meta_path = school_dir / 'metadata.json'
        if not meta_path.exists():
            continue
        meta = json.loads(meta_path.read_text(encoding='utf-8'))
        ec = str(meta.get('enrollCode'))
        items.append({
            'enrollCode': ec,
            'name': meta.get('name'),
            'candidates': meta.get('candidates', []),
            'reviewed': ec in decisions,
            'decision': decisions.get(ec),
        })
    return items


INDEX_HTML = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>校徽审核</title>
<style>
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; margin: 0; background: #1a1a1a; color: #eee; }
  .top { padding: 16px 24px; background: #111; border-bottom: 1px solid #333; display: flex; gap: 16px; align-items: center; position: sticky; top: 0; z-index: 10; }
  .top h1 { margin: 0; font-size: 18px; font-weight: 600; }
  .pos { color: #888; font-size: 13px; }
  .pos b { color: #4af; }
  .school { padding: 24px; }
  .school h2 { margin: 0 0 8px; font-size: 22px; }
  .school .meta { color: #888; font-size: 13px; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; max-width: 1400px; }
  .cand { border: 2px solid #333; border-radius: 8px; padding: 8px; background: #222; cursor: pointer; transition: all .15s; position: relative; min-height: 200px; }
  .cand:hover { border-color: #4af; background: #2a2a2a; }
  .cand .num { position: absolute; top: 4px; left: 4px; background: #4af; color: #000; width: 24px; height: 24px; border-radius: 50%; font-weight: bold; display: flex; align-items: center; justify-content: center; font-size: 13px; }
  .cand img { display: block; width: 100%; height: 160px; object-fit: contain; background: #fff; border-radius: 4px; }
  .cand .src { font-size: 11px; color: #888; margin-top: 6px; word-break: break-all; line-height: 1.3; height: 30px; overflow: hidden; }
  .cand .title { font-size: 11px; color: #aaa; margin-top: 4px; word-break: break-all; line-height: 1.3; height: 26px; overflow: hidden; }
  .actions { margin-top: 20px; display: flex; gap: 8px; align-items: center; }
  .btn { padding: 10px 18px; border-radius: 6px; border: 1px solid #444; background: #2a2a2a; color: #eee; cursor: pointer; font-size: 14px; }
  .btn:hover { background: #333; }
  .btn-reject { border-color: #844; color: #f88; }
  .btn-reject:hover { background: #422; }
  .btn-skip { border-color: #886; }
  .btn-prev { border-color: #468; }
  .hint { color: #666; font-size: 12px; margin-left: auto; }
  .empty { text-align: center; padding: 80px 20px; color: #888; }
  .filter-bar { display: flex; gap: 12px; margin-left: auto; }
  .filter-btn { padding: 6px 12px; font-size: 12px; border-radius: 4px; cursor: pointer; background: #222; color: #ccc; border: 1px solid #444; }
  .filter-btn.active { background: #4af; color: #000; border-color: #4af; }
  .reviewed-badge { color: #4f4; font-size: 12px; }
  .rejected-badge { color: #f66; font-size: 12px; }
</style>
</head>
<body>
<div class="top">
  <h1>校徽审核</h1>
  <span class="pos">进度 <b id="pos">0</b> / <b id="total">0</b> 已审 <b id="done">0</b> · 通过 <b id="passed">0</b> · 拒绝 <b id="rejected">0</b></span>
  <div class="filter-bar">
    <span class="filter-btn active" data-filter="pending">待审</span>
    <span class="filter-btn" data-filter="all">全部</span>
    <span class="filter-btn" data-filter="reviewed">已审</span>
  </div>
</div>
<div id="app"></div>

<script>
let items = [], idx = 0, filter = 'pending';

async function load() {
  const r = await fetch('/api/items');
  items = await r.json();
  updateStats();
  jumpToPending();
  render();
}

function updateStats() {
  const done = items.filter(x => x.reviewed).length;
  const passed = items.filter(x => x.reviewed && x.decision && x.decision.decision !== 'rejected').length;
  const rejected = items.filter(x => x.reviewed && x.decision && x.decision.decision === 'rejected').length;
  document.getElementById('total').textContent = items.length;
  document.getElementById('done').textContent = done;
  document.getElementById('passed').textContent = passed;
  document.getElementById('rejected').textContent = rejected;
}

function visibleItems() {
  if (filter === 'pending') return items.filter(x => !x.reviewed);
  if (filter === 'reviewed') return items.filter(x => x.reviewed);
  return items;
}

function jumpToPending() {
  const vis = visibleItems();
  if (vis.length === 0) { idx = 0; return; }
  idx = 0;
}

function render() {
  const vis = visibleItems();
  const app = document.getElementById('app');
  document.getElementById('pos').textContent = vis.length === 0 ? 0 : (idx + 1);
  if (vis.length === 0) {
    app.innerHTML = '<div class="empty">' + (filter === 'pending' ? '🎉 全部审完！' : '此筛选下没有数据') + '</div>';
    return;
  }
  if (idx >= vis.length) idx = vis.length - 1;
  if (idx < 0) idx = 0;
  const it = vis[idx];

  const cands = it.candidates.filter(c => c.saved);
  let badge = '';
  if (it.reviewed && it.decision) {
    if (it.decision.decision === 'rejected') {
      badge = ' <span class="rejected-badge">[已拒绝]</span>';
    } else {
      badge = ' <span class="reviewed-badge">[已选 ' + it.decision.decision + ']</span>';
    }
  }

  let html = '<div class="school">';
  html += '<h2>' + escapeHtml(it.name) + badge + '</h2>';
  html += '<div class="meta">enrollCode: ' + it.enrollCode + ' · ' + cands.length + ' 候选</div>';
  html += '<div class="grid">';
  cands.forEach((c, i) => {
    const n = c.index;
    const imgSrc = '/static/' + it.enrollCode + '/' + c.saved_filename;
    html += '<div class="cand" data-n="' + n + '" onclick="choose(\\'' + it.enrollCode + '\\', \\'' + n + '\\')">';
    html += '<div class="num">' + n + '</div>';
    html += '<img src="' + imgSrc + '" loading="lazy">';
    html += '<div class="title" title="' + escapeHtml(c.title || '') + '">' + escapeHtml(c.title || '') + '</div>';
    html += '<div class="src" title="' + escapeHtml(c.purl || '') + '">' + escapeHtml(extractHost(c.murl)) + '</div>';
    html += '</div>';
  });
  html += '</div>';
  html += '<div class="actions">';
  html += '<button class="btn btn-prev" onclick="prev()">← 上一所 (B)</button>';
  html += '<button class="btn btn-skip" onclick="next()">跳过 →</button>';
  html += '<button class="btn btn-reject" onclick="reject(\\'' + it.enrollCode + '\\')">全部不对 (0)</button>';
  html += '<span class="hint">键盘: 1-6 选 · 0 拒 · N 下一所 · B 上一所</span>';
  html += '</div></div>';
  app.innerHTML = html;
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
function extractHost(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

async function choose(enrollCode, n) {
  await fetch('/api/decide', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ enrollCode, decision: String(n) })
  });
  // 更新本地状态
  const it = items.find(x => x.enrollCode === enrollCode);
  if (it) {
    it.reviewed = true;
    it.decision = { decision: String(n) };
  }
  updateStats();
  next();
}

async function reject(enrollCode) {
  await fetch('/api/decide', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ enrollCode, decision: 'rejected' })
  });
  const it = items.find(x => x.enrollCode === enrollCode);
  if (it) {
    it.reviewed = true;
    it.decision = { decision: 'rejected' };
  }
  updateStats();
  next();
}

function next() {
  const vis = visibleItems();
  if (vis.length === 0) { render(); return; }
  if (filter === 'pending') {
    // 待审筛选下，下一个未审的总在 idx 0
    idx = 0;
  } else {
    idx = Math.min(idx + 1, vis.length - 1);
  }
  render();
}
function prev() {
  const vis = visibleItems();
  idx = Math.max(idx - 1, 0);
  render();
}

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const vis = visibleItems();
  if (vis.length === 0) return;
  const it = vis[idx];
  if (e.key >= '1' && e.key <= '6') {
    const n = parseInt(e.key);
    if (it.candidates.some(c => c.saved && c.index === n)) {
      choose(it.enrollCode, e.key);
    }
  } else if (e.key === '0') {
    reject(it.enrollCode);
  } else if (e.key.toLowerCase() === 'n') {
    next();
  } else if (e.key.toLowerCase() === 'b') {
    prev();
  }
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filter = btn.dataset.filter;
    idx = 0;
    render();
  };
});

load();
</script>
</body>
</html>
'''


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass  # 静默

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == '/' or path == '/index.html':
            self._send(200, 'text/html; charset=utf-8', INDEX_HTML.encode('utf-8'))
            return
        if path == '/api/items':
            data = list_pending()
            self._send(200, 'application/json; charset=utf-8',
                       json.dumps(data, ensure_ascii=False).encode('utf-8'))
            return
        if path.startswith('/static/'):
            rel = path[len('/static/'):]
            file_path = (CAND_DIR / rel).resolve()
            try:
                file_path.relative_to(CAND_DIR.resolve())  # 防穿越
            except ValueError:
                self._send(403, 'text/plain', b'forbidden'); return
            if file_path.exists() and file_path.is_file():
                ct = self._guess_ct(file_path.suffix)
                self._send(200, ct, file_path.read_bytes())
                return
            self._send(404, 'text/plain', b'not found'); return
        self._send(404, 'text/plain', b'not found')

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path == '/api/decide':
            n = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(n).decode('utf-8')) if n else {}
            ec = str(body.get('enrollCode'))
            dec = body.get('decision')
            decisions = load_decisions()
            # 取来源 URL（从 metadata）
            meta_path = CAND_DIR / ec / 'metadata.json'
            meta = json.loads(meta_path.read_text(encoding='utf-8')) if meta_path.exists() else {}
            entry = {
                'name': meta.get('name'),
                'decision': dec,
                'reviewed_at': datetime.now(CST).isoformat(timespec='seconds'),
            }
            if dec != 'rejected':
                # 找到对应候选的源 URL
                idx = int(dec)
                cand = next((c for c in meta.get('candidates', []) if c.get('index') == idx and c.get('saved')), None)
                if cand:
                    entry['source_url'] = cand.get('murl')
                    entry['page_url'] = cand.get('purl')
                    entry['filename_chosen'] = cand.get('saved_filename')
                    entry['title'] = cand.get('title')
            decisions[ec] = entry
            save_decisions(decisions)
            self._send(200, 'application/json', b'{"ok":true}')
            return
        self._send(404, 'text/plain', b'not found')

    def _send(self, status, ct, body):
        self.send_response(status)
        self.send_header('Content-Type', ct)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _guess_ct(self, ext):
        return {
            '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
        }.get(ext.lower(), 'application/octet-stream')


if __name__ == '__main__':
    port = 8765
    print(f'审核服务启动: http://localhost:{port}/')
    print(f'决策实时写入: {DECISIONS_PATH}')
    print('Ctrl+C 退出')
    HTTPServer(('127.0.0.1', port), Handler).serve_forever()
