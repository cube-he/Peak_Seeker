// 专业相关类型
export interface Major {
  id: number;
  name: string;
  code: string | null;
  category: string | null;
  level: string | null;
  discipline: string | null;
  type: string | null;
  notes: string | null;
  isRestricted: boolean;
  employmentRate: number | null;
  avgSalary: number | null;
  employmentDirection: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MajorListItem {
  id: number;
  name: string;
  code: string | null;
  category: string | null;
  level: string | null;
  discipline: string | null;
  universityCount?: number;
}

export interface MajorDetail extends Major {
  universities?: {
    id: number;
    name: string;
    province: string | null;
    latestAdmission?: {
      minScore: number | null;
      minRank: number | null;
    };
  }[];
}
