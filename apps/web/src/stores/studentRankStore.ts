import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ExamType, EquivalentResult } from '@/services/score-segment';

interface StudentRankState {
  /** 当前的成绩输入：分数 */
  score: number | null;
  /** 当前的成绩输入：科类 */
  examType: ExamType;
  /** 经服务端计算后的当年位次 */
  rank: number | null;
  /** 跨年等位换算结果（最近一次查询） */
  equivalents: EquivalentResult | null;
  /** 输入的基准年（默认当前年） */
  baseYear: number;

  /** 设置完整结果（一般在调用 lookup 后） */
  setRankResult(input: {
    score: number;
    examType: ExamType;
    rank: number;
    baseYear: number;
    equivalents: EquivalentResult | null;
  }): void;

  /** 仅切换科类（输入态时） */
  setExamType(examType: ExamType): void;

  /** 清空（登出 / 用户主动清除） */
  clear(): void;
}

const DEFAULT_YEAR = new Date().getFullYear();

export const useStudentRank = create<StudentRankState>()(
  persist(
    (set) => ({
      score: null,
      examType: '物理',
      rank: null,
      equivalents: null,
      baseYear: DEFAULT_YEAR,

      setRankResult: ({ score, examType, rank, baseYear, equivalents }) =>
        set({ score, examType, rank, baseYear, equivalents }),

      setExamType: (examType) => set({ examType }),

      clear: () =>
        set({
          score: null,
          rank: null,
          equivalents: null,
        }),
    }),
    {
      name: 'vh:student-rank',
      storage: createJSONStorage(() => localStorage),
      // 只持久化必要字段
      partialize: (s) => ({
        score: s.score,
        examType: s.examType,
        rank: s.rank,
        equivalents: s.equivalents,
        baseYear: s.baseYear,
      }),
    },
  ),
);
