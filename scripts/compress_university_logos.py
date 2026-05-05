"""
压缩 + 转 webp 院校 logo。
- 输入：apps/web/public/logos/*.{jpeg,jpg,png,jfif} （上一步下载的原图）
- 输出：apps/web/public/logos/*.webp，统一缩到 256×256（保比，居中），quality=85
- 副作用：原图移到 data/logo_originals/，避免被 deploy 上传
- 同步更新 config/logo-local-paths.json（enrollCode → /logos/{schoolId}.webp）

跑法: python scripts/compress_university_logos.py
"""
import json
import shutil
import sys
from pathlib import Path
from PIL import Image, ImageOps

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
LOGOS_DIR = ROOT / 'apps' / 'web' / 'public' / 'logos'
ORIG_DIR = ROOT / 'data' / 'logo_originals'
MAP_IN = ROOT / 'scripts' / 'data-processing' / 'output' / 'logo_local_paths.json'
MAP_OUT = ROOT / 'config' / 'logo-local-paths.json'

ORIG_DIR.mkdir(parents=True, exist_ok=True)
MAP_OUT.parent.mkdir(parents=True, exist_ok=True)

TARGET_SIZE = (256, 256)
QUALITY = 85
SUPPORTED_EXTS = {'.jpg', '.jpeg', '.jfif', '.png', '.webp', '.gif', '.bmp'}


def process_one(src: Path) -> tuple[bool, str, int, int]:
    """返回 (ok, dest_filename_basename_with_ext, src_size, dest_size)"""
    name = src.stem  # 不含扩展名 = schoolId
    dest = LOGOS_DIR / f'{name}.webp'
    src_size = src.stat().st_size

    # 已是 webp 且来源就是 webp，跳过
    if src.suffix.lower() == '.webp' and dest.exists() and dest.samefile(src):
        return True, dest.name, src_size, src_size

    try:
        with Image.open(src) as im:
            # 修正 EXIF 旋转（防极端情况）；铺平透明背景为白
            im = ImageOps.exif_transpose(im)
            if im.mode in ('RGBA', 'LA', 'P'):
                bg = Image.new('RGB', im.size, (255, 255, 255))
                if im.mode == 'P':
                    im = im.convert('RGBA')
                bg.paste(im, mask=im.split()[-1] if im.mode == 'RGBA' else None)
                im = bg
            elif im.mode != 'RGB':
                im = im.convert('RGB')

            im.thumbnail(TARGET_SIZE, Image.LANCZOS)
            im.save(dest, 'WEBP', quality=QUALITY, method=6)

        dest_size = dest.stat().st_size
        return True, dest.name, src_size, dest_size
    except Exception as e:
        return False, str(e), src_size, 0


def main():
    if not LOGOS_DIR.exists():
        print(f'[FAIL] {LOGOS_DIR} 不存在，先跑 download_university_logos.py')
        sys.exit(1)

    # 把已是 webp 的（之前压过）和原图区分
    originals = [p for p in LOGOS_DIR.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED_EXTS and p.suffix.lower() != '.webp']
    print(f'到待压缩原图: {len(originals)}')

    ok, fail, total_src, total_dst = 0, 0, 0, 0
    failed = []
    for i, src in enumerate(originals, 1):
        success, info, src_sz, dst_sz = process_one(src)
        if success:
            ok += 1
            total_src += src_sz
            total_dst += dst_sz
            # 移原图到 data/logo_originals/
            shutil.move(str(src), str(ORIG_DIR / src.name))
        else:
            fail += 1
            failed.append((src.name, info))
        if i % 200 == 0:
            print(f'  [{i}/{len(originals)}] ok={ok} fail={fail}')

    print('---')
    print(f'OK: {ok}')
    print(f'FAIL: {fail}')
    print(f'总大小：原图 {total_src/1024/1024:.2f} MB → webp {total_dst/1024/1024:.2f} MB （压缩比 {total_dst/total_src*100:.1f}%）')
    if failed:
        print('--- 前 10 个失败 ---')
        for n, e in failed[:10]:
            print(f'  {n}: {e}')

    # 更新映射 JSON：把扩展名改成 webp
    src_map = json.loads(MAP_IN.read_text(encoding='utf-8'))
    new_map = {}
    for ec, p in src_map.items():
        # p 形如 /logos/100011.jpeg → /logos/100011.webp
        # 但只有处理成功的 schoolId 才有 webp，其他保留原样（理论应该都成功）
        stem = p.rsplit('/', 1)[-1].rsplit('.', 1)[0]
        webp_path = LOGOS_DIR / f'{stem}.webp'
        if webp_path.exists():
            new_map[ec] = f'/logos/{stem}.webp'
        else:
            # 失败的就跳过，不写进 mapping（DB 不会被改成失效路径）
            pass
    MAP_OUT.write_text(json.dumps(new_map, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'映射写入: {MAP_OUT} ({len(new_map)} entries)')


if __name__ == '__main__':
    main()
