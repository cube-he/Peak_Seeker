import { DORM_FIELD_GROUPS } from './dorm-fields';
import type { DormSheet, DormSheetUniversity } from './types';

function UniversitySection({ u, index }: { u: DormSheetUniversity; index: number }) {
  const meta = [u.province, u.city, u.runningLevel, u.runningNature].filter(Boolean).join(' · ');
  return (
    <section
      style={{
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
        marginBottom: 18,
        ...(index > 0 ? { breakBefore: 'page', pageBreakBefore: 'always' } : {}),
      }}
    >
      <div style={{ borderBottom: '2px solid #333', paddingBottom: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{u.name}</span>
        {meta && <span style={{ fontSize: 12, color: '#666', marginLeft: 10 }}>{meta}</span>}
      </div>

      {!u.hasData ? (
        <div style={{ fontSize: 13, color: '#999', padding: '12px 0' }}>暂无该校生活数据</div>
      ) : (
        DORM_FIELD_GROUPS.map((group) => (
          <div key={group.title} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#444', margin: '4px 0' }}>
              {group.title}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {group.fields.map((f) => (
                  <tr key={f.key}>
                    <td
                      style={{
                        border: '1px solid #ddd', padding: '3px 8px', width: 110,
                        background: '#fafafa', color: '#555', whiteSpace: 'nowrap', verticalAlign: 'top',
                      }}
                    >
                      {f.label}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '3px 8px' }}>
                      {u.dorm[f.key] ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </section>
  );
}

export default function DormInfoSheet({ sheet }: { sheet: DormSheet }) {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
        {sheet.student.name ?? '学生'} · 院校生活情况
      </h1>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
        {[sheet.plan.batchName, sheet.plan.year ? `${sheet.plan.year}年` : null]
          .filter(Boolean)
          .join(' · ')}
        　共 {sheet.universities.length} 所院校
      </div>
      {sheet.universities.map((u, i) => (
        <UniversitySection key={u.id} u={u} index={i} />
      ))}
    </div>
  );
}
