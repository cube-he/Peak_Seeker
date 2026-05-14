'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Space, Tag } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons';
import {
  getPlanItemMajorSelection,
  movePlanMajorSelection,
  togglePlanMajorSelection,
  type PlanItemMajorSelectionLike,
  type SelectedPlanMajorPayload,
} from '../generate/[studentId]/plan-workbench-utils';

const SECTION_LABEL: Record<string, string> = {
  RECOMMENDED: '推荐填写',
  BACKUP: '可备选',
  RISK: '风险/不建议',
};

function sectionColor(section?: string | null) {
  if (section === 'RISK') return 'warning';
  if (section === 'BACKUP') return 'default';
  return 'success';
}

function normalizeKey(majors: SelectedPlanMajorPayload[]) {
  return majors.map((major) => major.enrollmentPlanId).join(',');
}

interface PlanMajorSelectionEditorProps {
  item: PlanItemMajorSelectionLike;
  editable: boolean;
  saving?: boolean;
  status?: string | null;
  onSave?: (payload: {
    selectedMajors: SelectedPlanMajorPayload[];
    candidateMajorRanking: SelectedPlanMajorPayload[];
  }) => void;
}

export default function PlanMajorSelectionEditor({
  item,
  editable,
  saving = false,
  status,
  onSave,
}: PlanMajorSelectionEditorProps) {
  const selection = useMemo(() => getPlanItemMajorSelection(item), [item]);
  const [selectedMajors, setSelectedMajors] = useState(selection.selectedMajors);

  useEffect(() => {
    setSelectedMajors(selection.selectedMajors);
  }, [selection.selectedMajors]);

  const selectedIds = new Set(selectedMajors.map((major) => major.enrollmentPlanId));
  const rows = [
    ...selectedMajors.map((major) => ({ ...major, isSelected: true })),
    ...selection.candidateMajorRanking
      .filter((major) => !selectedIds.has(major.enrollmentPlanId))
      .map((major) => ({ ...major, isSelected: false })),
  ];
  const canEdit = editable && selection.canEdit;
  const hasChanges = normalizeKey(selectedMajors) !== normalizeKey(selection.selectedMajors);

  if (!selection.candidateMajorRanking.length) {
    return (
      <Alert
        type="info"
        showIcon
        message="旧方案未保存完整组内专业列表"
        description="当前只能查看已保存的专业顺序，暂不能在这里改选组内专业。"
      />
    );
  }

  return (
    <div className="space-y-3">
      {status === 'PENDING_REVIEW' && canEdit ? (
        <Alert
          type="warning"
          showIcon
          message="保存后方案会退回草稿，需要重新提交审核。"
        />
      ) : null}
      {selectedMajors.length < 6 ? (
        <Alert
          type="warning"
          showIcon
          message="当前选择少于 6 个专业；实际填报建议尽量填满专业并服从调剂。"
        />
      ) : null}
      <div className="grid gap-2">
        {rows.map((major) => {
          const selected = selectedIds.has(major.enrollmentPlanId);
          const selectedIndex = selectedMajors.findIndex((item) => item.enrollmentPlanId === major.enrollmentPlanId);
          const disableCheckbox = !canEdit || saving || (!selected && selectedMajors.length >= 6) || (selected && selectedMajors.length <= 1);

          return (
            <div
              key={major.enrollmentPlanId}
              className={[
                'grid gap-3 rounded-md border px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center',
                selected ? 'border-border bg-white text-text' : 'border-border-subtle bg-gray-50 text-gray-400',
              ].join(' ')}
            >
              <label className="flex min-w-0 items-start gap-2">
                <Checkbox
                  checked={selected}
                  disabled={disableCheckbox}
                  onChange={(event) => {
                    setSelectedMajors((current) => togglePlanMajorSelection(current, major, event.target.checked));
                  }}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{selected ? `${selectedIndex + 1}. ` : ''}{major.majorName}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    {major.majorCode ? <span className="font-mono text-xs">{major.majorCode}</span> : null}
                    {major.displaySection ? (
                      <Tag color={sectionColor(major.displaySection)}>
                        {SECTION_LABEL[major.displaySection] ?? major.displaySection}
                      </Tag>
                    ) : null}
                    {major.majorMinRank ? <span className="text-xs">{major.majorMinRank.toLocaleString()} 位</span> : null}
                    {major.planCount != null ? <span className="text-xs">{major.planCount} 人</span> : null}
                  </span>
                  {major.displayReason ? <span className="mt-1 block text-xs">{major.displayReason}</span> : null}
                </span>
              </label>
              {selected && canEdit ? (
                <Space size={4}>
                  <Button
                    size="small"
                    icon={<ArrowUpOutlined />}
                    disabled={saving || selectedIndex <= 0}
                    onClick={() => setSelectedMajors((current) => movePlanMajorSelection(current, major.enrollmentPlanId, 'up'))}
                  />
                  <Button
                    size="small"
                    icon={<ArrowDownOutlined />}
                    disabled={saving || selectedIndex >= selectedMajors.length - 1}
                    onClick={() => setSelectedMajors((current) => movePlanMajorSelection(current, major.enrollmentPlanId, 'down'))}
                  />
                </Space>
              ) : null}
            </div>
          );
        })}
      </div>
      {editable ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            icon={<UndoOutlined />}
            disabled={saving || !hasChanges}
            onClick={() => setSelectedMajors(selection.selectedMajors)}
          >
            撤销
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={!canEdit || !hasChanges || selectedMajors.length < 1}
            onClick={() => onSave?.({
              selectedMajors,
              candidateMajorRanking: selection.candidateMajorRanking,
            })}
          >
            保存专业选择
          </Button>
        </div>
      ) : null}
    </div>
  );
}
