'use client';
import { Tag, Typography, Divider, Empty } from 'antd';
const { Title } = Typography;

interface Props {
  careerDirections?: string[] | null;
  postgraduateDirections?: string[] | null;
  coreCourses?: string[] | null;
}

const MAX_CAREER_TAGS = 12;

export default function CareerTab({ careerDirections, postgraduateDirections, coreCourses }: Props) {
  const hasCareer = careerDirections && careerDirections.length > 0;
  const hasPostgrad = postgraduateDirections && postgraduateDirections.length > 0;
  const hasCourses = coreCourses && coreCourses.length > 0;

  if (!hasCareer && !hasPostgrad && !hasCourses) {
    return <Empty description="暂无就业与发展数据" className="py-10" />;
  }

  return (
    <div className="py-4">
      {hasCareer && (
        <section>
          <Title level={5} className="mb-3">主要职业方向</Title>
          <div className="flex flex-wrap gap-2">
            {careerDirections!.slice(0, MAX_CAREER_TAGS).map((dir) => (
              <Tag key={dir} color="blue">{dir}</Tag>
            ))}
            {careerDirections!.length > MAX_CAREER_TAGS && (
              <Tag color="blue">+{careerDirections!.length - MAX_CAREER_TAGS} 更多</Tag>
            )}
          </div>
        </section>
      )}

      {hasPostgrad && (
        <>
          {hasCareer && <Divider />}
          <section>
            <Title level={5} className="mb-3">考研方向</Title>
            <div className="flex flex-wrap gap-2">
              {postgraduateDirections!.map((dir) => (
                <Tag key={dir} color="purple">{dir}</Tag>
              ))}
            </div>
          </section>
        </>
      )}

      {hasCourses && (
        <>
          {(hasCareer || hasPostgrad) && <Divider />}
          <section>
            <Title level={5} className="mb-3">核心课程</Title>
            <div className="flex flex-wrap gap-2">
              {coreCourses!.map((course) => (
                <Tag key={course}>{course}</Tag>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
