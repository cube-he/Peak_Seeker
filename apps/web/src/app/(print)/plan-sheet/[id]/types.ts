// 镜像 apps/server/.../plan-export-rows.builder.ts 的导出类型(无共享包, 故复制小接口)。
export interface ExportMajor {
  majorCode: string | null;
  majorName: string;
  planCount: number | null;
  planByYear: Record<number, number | null>;
  minScoreByYear: Record<number, number | null>;
  suppByYear: Record<number, number[] | null>; // 逐轮征集人数 [第1轮, 第2轮, ...]
  duration: string | null;
  tuition: number | null;
  planNotes: string | null;
  bookPageNumber: number | null;
}

export interface ExportGroup {
  sequence: number;
  gradient: string;
  gradientLabel: string;
  universityName: string;
  universityCode: string | null;
  schoolNature: string | null;
  schoolTags: string | null;
  city: string | null;
  universityRank: number | null;
  groupCode: string | null;
  groupPlanCount: number | null;
  fallback: boolean;
  majors: ExportMajor[];
}

export interface ExportSheet {
  student: { name: string; examTypeLabel: string; score: number | null; rank: number | null };
  plan: { id: number; name: string; year: number; batchName: string | null; version: number | null };
  years: number[];
  groups: ExportGroup[];
}
