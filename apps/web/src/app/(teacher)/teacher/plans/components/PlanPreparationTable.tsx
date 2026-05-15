'use client';

import { Button } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import {
  getPlanItemMajorSelection,
  type PlanItemMajorSelectionLike,
} from '../generate/[studentId]/plan-workbench-utils';
import styles from './PlanPreparationTable.module.css';

interface PlanPreparationTableProps {
  plan: Record<string, any>;
  items: Array<Record<string, any>>;
}

const MAJOR_ROWS = 6;
const PRINT_STYLE_ID = 'plan-preparation-table-print-style';
const PRINT_STYLE = `
@page {
  size: A4;
  margin: 12mm;
}

@media print {
  body * {
    visibility: hidden !important;
  }

  [data-print-root],
  [data-print-root] * {
    visibility: visible !important;
  }

  [data-print-root] {
    position: absolute !important;
    inset: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    background: #fff !important;
  }

  [data-print-root] [data-print-action] {
    display: none !important;
  }

  [data-print-root] table {
    page-break-inside: auto;
  }
}
`;

function installPrintStyle() {
  if (typeof document === 'undefined' || document.getElementById(PRINT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PRINT_STYLE_ID;
  style.textContent = PRINT_STYLE;
  document.head.appendChild(style);
}

function removePrintStyle() {
  document.getElementById(PRINT_STYLE_ID)?.remove();
}

function formatScore(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value} 分`;
  return '- 分';
}

function formatRank(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return `第 ${value.toLocaleString()} 位`;
  }
  return '位次 -';
}

function buildUniversityCell(item: Record<string, any>) {
  const code = item.universityCode ?? '';
  const name = item.universityName ?? '-';
  return code ? `${code} ${name}` : name;
}

export default function PlanPreparationTable({ plan, items }: PlanPreparationTableProps) {
  const studentName =
    plan?.studentName ?? plan?.student?.user?.realName ?? plan?.student?.user?.username ?? '-';
  const totalScore = plan?.student?.totalScore ?? plan?.studentTotalScore;
  const rank = plan?.student?.provincialRank ?? plan?.studentProvincialRank;
  const batchLabel = plan?.batchName ?? plan?.batch ?? '本科批';

  const handlePrint = () => {
    if (typeof window === 'undefined') return;
    installPrintStyle();
    window.addEventListener('afterprint', removePrintStyle, { once: true });
    window.print();
  };

  return (
    <div data-print-root className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.title}>
          <strong>{studentName}</strong>
          <span>志愿填报预案一览表</span>
          <em>{formatScore(totalScore)} / {formatRank(rank)}</em>
        </div>
        <Button
          type="primary"
          icon={<PrinterOutlined />}
          onClick={handlePrint}
          data-print-action
          className={styles.printBtn}
        >
          打印预案表
        </Button>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.colSeq}>序号</th>
            <th className={styles.colSchool}>院校</th>
            <th className={styles.colGroup}>专业组</th>
            <th className={styles.colMajor} colSpan={3}>专业</th>
            <th className={styles.colAdjust}>是否服从专业调剂</th>
          </tr>
        </thead>
        {items.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={7} className={styles.empty}>暂无志愿项</td>
            </tr>
          </tbody>
        ) : null}
        {items.map((item, index) => {
          const selection = getPlanItemMajorSelection(item as PlanItemMajorSelectionLike);
          const selectedMajors = selection.selectedMajors ?? [];
          const sequence = item.sequence ?? item.order ?? index + 1;

          return (
            <tbody key={item.id ?? index} className={styles.itemBlock}>
              {Array.from({ length: MAJOR_ROWS }).map((_, majorIndex) => {
                const major = selectedMajors[majorIndex];
                const isFirst = majorIndex === 0;

                return (
                  <tr key={majorIndex}>
                    {isFirst ? (
                      <td rowSpan={MAJOR_ROWS} className={styles.seqCell}>
                        <div>{batchLabel}</div>
                        <div className={styles.seqNum}>{sequence}</div>
                        <div>平行志愿</div>
                      </td>
                    ) : null}
                    {isFirst ? (
                      <td rowSpan={MAJOR_ROWS} className={styles.schoolCell}>
                        {buildUniversityCell(item)}
                      </td>
                    ) : null}
                    {isFirst ? (
                      <td rowSpan={MAJOR_ROWS} className={styles.groupCell}>
                        {item.groupCode ?? '-'}
                      </td>
                    ) : null}
                    <td className={styles.majorIdx}>{majorIndex + 1}</td>
                    <td className={styles.majorCode}>{major?.majorCode ?? ''}</td>
                    <td className={styles.majorName}>{major?.majorName ?? ''}</td>
                    {isFirst ? (
                      <td rowSpan={MAJOR_ROWS} className={styles.adjustCell}>
                        <div className={item.acceptAdjust ? styles.adjustHit : undefined}>
                          {item.acceptAdjust ? <strong><u>是</u></strong> : '是'}
                        </div>
                        <div className={!item.acceptAdjust ? styles.adjustHit : undefined}>
                          {!item.acceptAdjust ? <strong><u>否</u></strong> : '否'}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
