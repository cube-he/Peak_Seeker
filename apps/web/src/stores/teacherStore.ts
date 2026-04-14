import { create } from 'zustand';

interface TeacherState {
  // Kanban view preference
  kanbanView: 'kanban' | 'list';
  setKanbanView: (view: 'kanban' | 'list') => void;

  // Active student in context
  activeStudentId: string | null;
  setActiveStudentId: (id: string | null) => void;

  // Plan generation state
  generatingForStudentId: string | null;
  setGeneratingForStudentId: (id: string | null) => void;

  // Filters persistence
  studentFilters: {
    search: string;
    status: string | undefined;
  };
  setStudentFilters: (filters: Partial<TeacherState['studentFilters']>) => void;

  planFilters: {
    search: string;
    batch: string | undefined;
    status: string | undefined;
  };
  setPlanFilters: (filters: Partial<TeacherState['planFilters']>) => void;
}

export const useTeacherStore = create<TeacherState>()((set) => ({
  kanbanView: 'kanban',
  setKanbanView: (view) => set({ kanbanView: view }),

  activeStudentId: null,
  setActiveStudentId: (id) => set({ activeStudentId: id }),

  generatingForStudentId: null,
  setGeneratingForStudentId: (id) => set({ generatingForStudentId: id }),

  studentFilters: { search: '', status: undefined },
  setStudentFilters: (filters) =>
    set((state) => ({
      studentFilters: { ...state.studentFilters, ...filters },
    })),

  planFilters: { search: '', batch: undefined, status: undefined },
  setPlanFilters: (filters) =>
    set((state) => ({
      planFilters: { ...state.planFilters, ...filters },
    })),
}));
