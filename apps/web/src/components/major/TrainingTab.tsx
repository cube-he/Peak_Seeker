'use client';
import { Tag, Typography, Empty, Collapse } from 'antd';

const { Title, Paragraph } = Typography;

interface Props {
  trainingObjective?: string | null;
  trainingRequirements?: string | null;
  disciplineReq?: string | null;
  knowledgeAbility?: string | null;
  similarMajors?: string[] | null;
  professionalCerts?: string[] | null;
  famousPeople?: string[] | null;
  internshipDesc?: string | null;
  postUpgradeDirection?: string | null;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <Title level={5} className="!mb-2">{label}</Title>
      {children}
    </section>
  );
}

function TagList({ items, color }: { items: string[]; color?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <Tag key={s} color={color}>{s}</Tag>
      ))}
    </div>
  );
}

export default function TrainingTab(p: Props) {
  const hasObjective = !!p.trainingObjective;
  const hasRequirements = !!p.trainingRequirements;
  const hasDiscipline = !!p.disciplineReq;
  const hasKnowledge = !!p.knowledgeAbility;
  const hasSimilar = p.similarMajors && p.similarMajors.length > 0;
  const hasCerts = p.professionalCerts && p.professionalCerts.length > 0;
  const hasFamous = p.famousPeople && p.famousPeople.length > 0;
  const hasInternship = !!p.internshipDesc;
  const hasPostUp = !!p.postUpgradeDirection;

  if (!hasObjective && !hasRequirements && !hasDiscipline && !hasKnowledge &&
      !hasSimilar && !hasCerts && !hasFamous && !hasInternship && !hasPostUp) {
    return <Empty description="暂无培养方案数据" className="py-10" />;
  }

  // 长文本字段集中放进 Collapse 节省纵向空间
  const collapseItems = [
    hasObjective && {
      key: 'obj',
      label: '培养目标',
      children: <Paragraph className="!mb-0 !text-[13px] !leading-6">{p.trainingObjective}</Paragraph>,
    },
    hasRequirements && {
      key: 'req',
      label: '培养要求',
      children: <Paragraph className="!mb-0 !text-[13px] !leading-6">{p.trainingRequirements}</Paragraph>,
    },
    hasDiscipline && {
      key: 'disc',
      label: '学科要求',
      children: <Paragraph className="!mb-0 !text-[13px] !leading-6">{p.disciplineReq}</Paragraph>,
    },
    hasKnowledge && {
      key: 'kn',
      label: '知识能力要求',
      children: (
        <Paragraph className="!mb-0 !whitespace-pre-line !text-[13px] !leading-6">
          {p.knowledgeAbility}
        </Paragraph>
      ),
    },
  ].filter(Boolean) as any[];

  return (
    <div className="py-4 space-y-5">
      {collapseItems.length > 0 && (
        <Collapse
          ghost
          defaultActiveKey={['obj']}
          items={collapseItems}
        />
      )}

      {hasSimilar && (
        <Section label="相近专业">
          <TagList items={p.similarMajors!} color="blue" />
        </Section>
      )}

      {hasCerts && (
        <Section label="职业资格证书">
          <TagList items={p.professionalCerts!} color="gold" />
        </Section>
      )}

      {hasFamous && (
        <Section label="社会名人">
          <TagList items={p.famousPeople!} color="magenta" />
        </Section>
      )}

      {hasInternship && (
        <Section label="实习">
          <Paragraph className="!mb-0 !text-[13px] !leading-6">{p.internshipDesc}</Paragraph>
        </Section>
      )}

      {hasPostUp && (
        <Section label="专升本方向">
          <Paragraph className="!mb-0 !text-[13px] !leading-6">{p.postUpgradeDirection}</Paragraph>
        </Section>
      )}
    </div>
  );
}
