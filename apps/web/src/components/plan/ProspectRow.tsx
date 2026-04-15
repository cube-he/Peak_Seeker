'use client';

import { Tag, Alert } from 'antd';

interface Props {
  scoreBreakdown?: any; // The scoreBreakdown JSON from PlanItem
}

export default function ProspectRow({ scoreBreakdown }: Props) {
  if (!scoreBreakdown) return null;

  const {
    prospectEmployment,
    prospectSatisfaction,
    prospectRanking,
    careerAlignmentBonus,
    healthRisks,
  } = scoreBreakdown;

  const tags: { label: string; color: string }[] = [];

  if (prospectEmployment >= 2.5) {
    tags.push({ label: '就业率高', color: 'green' });
  }
  if (prospectSatisfaction >= 2.5) {
    tags.push({ label: '满意度高', color: 'blue' });
  }
  if (prospectRanking >= 2) {
    tags.push({ label: '排名靠前', color: 'gold' });
  }
  // careerAlignmentBonus >= 3 takes priority over the >= 1.5 branch
  if (careerAlignmentBonus >= 3) {
    tags.push({ label: '强匹配职业方向', color: 'purple' });
  } else if (careerAlignmentBonus >= 1.5) {
    tags.push({ label: '匹配职业方向', color: 'purple' });
  }

  const risks: string[] = Array.isArray(healthRisks) ? healthRisks : [];

  if (tags.length === 0 && risks.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Tag key={tag.label} color={tag.color} className="text-xs">
              {tag.label}
            </Tag>
          ))}
        </div>
      )}
      {risks.map((risk, i) => (
        <Alert key={i} message={risk} type="warning" showIcon className="text-xs py-1" />
      ))}
    </div>
  );
}
