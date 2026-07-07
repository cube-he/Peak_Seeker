// CASL permission system types — defines the action/subject matrix and JWT user shape

export type Actions =
  | 'manage'
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'export'
  | 'review'
  | 'publish'
  | 'use';

export type Subjects =
  | 'all'
  | 'User'
  | 'StudentProfile'
  | 'TeacherProfile'
  | 'VolunteerPlan'
  | 'PlanItem'
  | 'University'
  | 'Major'
  | 'DataImport'
  | 'SystemConfig'
  | 'AlgorithmConfig'
  | 'LightRecommend'
  | 'FullRecommend'
  | 'Notification'
  | 'AuditLog';

export interface PermissionOverride {
  action: string;
  subject: string;
  granted: boolean;
}

export interface JwtPayloadUser {
  id: number;
  username: string;
  role: string;
  teacherProfileId?: number;
  studentProfileId?: number;
  isSupervisor?: boolean;
  isPrimarySupervisor?: boolean;
  permissionOverrides?: PermissionOverride[];
}
