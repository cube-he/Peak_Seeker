// New role-based type system aligned with Prisma schema enums

// --- Enums (matching Prisma schema) ---

export enum Role {
  ADMIN = 'ADMIN',
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
}

export enum StudentStatus {
  ACTIVE = 'ACTIVE',
  GRADUATED = 'GRADUATED',
  DROPPED = 'DROPPED',
  SUSPENDED = 'SUSPENDED',
}

/** Extended plan lifecycle — replaces the simpler PlanStatus for new flows */
export enum PlanStatusNew {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  REVIEWING = 'REVIEWING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  FINALIZED = 'FINALIZED',
  PUBLISHED = 'PUBLISHED',
  OUTDATED = 'OUTDATED',
}

export enum ExamSource {
  REAL_EXAM = 'REAL_EXAM',
  MOCK_EXAM = 'MOCK_EXAM',
  ESTIMATED = 'ESTIMATED',
}

export enum Gradient {
  CHONG = 'CHONG',
  WEN = 'WEN',
  BAO = 'BAO',
}

export enum BatchType {
  EARLY_BATCH = 'EARLY_BATCH',
  FIRST_BATCH = 'FIRST_BATCH',
  SECOND_BATCH = 'SECOND_BATCH',
  SPECIAL_BATCH = 'SPECIAL_BATCH',
}

// --- Profile interfaces ---

export interface TeacherProfileInfo {
  id: number;
  userId: number;
  school: string | null;
  isSupervisor: boolean;
  /** Username from the associated User record */
  username: string;
  realName: string | null;
  studentCount?: number;
  createdAt: Date;
}

export interface StudentProfileSummary {
  id: number;
  userId: number;
  username: string;
  realName: string | null;
  province: string | null;
  highSchool: string | null;
  status: StudentStatus;
  examYear: number | null;
  totalScore: number | null;
  provincialRank: number | null;
  examSource: ExamSource | null;
  teacherId: number | null;
  createdAt: Date;
}

// --- Notification ---

export interface NotificationItem {
  id: number;
  userId: number;
  title: string;
  content: string;
  type: string;
  refType: string | null;
  refId: number | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}
