import { create } from 'zustand';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface StudentSaveStore {
  state: SaveState;
  errorMessage?: string;
  setSaving: () => void;
  setSaved: () => void;
  setError: (message: string) => void;
  reset: () => void;
}

export const useStudentSaveStore = create<StudentSaveStore>((set) => ({
  state: 'idle',
  setSaving: () => set({ state: 'saving', errorMessage: undefined }),
  setSaved: () => set({ state: 'saved' }),
  setError: (errorMessage) => set({ state: 'error', errorMessage }),
  reset: () => set({ state: 'idle', errorMessage: undefined }),
}));
