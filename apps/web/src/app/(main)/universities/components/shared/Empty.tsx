/** 空数据占位。 */
export function Empty({ msg = '暂无数据' }: { msg?: string }) {
  return (
    <div
      style={{
        padding: '60px 20px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: 14,
      }}
    >
      {msg}
    </div>
  );
}
