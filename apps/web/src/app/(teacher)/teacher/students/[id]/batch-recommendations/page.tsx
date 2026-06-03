import { BatchRecommendationsClient } from './BatchRecommendationsClient';

export default function Page({ params }: { params: { id: string } }) {
  const studentId = Number(params.id);
  if (!Number.isFinite(studentId) || studentId <= 0) {
    return <div>无效的学生 ID</div>;
  }
  return <BatchRecommendationsClient studentId={studentId} />;
}
