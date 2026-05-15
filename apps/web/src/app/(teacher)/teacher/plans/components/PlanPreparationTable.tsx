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
const TEMPLATE_SLOT_COUNT = 50;
const PRINT_STYLE_ID = 'plan-preparation-table-print-style';
const PRINT_ROOT_ID = 'plan-preparation-table-print-root';
const PRINT_STYLE = `
@page {
  size: A4 portrait;
  margin: 0.5506944444in 0.3930555556in 0.3930555556in 0.3930555556in;
}

@media print {
  html,
  body {
    background: #fff !important;
  }

  body > *:not(#${PRINT_ROOT_ID}) {
    display: none !important;
  }

  #${PRINT_ROOT_ID} {
    display: block !important;
    width: 707px !important;
    padding: 0 !important;
    margin: 0 !important;
    background: #fff !important;
  }

  #${PRINT_ROOT_ID} [data-print-action] {
    display: none !important;
  }

  #${PRINT_ROOT_ID} .${styles.sheet} {
    width: 707px !important;
    max-width: none !important;
    overflow: visible !important;
    margin: 0 !important;
  }

  #${PRINT_ROOT_ID} table {
    width: 707px !important;
    page-break-inside: auto;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  #${PRINT_ROOT_ID} thead {
    display: table-header-group;
  }

  #${PRINT_ROOT_ID} tbody {
    break-inside: avoid;
    page-break-inside: avoid;
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

function installPrintRoot(source: HTMLElement) {
  document.getElementById(PRINT_ROOT_ID)?.remove();
  const clone = source.cloneNode(true) as HTMLElement;
  clone.id = PRINT_ROOT_ID;
  clone.removeAttribute('data-print-root');
  document.body.appendChild(clone);
}

function removePrintArtifacts() {
  removePrintStyle();
  document.getElementById(PRINT_ROOT_ID)?.remove();
}

function textValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

function formatInteger(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString();
  if (typeof value === 'string' && value.trim()) return value;
  return '';
}

function formatListValue(value: unknown) {
  if (!value) return '';
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : item?.name ?? item?.label ?? ''))
      .filter(Boolean)
      .slice(0, 6)
      .join('、');
  }
  if (typeof value === 'object') return '';
  return String(value);
}

function formatPreference(student: Record<string, any> | undefined) {
  if (!student) return '';
  return (
    textValue(student.careerDirection) ||
    formatListValue(student.preferredMajors) ||
    formatListValue(student.preferredMajorCategories) ||
    formatListValue(student.preferredUniversityTypes)
  );
}

function formatPhysical(student: Record<string, any> | undefined) {
  if (!student) return '';
  const notes: string[] = [];
  if (student.colorBlind) notes.push('色盲');
  if (student.colorWeak) notes.push('色弱');
  if (student.vision) notes.push(`视力${student.vision}`);
  if (student.medicalHistory) notes.push(String(student.medicalHistory));
  return notes.join('、');
}

function getMajorValue(major: Record<string, any> | undefined, key: 'majorCode' | 'majorName') {
  if (!major) return '';
  return textValue(major[key] ?? major[key === 'majorCode' ? 'code' : 'name']);
}

function slotLabel(index: number) {
  return `第一志愿\n${String(index + 1).padStart(2, '0')}\n平行志愿`;
}

export default function PlanPreparationTable({ plan, items }: PlanPreparationTableProps) {
  const student = plan?.student as Record<string, any> | undefined;
  const studentName =
    plan?.studentName ?? student?.user?.realName ?? student?.user?.username ?? '';
  const totalScore = student?.totalScore ?? plan?.studentTotalScore ?? plan?.scoreUsed;
  const rank = student?.provincialRank ?? plan?.studentProvincialRank ?? plan?.rankUsed;
  const year = plan?.year ?? student?.examYear ?? 2025;
  const batchLabel = textValue(plan?.batchName ?? plan?.batch) || '本科批B段';
  const schoolName = textValue(student?.highSchool) || '优典学校';
  const slotCount = Math.max(TEMPLATE_SLOT_COUNT, items.length);
  const slots = Array.from({ length: slotCount }, (_, index) => items[index]);

  const handlePrint = () => {
    if (typeof window === 'undefined') return;
    const source = document.querySelector('[data-print-root]') as HTMLElement | null;
    installPrintStyle();
    if (source) installPrintRoot(source);
    window.addEventListener('afterprint', removePrintArtifacts, { once: true });
    window.print();
  };

  return (
    <div data-print-root className={styles.root}>
      <div data-print-action className={styles.actions}>
        <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>
          打印预案表
        </Button>
      </div>

      <div className={styles.sheet}>
        <table className={styles.excelTable}>
          <colgroup>
            <col className={styles.colA} />
            <col className={styles.colB} />
            <col className={styles.colC} />
            <col className={styles.colD} />
            <col className={styles.colE} />
            <col className={styles.colF} />
            <col className={styles.colG} />
            <col className={styles.colH} />
          </colgroup>
          <thead>
            <tr className={styles.titleRow}>
              <th colSpan={8} className={styles.titleCell}>
                {`${schoolName}${year}高考志愿\n${batchLabel} 志愿填报预案一览表`}
              </th>
            </tr>
            <tr className={styles.metaLabelRow}>
              <td className={styles.thickLeft}>姓名</td>
              <td colSpan={2}>分数/2024/2023</td>
              <td>位次</td>
              <td colSpan={3}>志愿倾向</td>
              <td className={styles.thickRight}>身体情况</td>
            </tr>
            <tr className={styles.metaValueRow}>
              <td className={styles.thickLeft}>{textValue(studentName)}</td>
              <td colSpan={2}>{formatInteger(totalScore)}</td>
              <td>{formatInteger(rank)}</td>
              <td colSpan={3} className={styles.metaSmall}>
                {formatPreference(student)}
              </td>
              <td className={`${styles.metaSmall} ${styles.thickRight}`}>
                {formatPhysical(student)}
              </td>
            </tr>
            <tr className={styles.groupHeaderRow}>
              <th>序号</th>
              <th colSpan={2}>院校</th>
              <th>专业组</th>
              <th colSpan={3}>专业</th>
              <th className={styles.adjustHead}>是否服从专业调剂</th>
            </tr>
          </thead>

          {slots.map((item, index) => {
            const selection = item
              ? getPlanItemMajorSelection(item as PlanItemMajorSelectionLike)
              : { selectedMajors: [] };
            const selectedMajors = (selection.selectedMajors ?? []) as Array<Record<string, any>>;
            const acceptsAdjust = item?.acceptAdjust !== false;

            return (
              <tbody key={item?.id ?? `empty-${index}`} className={styles.slotBlock}>
                {Array.from({ length: MAJOR_ROWS }).map((_, majorIndex) => {
                  const major = selectedMajors[majorIndex];
                  const isFirst = majorIndex === 0;

                  return (
                    <tr key={majorIndex}>
                      {isFirst ? (
                        <td rowSpan={MAJOR_ROWS} className={`${styles.seqCell} ${styles.mergedCell}`}>
                          {slotLabel(index)}
                        </td>
                      ) : null}
                      {isFirst ? (
                        <td rowSpan={MAJOR_ROWS} className={styles.mergedCell}>
                          {textValue(item?.universityCode)}
                        </td>
                      ) : null}
                      {isFirst ? (
                        <td rowSpan={MAJOR_ROWS} className={styles.mergedCell}>
                          {textValue(item?.universityName)}
                        </td>
                      ) : null}
                      {isFirst ? (
                        <td rowSpan={MAJOR_ROWS} className={styles.mergedCell}>
                          {textValue(item?.groupCode)}
                        </td>
                      ) : null}
                      <td>{majorIndex + 1}</td>
                      <td>{getMajorValue(major, 'majorCode')}</td>
                      <td>{getMajorValue(major, 'majorName')}</td>
                      {isFirst ? (
                        <td rowSpan={MAJOR_ROWS} className={`${styles.adjustCell} ${styles.mergedCell}`}>
                          <span>
                            是<span className={styles.wingdings}>{acceptsAdjust ? 'þ' : '¨'}</span>
                          </span>
                          <br />
                          <span>
                            否<span className={styles.wingdings}>{acceptsAdjust ? '¨' : 'þ'}</span>
                          </span>
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
    </div>
  );
}
