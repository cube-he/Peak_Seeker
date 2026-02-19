import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ExamInfo {
  score: number | null;
  rank: number | null;
  province: string | null;
  subjects: string[];
  examYear: number | null;
}

interface Preferences {
  provinces: string[];
  cities: string[];
  majorCategories: string[];
  universityTypes: string[];
}

interface UserState {
  examInfo: ExamInfo;
  preferences: Preferences;
  setExamInfo: (info: Partial<ExamInfo>) => void;
  setPreferences: (prefs: Partial<Preferences>) => void;
  reset: () => void;
}

const initialExamInfo: ExamInfo = {
  score: null,
  rank: null,
  province: null,
  subjects: [],
  examYear: null,
};

const initialPreferences: Preferences = {
  provinces: [],
  cities: [],
  majorCategories: [],
  universityTypes: [],
};

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      examInfo: initialExamInfo,
      preferences: initialPreferences,

      setExamInfo: (info) =>
        set((state) => ({
          examInfo: { ...state.examInfo, ...info },
        })),

      setPreferences: (prefs) =>
        set((state) => ({
          preferences: { ...state.preferences, ...prefs },
        })),

      reset: () =>
        set({
          examInfo: initialExamInfo,
          preferences: initialPreferences,
        }),
    }),
    {
      name: 'user-storage',
    }
  )
);
