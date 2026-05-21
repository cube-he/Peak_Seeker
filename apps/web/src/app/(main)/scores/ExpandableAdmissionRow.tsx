'use client';

import { useState } from 'react';
import { Button, Spin } from 'antd';
import type { AggregatedAdmissionListItem, AggregatedAdmissionDetail } from '@volunteer-helper/shared';
import AdmissionRow from '@/components/admission/AdmissionRow';
import { admissionService } from '@/services/admission';
import ExpandedAdmissionRow from './ExpandedAdmissionRow';

interface ExpandableAdmissionRowProps {
  item: AggregatedAdmissionListItem;
  userRank: number | null;
}

export function ExpandableAdmissionRow({ item, userRank }: ExpandableAdmissionRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<AggregatedAdmissionDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (detail !== null) {
      return;
    }
    setLoading(true);
    try {
      const result = await admissionService.getAggregatedDetail({
        universityId: item.university.id,
        majorCode: item.majorCode,
        groupCode: item.groupCode,
        batch: item.batch,
        recruitType: item.recruitType,
        // AdmissionRecord.province 存的是考生生源省（本数据集恒为四川），不是院校所在地
        province: '四川',
        subjects: item.subjects,
      });
      setDetail(result);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-stretch gap-2">
        <div className="flex-1">
          <AdmissionRow
            data={{
              university: {
                id: item.university.id,
                name: item.university.name,
                logoUrl: item.university.logoUrl,
                is985: item.university.is985,
                is211: item.university.is211,
                isDoubleFirstClass: item.university.isDoubleFirstClass,
              },
              major: item.major ? { id: item.major.id, name: item.major.name } : null,
              majorName: item.majorName,
              groupCode: item.groupCode,
              batch: item.batch,
              recruitType: item.recruitType,
              subjects: item.subjects,
              predictedMinRank: item.predictedMinRank,
            }}
            userRank={userRank}
          />
        </div>
        <Button size="small" onClick={handleToggle}>
          {expanded ? '收起' : '展开'}
        </Button>
      </div>
      {expanded ? (
        loading ? (
          <div className="py-4 text-center">
            <Spin />
          </div>
        ) : detail ? (
          <ExpandedAdmissionRow
            yearlyData={detail.yearlyData}
            currentPlan={detail.currentPlan}
            supplementary={detail.supplementary}
          />
        ) : null
      ) : null}
    </div>
  );
}
