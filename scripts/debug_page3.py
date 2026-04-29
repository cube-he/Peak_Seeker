#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, re, base64, json, time, requests
from pathlib import Path
from PIL import Image
import io
sys.stdout.reconfigure(encoding='utf-8')

PROXY_URL = 'http://172.237.4.191:80/v1/messages'
API_KEY = 'sk-ant-0544a2ab13a75c1fcfc624970251b3cc'
API_HEADERS = {
    'x-api-key': API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
}

img_path = Path('C:/Users/Administrator/Documents/LocalOCR/cache/普通高考/专科批次/4428_征集志愿_第一次_2025_专科批/4428_002.jpg')
img = Image.open(str(img_path))
w, h = img.size
if max(w,h) > 1500:
    ratio = 1500/max(w,h)
    img = img.resize((int(w*ratio), int(h*ratio)), Image.LANCZOS)
buf = io.BytesIO()
img.save(buf, format='JPEG', quality=88)
b64 = base64.standard_b64encode(buf.getvalue()).decode('utf-8')

state = {'keli': '历史类', 'zslx': '普通类', 'yxdm': None, 'yxmc': None, 'bxxz': None, 'yxdz': None, 'yxbz': None, 'zyzqdm': None, 'zxkmyq': None, 'zyzyhs': None}
state_str = json.dumps(state, ensure_ascii=False)

prompt = f"""你是OCR数据提取Agent，从2025年四川省专科征集志愿文件（B1格式）中精准提取数据。

**当前页码**: 3
**跨页继承状态**: {state_str}

请提取本页所有专业行（L5层）记录，输出JSON数组。
字段: keli,zslx,yxdm,yxmc,bxxz,yxdz,yxbz,zyzqdm,zxkmyq,zyzyhs,zydm,zymc,zybz,zyhs,sf,page
- keli: "历史类"或"物理类"（去序号）
- zslx: "普通类"等（去序号）
- yxdm: 4位数字字符串，如"0382"
- bxxz: 如"公办""民办院校""独立学院"
- yxdz: 括号中的城市/省份
- yxbz: 院校备注行内容（无则null）
- sf: 字符串，如"3300"
- 专业名括号全部拆到zybz（用；分隔）

只输出JSON数组，不要任何其他文字或markdown。"""

payload = {
    'model': 'claude-haiku-4-5',
    'max_tokens': 4096,
    'messages': [{'role': 'user', 'content': [
        {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': b64}},
        {'type': 'text', 'text': prompt}
    ]}]
}
r = requests.post(PROXY_URL, headers=API_HEADERS, json=payload, timeout=180)
print('status:', r.status_code)
if r.status_code == 200:
    text = r.json()['content'][0]['text'].strip()
    print('RAW (first 500):', text[:500])
    print()
    # 提取JSON
    m = re.search(r'\[.*\]', text, re.DOTALL)
    if m:
        data = json.loads(m.group())
        print(f'提取到 {len(data)} 条')
        for d in data:
            key = f"{d.get('yxdm')}_{d.get('zyzqdm')}_{d.get('zydm')}"
            print(f'  key={key} zymc={d.get("zymc")} sf={d.get("sf")} yxbz={str(d.get("yxbz"))[:30]}')
    else:
        print('no JSON array found')
