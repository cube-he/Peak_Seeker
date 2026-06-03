/**
 * 一次性脚本: 给 willnest-teacher.css 的所有 CSS 规则加上 `.wn-teacher-scope`
 * 前缀, 让 6969 行设计稿样式只在 (teacher) layout 的 wrapper div 内生效, 不污染
 * /universities /majors /login 等非教师页面 (Next.js 14 不会卸载已加载的 CSS,
 * 从 /teacher/dashboard client-navigate 到 /universities 时 teacher.css 仍 stick
 * 在 document.head, 通用 className 比如 .qa .section .fade-up 会命中其他页面).
 *
 * 用法: node apps/web/scripts/scope-willnest-css.js
 *
 * 处理规则:
 *   - .x { ... }           → .wn-teacher-scope .x { ... }
 *   - .x, .y { ... }       → .wn-teacher-scope .x, .wn-teacher-scope .y { ... }
 *   - @keyframes 内 0%/50%/from/to 这种 selector 不动 (会被识别为 atrule child)
 *   - @media / @supports 内的规则会递归处理
 *   - @font-face / @import / :root / @keyframes 本体不动
 */
const fs = require('fs');
const path = require('path');
const postcss = require('postcss');

const PREFIX = '.wn-teacher-scope';
const TARGET = path.join(__dirname, '..', 'src', 'styles', 'willnest-teacher.css');

const css = fs.readFileSync(TARGET, 'utf8');
const root = postcss.parse(css);

function isInsideKeyframes(node) {
  let p = node.parent;
  while (p) {
    if (p.type === 'atrule' && /keyframes$/.test(p.name)) return true;
    p = p.parent;
  }
  return false;
}

root.walkRules((rule) => {
  // @keyframes 里的 0% / from / to 不动
  if (isInsideKeyframes(rule)) return;

  rule.selectors = rule.selectors.map((sel) => {
    const trimmed = sel.trim();
    // 已经带 prefix 不重复加 (脚本可被多次安全运行)
    if (trimmed.startsWith(PREFIX)) return sel;
    // :root 是给 CSS var 用的, 不该被 scope 起来 (但 willnest-tokens.css 已分离,
    // 这里也防御性跳过)
    if (trimmed.startsWith(':root')) return sel;
    return `${PREFIX} ${sel}`;
  });
});

fs.writeFileSync(TARGET, root.toString(), 'utf8');
console.log(`[ok] prefixed ${TARGET} with ${PREFIX}`);
