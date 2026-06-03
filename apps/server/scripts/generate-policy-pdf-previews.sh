#!/bin/bash
# 把 attachments/policy/ 下的 doc / docx / xlsx 一律转成同名 .preview.pdf 缓存,
# 让前端预览统一走 nginx 直接 serve PDF (浏览器原生支持).
#
# 用法: bash apps/server/scripts/generate-policy-pdf-previews.sh
# 依赖: libreoffice-core + libreoffice-writer (+ libreoffice-calc for xlsx)
#
# 增量逻辑: 如果 .preview.pdf 已存在且比源文件新 → skip.
# 添加新政策文件后重跑即可, 已有缓存不会重做.

set -uo pipefail

POLICY_DIR="${POLICY_DIR:-/home/ubuntu/apps/volunteer-helper/attachments/policy}"
TMP_DIR="/tmp/lo_pdf_conv_$$"
LIBREOFFICE_BIN="${LIBREOFFICE_BIN:-libreoffice}"

mkdir -p "$TMP_DIR"
trap "rm -rf $TMP_DIR" EXIT

if ! command -v "$LIBREOFFICE_BIN" >/dev/null 2>&1; then
  echo "ERROR: $LIBREOFFICE_BIN not found. Install with: sudo apt-get install libreoffice-core libreoffice-writer libreoffice-calc --no-install-recommends" >&2
  exit 1
fi

cd "$POLICY_DIR" || exit 1

ok=0
skip=0
fail=0

shopt -s nullglob nocaseglob
for src in *.doc *.docx *.xlsx; do
  base="${src%.*}"
  # 跳过本身就是 *.preview.pdf 生成出来的中间文件 (理论上不会落进 *.doc 但防御)
  case "$src" in *.preview.pdf) continue ;; esac
  preview="${base}.preview.pdf"

  if [ -e "$preview" ] && [ "$preview" -nt "$src" ]; then
    echo "skip $src (cache fresh)"
    skip=$((skip + 1))
    continue
  fi

  echo "convert $src ..."
  if "$LIBREOFFICE_BIN" --headless --convert-to pdf --outdir "$TMP_DIR" "$src" >/dev/null 2>&1; then
    if [ -e "$TMP_DIR/${base}.pdf" ]; then
      mv -f "$TMP_DIR/${base}.pdf" "$preview"
      echo "  -> $preview ($(stat -c '%s' "$preview") bytes)"
      ok=$((ok + 1))
    else
      echo "  FAIL: libreoffice exited 0 but no output file"
      fail=$((fail + 1))
    fi
  else
    echo "  FAIL: libreoffice non-zero exit"
    fail=$((fail + 1))
  fi
done
shopt -u nullglob nocaseglob

echo ""
echo "Done. ok=$ok skip=$skip fail=$fail"
