import { Alert, Button, Empty, Popconfirm, Space, Tag } from 'antd';
import { CheckCircleOutlined, InfoCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { isBlockingPlanRisk, summarizePlanRisks } from '@/lib/plan-risks';
import type { PlanRisk } from '@/lib/plan-risks';

type PlanRiskPanelProps = {
  risks?: PlanRisk[];
  resolvingId?: number | 'all';
  onResolveSoft?: (risk: PlanRisk) => void;
  onResolveAllSoft?: (risks: PlanRisk[]) => void;
};

function getRiskLocation(risk: PlanRisk) {
  if (!risk.planItem) return '未定位到志愿';
  const parts = [
    `第 ${risk.planItem.sequence} 志愿`,
    risk.planItem.universityName,
    risk.planItem.majorName,
  ].filter(Boolean);
  return parts.join(' · ');
}

function groupLabel(category: string) {
  if (category === 'gradient') return '分数梯度';
  if (category === 'qualification') return '资格条件';
  if (category === 'volatility') return '波动风险';
  if (category === 'concentration') return '集中风险';
  return category || '风险';
}

function RiskRow({
  risk,
  resolving,
  onResolveSoft,
}: {
  risk: PlanRisk;
  resolving: boolean;
  onResolveSoft?: (risk: PlanRisk) => void;
}) {
  const blocking = isBlockingPlanRisk(risk);
  return (
    <div className="rounded-md border border-border bg-bg/60 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tag color={blocking ? 'red' : 'gold'}>{blocking ? '硬性不符' : '软风险'}</Tag>
        <Tag>{groupLabel(risk.category)}</Tag>
        {risk.duplicateCount && risk.duplicateCount > 1 ? (
          <Tag color="default">重复 {risk.duplicateCount} 次已合并</Tag>
        ) : null}
      </div>
      <div className="mt-2 text-sm font-medium text-text">{getRiskLocation(risk)}</div>
      <div className="mt-1 text-sm text-text-muted">{risk.message}</div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-text-muted">
          {blocking ? '需要调整志愿后才能提交' : '可由老师确认后提交主管复核'}
        </span>
        {!blocking && onResolveSoft ? (
          <Popconfirm
            title="确认已知晓该软风险?"
            description="确认后该风险会标记为已处理，不再影响提交前提醒。"
            okText="确认"
            cancelText="取消"
            onConfirm={() => onResolveSoft(risk)}
          >
            <Button size="small" icon={<CheckCircleOutlined />} loading={resolving}>
              确认已知晓
            </Button>
          </Popconfirm>
        ) : null}
      </div>
    </div>
  );
}

export default function PlanRiskPanel({
  risks,
  resolvingId,
  onResolveSoft,
  onResolveAllSoft,
}: PlanRiskPanelProps) {
  const summary = summarizePlanRisks(risks);

  if (summary.unresolvedCount === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待处理风险" />;
  }

  return (
    <div className="space-y-4">
      {summary.blockingCount > 0 ? (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined />}
          message={`有 ${summary.blockingCount} 条硬性不符，需要先调整方案`}
          description="硬性不符包含选科、身体条件、定向/专项资格、计划为 0 等客观限制，不能通过确认跳过。"
        />
      ) : (
        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          message="没有硬性不符"
          description="剩余分数、地域、专业偏好或历史数据不足属于软风险，可确认后提交主管复核。"
        />
      )}

      {summary.softCount > 0 && onResolveAllSoft ? (
        <div className="flex justify-end">
          <Popconfirm
            title={`确认全部 ${summary.softCount} 条软风险?`}
            description="确认后软风险会标记为已处理，主管审核仍可看到方案内容。"
            okText="全部确认"
            cancelText="取消"
            onConfirm={() => onResolveAllSoft(summary.soft)}
          >
            <Button loading={resolvingId === 'all'} icon={<CheckCircleOutlined />}>
              全部确认软风险
            </Button>
          </Popconfirm>
        </div>
      ) : null}

      {summary.blocking.length ? (
        <section>
          <div className="mb-2 text-sm font-semibold text-text">硬性不符</div>
          <Space direction="vertical" size={8} className="w-full">
            {summary.blocking.map((risk) => (
              <RiskRow
                key={risk.id}
                risk={risk}
                resolving={resolvingId === risk.id}
                onResolveSoft={onResolveSoft}
              />
            ))}
          </Space>
        </section>
      ) : null}

      {summary.soft.length ? (
        <section>
          <div className="mb-2 text-sm font-semibold text-text">软风险</div>
          <Space direction="vertical" size={8} className="w-full">
            {summary.soft.map((risk) => (
              <RiskRow
                key={risk.id}
                risk={risk}
                resolving={resolvingId === risk.id}
                onResolveSoft={onResolveSoft}
              />
            ))}
          </Space>
        </section>
      ) : null}
    </div>
  );
}
