'use client';

import { Card, Descriptions, Tag } from 'antd';
import { BankOutlined } from '@ant-design/icons';

interface Props {
  code: string | null;
  province: string | null;
  city: string | null;
  type: string | null;
  level: string | null;
  runningLevel: string | null;
  runningNature: string | null;
  department: string | null;
  createdYear: string | null;
  campusArea: number | string | null;
  maleRatio: number | null;
  femaleRatio: number | null;
  tags: any;
  // P1 身份/资质标签
  is101Plan?: boolean | null;
  isQiangji?: boolean | null;
  hasGraduateSchool?: boolean | null;
  hasPostgradRecommend?: boolean | null;
  firstClassCategory?: string | null;
}

const has = (v: any) => v != null && v !== '';

// P1 资质徽章颜色：用主品牌色突出，与一般 tag 区分
const QUALIFICATION_COLOR = 'gold';

export default function OverviewCard(p: Props) {
  const items: { label: string; value: any }[] = [];
  if (has(p.code)) items.push({ label: '院校代码', value: p.code });
  if (has(p.province) || has(p.city))
    items.push({ label: '省份/城市', value: [p.province, p.city].filter(Boolean).join(' · ') });
  if (has(p.type)) items.push({ label: '类型', value: p.type });
  if (has(p.level)) items.push({ label: '层次', value: p.level });
  if (has(p.runningLevel)) items.push({ label: '办学层次', value: p.runningLevel });
  if (has(p.runningNature)) items.push({ label: '办学性质', value: p.runningNature });
  if (has(p.department)) items.push({ label: '主管部门', value: p.department });
  if (has(p.createdYear)) items.push({ label: '建校时间', value: p.createdYear });
  if (has(p.campusArea)) items.push({ label: '校园面积', value: `${p.campusArea} 亩` });
  if (has(p.maleRatio) && has(p.femaleRatio))
    items.push({ label: '男女比', value: `${p.maleRatio} : ${p.femaleRatio}` });

  const qualifications: string[] = [];
  if (p.is101Plan) qualifications.push('101 计划');
  if (p.isQiangji) qualifications.push('强基计划');
  if (p.hasGraduateSchool) qualifications.push('研究生院');
  if (p.hasPostgradRecommend) qualifications.push('保研资格');
  if (has(p.firstClassCategory)) qualifications.push(`一流大学 ${p.firstClassCategory}`);

  const tagList: string[] = Array.isArray(p.tags)
    ? p.tags.filter((t) => typeof t === 'string')
    : [];

  if (items.length === 0 && tagList.length === 0 && qualifications.length === 0) return null;

  return (
    <Card title={<><BankOutlined className="mr-1" />概况</>} size="small">
      {items.length > 0 && (
        <Descriptions column={1} size="small">
          {items.map((it) => (
            <Descriptions.Item key={it.label} label={it.label}>
              {it.value}
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}
      {qualifications.length > 0 && (
        <div className="mt-3">
          <div className="text-text-tertiary text-xs mb-1.5">资质</div>
          <div className="flex flex-wrap gap-1">
            {qualifications.map((q) => (
              <Tag key={q} color={QUALIFICATION_COLOR}>
                {q}
              </Tag>
            ))}
          </div>
        </div>
      )}
      {tagList.length > 0 && (
        <div className="mt-3">
          {qualifications.length > 0 && (
            <div className="text-text-tertiary text-xs mb-1.5">其他标签</div>
          )}
          <div className="flex flex-wrap gap-1">
            {tagList.map((t) => (
              <Tag key={t} color="default">
                {t}
              </Tag>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
