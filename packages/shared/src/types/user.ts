// 用户相关类型
export enum VipLevel {
  FREE = 'FREE',
  BASIC = 'BASIC',
  PREMIUM = 'PREMIUM',
  EXPERT = 'EXPERT',
}

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export interface User {
  id: number;
  username: string;
  email: string | null;
  phone: string | null;
  realName: string | null;
  gender: string | null;
  birthDate: Date | null;
  avatar: string | null;
  province: string | null;
  city: string | null;
  examType: string | null;
  examYear: number | null;
  score: number | null;
  rank: number | null;
  subjects: Record<string, any> | null;
  batch: string | null;
  preferredProvinces: string[];
  preferredCities: string[];
  preferredMajors: string[];
  preferredUniversityTypes: string[];
  careerDirection: string | null;
  vipLevel: VipLevel;
  vipExpireAt: Date | null;
  role: UserRole;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  id: number;
  username: string;
  email: string | null;
  phone: string | null;
  realName: string | null;
  avatar: string | null;
  province: string | null;
  examYear: number | null;
  score: number | null;
  rank: number | null;
  vipLevel: VipLevel;
  vipExpireAt: Date | null;
}

export interface ExamInfo {
  province: string;
  examType: string;
  examYear: number;
  score: number;
  rank: number;
  subjects?: Record<string, any>;
  batch?: string;
}

export interface UserPreferences {
  preferredProvinces: string[];
  preferredCities: string[];
  preferredMajors: string[];
  preferredUniversityTypes: string[];
  careerDirection?: string;
}
