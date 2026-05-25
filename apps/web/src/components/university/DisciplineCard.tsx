'use client';

import { Card, Descriptions, Collapse } from 'antd';
import { BookOutlined } from '@ant-design/icons';

interface Props {
  disciplineEvaluationLevel: string | null;
  aClassDisciplineCount: number | null;
  hasMasterProgram: boolean;
  masterProgramCount: number | null;
  masterPrograms: any;
  hasDoctoralProgram: boolean;
  doctoralProgramCount: number | null;
  doctoralPrograms: any;
  postgradRate: string | null;
  transferDifficulty: string | null;
}

// "/" 是数据源里表示「无数据」的占位符，视同空值——否则专科院校会只剩一条"考研率 /"撑住空卡片
const has = (v: any) => v != null && v !== '' && v !== '/';
const toList = (v: any): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];

export default function DisciplineCard(p: Props) {
  const masterList = toList(p.masterPrograms);
  const doctoralList = toList(p.doctoralPrograms);

  const items: { label: string; value: any }[] = [];
  if (has(p.disciplineEvaluationLevel))
    items.push({ label: '学科评估', value: p.disciplineEvaluationLevel });
  if (has(p.aClassDisciplineCount))
    items.push({ label: 'A类学科数', value: `${p.aClassDisciplineCount} 个` });
  if (p.hasMasterProgram)
    items.push({ label: '硕士点', value: has(p.masterProgramCount) ? `${p.masterProgramCount} 个` : '有' });
  if (p.hasDoctoralProgram)
    items.push({ label: '博士点', value: has(p.doctoralProgramCount) ? `${p.doctoralProgramCount} 个` : '有' });
  if (has(p.postgradRate)) items.push({ label: '考研率', value: p.postgradRate });
  if (has(p.transferDifficulty)) items.push({ label: '转专业难度', value: p.transferDifficulty });

  const collapseItems: any[] = [];
  if (masterList.length > 0)
    collapseItems.push({
      key: 'master',
      label: `硕士点列表（${masterList.length}）`,
      children: <div className="text-sm leading-7">{masterList.join('、')}</div>,
    });
  if (doctoralList.length > 0)
    collapseItems.push({
      key: 'doctoral',
      label: `博士点列表（${doctoralList.length}）`,
      children: <div className="text-sm leading-7">{doctoralList.join('、')}</div>,
    });

  if (items.length === 0 && collapseItems.length === 0) return null;

  return (
    <Card title={<><BookOutlined className="mr-1" />学科建设</>} size="small">
      {items.length > 0 && (
        <Descriptions column={1} size="small">
          {items.map((it) => (
            <Descriptions.Item key={it.label} label={it.label}>
              {it.value}
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}
      {collapseItems.length > 0 && (
        <div className="mt-3">
          <Collapse ghost size="small" items={collapseItems} />
        </div>
      )}
    </Card>
  );
}
