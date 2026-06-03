'use client';
import { useState } from 'react';
import { ReferencesList } from './ReferencesList';
import type { SubsetResult } from '@/services/batch-recommendations-api';

const VERDICT_LABEL: Record<string, string> = {
  ELIGIBLE: '资格通过',
  CONDITIONAL: '条件通过',
  INELIGIBLE: '资格不符',
  DATA_PENDING: '详情待补充',
};
const PASS_ICON: Record<string, string> = {
  PASS: '✓',
  FAIL: '✗',
  UNCERTAIN: '?',
  SOFT_HINT: 'ℹ',
};

export function SubsetItem({ subset }: { subset: SubsetResult }) {
  const [expanded, setExpanded] = useState(false);
  const oneLineReason =
    subset.rulesEval.find((r) => r.pass === 'FAIL')?.requirement ??
    subset.rulesEval.find((r) => r.pass === 'SOFT_HINT')?.requirement ??
    subset.description;
  return (
    <div className="border-l-2 pl-3">
      <button
        type="button"
        className="w-full text-left text-sm hover:bg-gray-50 p-1"
        onClick={() => setExpanded((x) => !x)}
      >
        <span className="font-medium">{subset.name}</span>
        <span className="ml-2 text-xs text-gray-500">[{VERDICT_LABEL[subset.verdict]}]</span>
        <span className="ml-2 text-xs text-gray-600">— {oneLineReason}</span>
        <span className="float-right text-xs text-blue-600">{expanded ? '收起 ▲' : '展开 ▼'}</span>
      </button>
      {expanded && (
        <div className="ml-3 mt-2 text-xs space-y-2">
          <div className="text-gray-700">{subset.description}</div>
          {subset.rulesEval.length > 0 && (
            <ul className="space-y-1">
              {subset.rulesEval.map((r, i) => (
                <li key={i}>
                  <span className="mr-1">{PASS_ICON[r.pass]}</span>
                  <span>
                    {r.requirement}: {r.actual}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ReferencesList references={subset.references} />
        </div>
      )}
    </div>
  );
}
