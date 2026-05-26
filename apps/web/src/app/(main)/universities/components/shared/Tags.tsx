/**
 * 985 / 211 / 双一流 三个标签 chips。
 * 按命中按顺序输出。CSS 类来自 styles.css 的 .tag-elite / .tag-211 / .tag-dfc。
 */
interface TagsProps {
  is985?: boolean;
  is211?: boolean;
  isDoubleFirstClass?: boolean;
}

export function Tags({ is985, is211, isDoubleFirstClass }: TagsProps) {
  const items: Array<{ k: string; c: string }> = [];
  if (is985) items.push({ k: '985', c: 'tag-elite' });
  if (is211) items.push({ k: '211', c: 'tag-211' });
  if (isDoubleFirstClass) items.push({ k: '双一流', c: 'tag-dfc' });
  if (items.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {items.map((t) => (
        <span key={t.k} className={`tag ${t.c}`}>
          {t.k}
        </span>
      ))}
    </span>
  );
}
