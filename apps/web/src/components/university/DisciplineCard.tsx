'use client';

import { Card, Descriptions, Collapse, Tag } from 'antd';
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
  // P1 学科建设详情
  keyLabCount?: number | null;
  doubleFirstClassSubjectCount?: number | null;
  nationalFeatureMajorCount?: number | null;
  provincialFeatureMajorCount?: number | null;
  disciplineEvaluationDetail?: Record<string, number> | null;
  nationalFeatureMajors?: any;
  provincialFeatureMajors?: any;
  doubleFirstClassMajors?: any;
}

// "/" 是数据源里表示「无数据」的占位符，视同空值——否则专科院校会只剩一条"考研率 /"撑住空卡片
const has = (v: any) => v != null && v !== '' && v !== '/';
const toList = (v: any): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];

// 教育部学科评估等级排序，便于稳定渲染顺序
const EVAL_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-'];
// 不同等级配色，分档由暖到冷
const EVAL_COLOR: Record<string, string> = {
  'A+': 'red',
  A: 'volcano',
  'A-': 'orange',
  'B+': 'gold',
  B: 'lime',
  'B-': 'green',
  'C+': 'cyan',
  C: 'blue',
  'C-': 'geekblue',
};

export default function DisciplineCard(p: Props) {
  const masterList = toList(p.masterPrograms);
  const doctoralList = toList(p.doctoralPrograms);
  const nationalFeature = toList(p.nationalFeatureMajors);
  const provincialFeature = toList(p.provincialFeatureMajors);
  const dfcMajors = toList(p.doubleFirstClassMajors);

  const evalDetail = p.disciplineEvaluationDetail || null;
  const evalEntries: [string, number][] = evalDetail
    ? EVAL_ORDER.filter((g) => typeof evalDetail[g] === 'number' && evalDetail[g] > 0).map(
        (g) => [g, evalDetail[g]],
      )
    : [];

  const items: { label: string; value: any }[] = [];
  if (has(p.disciplineEvaluationLevel))
    items.push({ label: '学科评估', value: p.disciplineEvaluationLevel });
  if (has(p.aClassDisciplineCount))
    items.push({ label: 'A类学科数', value: `${p.aClassDisciplineCount} 个` });
  if (has(p.doubleFirstClassSubjectCount))
    items.push({ label: '双一流学科', value: `${p.doubleFirstClassSubjectCount} 个` });
  if (has(p.keyLabCount))
    items.push({ label: '重点实验室', value: `${p.keyLabCount} 个` });
  if (has(p.nationalFeatureMajorCount))
    items.push({ label: '国家级特色专业', value: `${p.nationalFeatureMajorCount} 个` });
  if (has(p.provincialFeatureMajorCount))
    items.push({ label: '省级特色专业', value: `${p.provincialFeatureMajorCount} 个` });
  if (p.hasMasterProgram)
    items.push({ label: '硕士点', value: has(p.masterProgramCount) ? `${p.masterProgramCount} 个` : '有' });
  if (p.hasDoctoralProgram)
    items.push({ label: '博士点', value: has(p.doctoralProgramCount) ? `${p.doctoralProgramCount} 个` : '有' });
  if (has(p.postgradRate)) items.push({ label: '考研率', value: p.postgradRate });
  if (has(p.transferDifficulty)) items.push({ label: '转专业难度', value: p.transferDifficulty });

  const collapseItems: any[] = [];
  if (evalEntries.length > 0) {
    const total = evalEntries.reduce((sum, [, n]) => sum + n, 0);
    collapseItems.push({
      key: 'eval',
      label: `教育部学科评估明细（共 ${total} 学科）`,
      children: (
        <div className="flex flex-wrap gap-1.5">
          {evalEntries.map(([grade, count]) => (
            <Tag key={grade} color={EVAL_COLOR[grade]}>
              {grade} × {count}
            </Tag>
          ))}
        </div>
      ),
    });
  }
  if (dfcMajors.length > 0)
    collapseItems.push({
      key: 'dfc-majors',
      label: `双一流建设学科 / 专业（${dfcMajors.length}）`,
      children: <div className="text-sm leading-7">{dfcMajors.join('、')}</div>,
    });
  if (nationalFeature.length > 0)
    collapseItems.push({
      key: 'national-feature',
      label: `国家级特色专业（${nationalFeature.length}）`,
      children: <div className="text-sm leading-7">{nationalFeature.join('、')}</div>,
    });
  if (provincialFeature.length > 0)
    collapseItems.push({
      key: 'provincial-feature',
      label: `省级特色专业（${provincialFeature.length}）`,
      children: <div className="text-sm leading-7">{provincialFeature.join('、')}</div>,
    });
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
