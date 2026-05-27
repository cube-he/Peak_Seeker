'use client';

import { Modal, Button } from 'antd';
import { CheckOutlined, CloseOutlined, WarningOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

// 关键字段检查项
export interface FieldCheck {
  key: string;
  label: string;
  passed: boolean;
}

export function checkPrerequisites(student: any): FieldCheck[] {
  const checks: FieldCheck[] = [];

  // 选科组合
  const hasSubjects =
    !!student?.examType &&
    !!student?.firstChoice &&
    Array.isArray(student?.reChoices) &&
    student.reChoices.length > 0;
  checks.push({ key: 'subjects', label: '选科组合', passed: hasSubjects });

  // 模考分
  checks.push({
    key: 'totalScore',
    label: '模考总分',
    passed: typeof student?.totalScore === 'number' && student.totalScore > 0,
  });

  // 预测位次
  checks.push({
    key: 'rank',
    label: '预测位次',
    passed: typeof student?.provincialRank === 'number' && student.provincialRank > 0,
  });

  // 意向城市(任意一项: 偏好/排除/留省偏好)
  const hasCities =
    (Array.isArray(student?.preferredCities) && student.preferredCities.length > 0) ||
    (Array.isArray(student?.excludedCities) && student.excludedCities.length > 0) ||
    !!student?.stayPreference;
  checks.push({ key: 'cities', label: '意向城市', passed: hasCities });

  // 意向专业方向
  const hasMajors =
    (Array.isArray(student?.preferredMajors) && student.preferredMajors.length > 0) ||
    (Array.isArray(student?.preferredMajorCategories) && student.preferredMajorCategories.length > 0);
  checks.push({ key: 'majors', label: '意向专业方向', passed: hasMajors });

  // 加分政策状态
  checks.push({
    key: 'bonusStatus',
    label: '加分政策',
    passed: !!student?.bonusPolicyStatus,
  });

  // 体检关键项(色盲色弱)
  checks.push({
    key: 'health',
    label: '体检关键项',
    passed:
      typeof student?.colorBlind === 'boolean' && typeof student?.colorWeak === 'boolean',
  });

  return checks;
}

interface PrerequisiteCheckModalProps {
  open: boolean;
  student: any;
  onCancel: () => void;
}

export default function PrerequisiteCheckModal({
  open,
  student,
  onCancel,
}: PrerequisiteCheckModalProps) {
  const router = useRouter();
  const checks = checkPrerequisites(student);
  const missingCount = checks.filter((c) => !c.passed).length;
  const studentId = student?.id;

  const handleGenerate = () => {
    if (!studentId) return;
    router.push(`/teacher/plans/generate/${studentId}`);
    onCancel();
  };

  const handleGoEdit = () => {
    if (!studentId) return;
    router.push(`/teacher/students/${studentId}`);
    onCancel();
  };

  return (
    <Modal
      title={`生成方案前置检查:${student?.user?.realName || student?.realName || '学生'}`}
      open={open}
      onCancel={onCancel}
      width={520}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>取消</Button>
          {missingCount > 0 ? (
            <>
              <Button onClick={handleGenerate}>仍要生成</Button>
              <Button type="primary" onClick={handleGoEdit}>
                去补 {missingCount} 项缺失
              </Button>
            </>
          ) : (
            <Button type="primary" onClick={handleGenerate}>
              开始生成
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        <p className="m-0 text-sm">
          {missingCount === 0 ? (
            <span className="text-safe">
              <CheckOutlined /> 关键资料全部就绪
            </span>
          ) : (
            <span className="text-rush">
              <WarningOutlined /> 还有 {missingCount} 项关键资料未填写,生成的方案精准度可能受影响
            </span>
          )}
        </p>
        <ul className="m-0 list-none space-y-2 p-0">
          {checks.map((c) => (
            <li key={c.key} className="flex items-center gap-2 text-sm">
              {c.passed ? (
                <CheckOutlined className="text-safe" />
              ) : (
                <CloseOutlined className="text-rush" />
              )}
              <span className={c.passed ? 'text-text' : 'text-rush'}>{c.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
