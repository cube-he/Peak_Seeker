/**
 * 一次性修复从设计稿拷过来的 willnest-teacher.css:
 *   1. 删头部 element reset (*, html/body, body, a, button) — 避免污染非教师页,
 *      box-sizing/body/a/button 由 tailwind base + willnest-tokens.css 接管
 *   2. 修 5 处设计稿 copy-paste 残留的孤儿属性 + 多余闭花括号 (设计稿作者用浏览器
 *      测,CSS 容错,但 PostCSS 会编译失败)
 * 跑完再跑 scope-willnest-css.js 加 .wn-teacher-scope 前缀。
 */
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..', 'src', 'styles', 'willnest-teacher.css');
let css = fs.readFileSync(P, 'utf8');
const before = css.length;

const fixes = [
  // 1. 头部 element reset → 删除 (保留 .tabular/.serif/.dim/.muted utility class)
  [
    `*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
a { color: inherit; text-decoration: none; }
button { font-family: inherit; cursor: pointer; }
`,
    `/* element reset 已删: box-sizing/body/a/button 由 tailwind base + willnest-tokens 接管, 避免污染 /universities 等非教师页 */
`,
  ],
  // 2. line 750 孤儿 }
  [
    `  margin: 0 6px;
}
}
.fc {`,
    `  margin: 0 6px;
}
.fc {`,
  ],
  // 3. .sop-step::before 重复属性 + 多余 }
  [
    `  background: var(--border);
  z-index: 0;
}
  height: 2px;
  background: var(--border);
  z-index: 0;
}
.sop-step:first-child::before`,
    `  background: var(--border);
  z-index: 0;
}
.sop-step:first-child::before`,
  ],
  // 4. .sop-step .dot 重复属性 + 多余 }
  [
    `  position: relative;
  transition: all var(--dur) var(--ease);
}
  display: inline-flex; align-items: center; justify-content: center;
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 12px;
  background: var(--surface-high);
  border: 2px solid var(--border);
  color: var(--text-muted);
  position: relative;
  z-index: 1;
  transition: all var(--dur) var(--ease);
}
.sop-step.done .dot {`,
    `  position: relative;
  transition: all var(--dur) var(--ease);
}
.sop-step.done .dot {`,
  ],
  // 5. .plan-row 悬空属性 + 多余 }
  [
    `.plan-row .go:hover { border-color: var(--primary); color: #fff; background: var(--primary); }
  gap: 14px;
  padding: 14px 22px;
  align-items: center;
  border-bottom: 1px solid var(--border-subtle);
  transition: background var(--dur) var(--ease);
  cursor: pointer;
}
.plan-row:last-child`,
    `.plan-row .go:hover { border-color: var(--primary); color: #fff; background: var(--primary); }
.plan-row:last-child`,
  ],
  // 6. .h-tbl-row 悬空属性 + 多余 }
  [
    `.h-tbl-row:hover { background: var(--bg); transform: translateX(2px); }
  transition: background var(--dur) var(--ease);
  cursor: pointer;
}
.h-tbl-row:hover { background: var(--bg); }`,
    `.h-tbl-row:hover { background: var(--bg); transform: translateX(2px); }
.h-tbl-row:hover { background: var(--bg); }`,
  ],
];

let applied = 0;
for (const [from, to] of fixes) {
  if (css.includes(from)) {
    css = css.replace(from, to);
    applied++;
  } else {
    console.log(`[WARN] fix not matched (idx ${fixes.indexOf([from, to])})`);
  }
}

fs.writeFileSync(P, css, 'utf8');
console.log(`[ok] applied ${applied}/${fixes.length} fixes, ${before} -> ${css.length} chars`);
