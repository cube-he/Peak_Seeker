'use client';

import { Tag } from 'antd';
import type {
  YearlyAdmissionData,
  CurrentEnrollmentPlan,
} from '@volunteer-helper/shared';

interface ExpandedAdmissionRowProps {
  yearlyData: YearlyAdmissionData[];
  currentPlan: CurrentEnrollmentPlan | null;
}

function ScoreCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-text-faint">-</span>;
  return (
    <span className="font-semibold text-text [font-variant-numeric:tabular-nums]">
      {value}
    </span>
  );
}

function RankCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-text-faint">-</span>;
  return (
    <span className="text-text-secondary [font-variant-numeric:tabular-nums]">
      {value.toLocaleString()}
    </span>
  );
}

export default function ExpandedAdmissionRow({
  yearlyData,
  currentPlan,
}: ExpandedAdmissionRowProps) {
  const sortedYears = [...yearlyData].sort((a, b) => b.year - a.year);

  return (
    <div className="px-4 py-3 space-y-4">
      {/* 多年录取数据对比 */}
      <div>
        <h4 className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wider">
          历年录取数据
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-text-muted text-xs">
                <th className="text-left py-1.5 pr-4 font-medium">年份</th>
                <th className="text-right py-1.5 px-3 font-medium">专业最低分</th>
                <th className="text-right py-1.5 px-3 font-medium">专业最低位次</th>
                <th className="text-right py-1.5 px-3 font-medium">专业平均分</th>
                <th className="text-right py-1.5 px-3 font-medium">专业平均位次</th>
                <th className="text-right py-1.5 px-3 font-medium">专业录取数</th>
                <th className="text-right py-1.5 px-3 font-medium border-l border-border-subtle">组最低分</th>
                <th className="text-right py-1.5 px-3 font-medium">组最低位次</th>
                <th className="text-right py-1.5 pl-3 font-medium">组录取数</th>
              </tr>
            </thead>
            <tbody>
              {sortedYears.map((yd) => (
                <tr key={yd.year} className="border-t border-border-subtle">
                  <td className="py-1.5 pr-4 font-medium text-text">{yd.year}</td>
                  <td className="text-right py-1.5 px-3"><ScoreCell value={yd.majorMinScore} /></td>
                  <td className="text-right py-1.5 px-3"><RankCell value={yd.majorMinRank} /></td>
                  <td className="text-right py-1.5 px-3"><ScoreCell value={yd.majorAvgScore} /></td>
                  <td className="text-right py-1.5 px-3"><RankCell value={yd.majorAvgRank} /></td>
                  <td className="text-right py-1.5 px-3"><ScoreCell value={yd.majorAdmissionCount} /></td>
                  <td className="text-right py-1.5 px-3 border-l border-border-subtle"><ScoreCell value={yd.groupMinScore} /></td>
                  <td className="text-right py-1.5 px-3"><RankCell value={yd.groupMinRank} /></td>
                  <td className="text-right py-1.5 pl-3"><ScoreCell value={yd.groupAdmissionCount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 招生计划详情 */}
      {currentPlan && (
        <div>
          <h4 className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wider">
            招生计划详情（{new Date().getFullYear()}年）
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2 text-sm">
            {currentPlan.subjectRequirements && (
              <div>
                <span className="text-text-muted">选科要求：</span>
                <span className="text-text">{currentPlan.subjectRequirements}</span>
              </div>
            )}
            {currentPlan.disciplineEval && (
              <div>
                <span className="text-text-muted">学科评估：</span>
                <span className="text-text font-medium">{currentPlan.disciplineEval}</span>
              </div>
            )}
            {currentPlan.majorRanking && (
              <div>
                <span className="text-text-muted">专业排名：</span>
                <span className="text-text">第{currentPlan.majorRanking}名</span>
              </div>
            )}
            {currentPlan.majorHonor && (
              <div>
                <span className="text-text-muted">专业荣誉：</span>
                <span className="text-text">{currentPlan.majorHonor}</span>
              </div>
            )}
            {currentPlan.localMasterPoint && (
              <div className="col-span-2">
                <span className="text-text-muted">硕士点：</span>
                <span className="text-text">{currentPlan.localMasterPoint}</span>
              </div>
            )}
            {currentPlan.localDoctoralPoint && (
              <div className="col-span-2">
                <span className="text-text-muted">博士点：</span>
                <span className="text-text">{currentPlan.localDoctoralPoint}</span>
              </div>
            )}
            {currentPlan.planNotes && (
              <div className="col-span-full">
                <span className="text-text-muted">备注：</span>
                <span className="text-text-secondary text-xs">{currentPlan.planNotes}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            {currentPlan.isNew && (
              <Tag className="rounded-full border-0 bg-accent-fixed text-accent m-0">新增专业</Tag>
            )}
            {currentPlan.isSinoForeign && (
              <Tag className="rounded-full border-0 bg-primary-fixed text-primary m-0">中外合作</Tag>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
