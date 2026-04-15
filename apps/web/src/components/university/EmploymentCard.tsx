'use client';

import { Card, Descriptions, Typography } from 'antd';

interface EmploymentCardProps {
  employmentRate: string | null;
  furtherStudyRate: string | null;
  avgSalary: string | null;
  topEmployers: string | null;
}

export default function EmploymentCard({
  employmentRate,
  furtherStudyRate,
  avgSalary,
  topEmployers,
}: EmploymentCardProps) {
  // Require at least one rate to render
  if (employmentRate == null && furtherStudyRate == null) return null;

  return (
    <Card title="就业数据" size="small" className="mt-4">
      <Descriptions column={2} size="small">
        {employmentRate != null && (
          <Descriptions.Item label="就业率">{employmentRate}</Descriptions.Item>
        )}
        {furtherStudyRate != null && (
          <Descriptions.Item label="深造率">{furtherStudyRate}</Descriptions.Item>
        )}
        {avgSalary != null && (
          <Descriptions.Item label="平均薪资">{avgSalary}</Descriptions.Item>
        )}
      </Descriptions>
      {topEmployers && (
        <div className="mt-3">
          <Typography.Text type="secondary" className="text-xs block mb-1">
            主要就业单位
          </Typography.Text>
          <Typography.Text className="text-sm">{topEmployers}</Typography.Text>
        </div>
      )}
    </Card>
  );
}
