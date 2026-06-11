import { useQuery } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import { useAuthStore } from '@/stores/authStore';
import { useWorkbench } from '@/stores/workbenchStore';

/** 工作台当前学生的档案 (仅老师角色拉取), 专业库/院校库共用 */
export function useWorkStudent() {
  const studentId = useWorkbench((s) => s.studentId);
  const setStudentId = useWorkbench((s) => s.setStudentId);
  const { user, isLoggedIn } = useAuthStore();
  const isTeacher = isLoggedIn && user?.role === 'TEACHER';

  const { data: raw, refetch } = useQuery({
    queryKey: ['workbench-student', studentId],
    queryFn: () => studentApi.getById(studentId!),
    enabled: isTeacher && !!studentId,
  });
  const student: any = (raw as any)?.data ?? raw ?? null;
  const name = student?.user?.realName ?? student?.realName ?? student?.username ?? '';
  // 首选科目 → 科类 ('物理'|'历史'|null)
  const lane: string | null =
    student?.examType === 'PHYSICS' || student?.firstChoice === '物理'
      ? '物理'
      : student?.examType === 'HISTORY' || student?.firstChoice === '历史'
        ? '历史'
        : null;
  const rank: number | null = student?.provincialRank ? Number(student.provincialRank) : null;

  return { isTeacher, studentId, setStudentId, student, name, lane, rank, refetch };
}

/** 老师的学生列表 → Select options (label 带位次) */
export function useWorkStudentOptions(enabled: boolean) {
  const { data } = useQuery({
    queryKey: ['workbench-students'],
    queryFn: () => studentApi.getList({ pageSize: 500 }),
    enabled,
  });
  const list = ((data as any)?.data ?? []) as any[];
  return (Array.isArray(list) ? list : []).map((s: any) => {
    const n = s.user?.realName ?? s.realName ?? s.username ?? `#${s.id}`;
    return {
      label: s.provincialRank ? `${n} · 位次 ${Number(s.provincialRank).toLocaleString()}` : n,
      value: String(s.id),
    };
  });
}
