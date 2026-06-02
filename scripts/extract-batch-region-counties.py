"""
辅助脚本: 从 2025 招生计划合订本 PDF 第 3 页提取附录县名单(物理类/历史类的附录数据相同, 都是省级数据)

用法:
  python scripts/extract-batch-region-counties.py

输出:
  - data/招生考试报/extracted/p3_x6.png (page 3 高分辨率渲染)
  - data/招生考试报/extracted/p3x6_app{N}_full.png (附件 1/2/4/5/6 各自的高清切片)
  - 提示信息: 把切片图打开人工核对, 把核对结果写入 data/seed/batch-region-counties.json

依赖:
  pip install pymupdf pillow

后续可扩展: 接入阿里云 OCR / 腾讯 OCR / 百度 OCR API 自动识别中文
"""

from pathlib import Path
import sys

try:
    import fitz  # pymupdf
    from PIL import Image
except ImportError:
    print('请先安装依赖: pip install pymupdf pillow')
    sys.exit(1)

ROOT = Path(__file__).parent.parent
PDF_DIR = ROOT / 'data' / '招生考试报'
OUT_DIR = PDF_DIR / 'extracted'
OUT_DIR.mkdir(parents=True, exist_ok=True)

# 物理类和历史类附录数据相同 (省级数据), 以物理类为主
PDF_PATH = PDF_DIR / '物理类' / '物理2025招生计划.pdf'

if not PDF_PATH.exists():
    print(f'PDF 不存在: {PDF_PATH}')
    sys.exit(1)

# 6x 渲染 page 3
doc = fitz.open(str(PDF_PATH))
print(f'PDF 共 {len(doc)} 页')
mat = fitz.Matrix(6.0, 6.0)
pix = doc[2].get_pixmap(matrix=mat)  # page 3, 0-indexed
out_p3 = OUT_DIR / 'p3_x6.png'
pix.save(str(out_p3))
print(f'渲染 p3 (6x): {pix.width}x{pix.height} → {out_p3}')
doc.close()

# 切附录 (基于 6x 渲染的视觉布局, 经过实测调整)
img = Image.open(str(out_p3))
w, h = img.size
ratio = 6.0 / 3.5  # 之前 3.5x 的坐标转 6x

regions = {
    'app1_68_原集中连片特困和原国家级扶贫开发重点县': (0, 50, int(1300 * ratio), int(1100 * ratio)),
    'app2_119_民族集中连片特困革命老区艰苦边远': (0, 1050, int(1300 * ratio), 3100),
    'app4_143_省级公费师范实施范围': (0, 3000, int(1300 * ratio), 4150),
    'app5_88_乡村振兴实施范围': (0, 4100, int(1300 * ratio), 5300),
    'app6_45_原深度贫困县': (0, 5200, int(1300 * ratio), h),
    'app3_部属师范本研衔接公费教育任教范围分配表(右栏)': (int(1300 * ratio), 50, w, 4700),
}

for name, box in regions.items():
    out = OUT_DIR / f'p3x6_{name}.png'
    img.crop(box).save(str(out))
    print(f'切片: {name} → {out}')

print()
print('=' * 60)
print('下一步: 打开切片图人工核对县名,把结果写入:')
print(f'  {ROOT / "data" / "seed" / "batch-region-counties.json"}')
print()
print('或接入 OCR API 自动识别 (推荐阿里云 / 百度云 OCR 中文识别)')
print('=' * 60)
