import { create } from 'zustand';

/**
 * 老师工作台的"当前服务学生"——专业库 / 院校库共享同一个学生上下文,
 * 在一个库选了学生, 切到另一个库不需要重选。
 * 不持久化: 会话内有效; 冷启动可由页面 ?studentId= 写入。
 */
interface WorkbenchState {
  studentId: string | null;
  setStudentId: (id: string | null) => void;
}

export const useWorkbench = create<WorkbenchState>((set) => ({
  studentId: null,
  setStudentId: (studentId) => set({ studentId }),
}));
