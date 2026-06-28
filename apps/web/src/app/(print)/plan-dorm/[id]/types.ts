export interface DormSheetUniversity {
  id: number;
  name: string;
  province: string | null;
  city: string | null;
  runningLevel: string | null;
  runningNature: string | null;
  dorm: Record<string, string | null>;
  hasData: boolean;
}

export interface DormSheet {
  plan: { id: number; batchName: string | null; year: number | null };
  student: { name: string | null };
  universities: DormSheetUniversity[];
}
