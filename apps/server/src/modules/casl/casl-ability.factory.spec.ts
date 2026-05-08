import { CaslAbilityFactory } from './casl-ability.factory';
import { JwtPayloadUser } from './types';

describe('CaslAbilityFactory', () => {
  let factory: CaslAbilityFactory;

  beforeEach(() => {
    factory = new CaslAbilityFactory();
  });

  // --- Admin ---

  it('should grant admin manage:all', () => {
    const admin: JwtPayloadUser = {
      id: 1,
      username: 'admin',
      role: 'ADMIN',
    };
    const ability = factory.createForUser(admin);

    expect(ability.can('manage', 'all')).toBe(true);
    expect(ability.can('create', 'User')).toBe(true);
    expect(ability.can('delete', 'SystemConfig')).toBe(true);
  });

  // --- Teacher (non-supervisor) ---

  it('should allow teacher to read universities and majors', () => {
    const teacher: JwtPayloadUser = {
      id: 2,
      username: 'teacher1',
      role: 'TEACHER',
      teacherProfileId: 10,
    };
    const ability = factory.createForUser(teacher);

    expect(ability.can('read', 'University')).toBe(true);
    expect(ability.can('read', 'Major')).toBe(true);
  });

  it('should allow teacher to create student profiles', () => {
    const teacher: JwtPayloadUser = {
      id: 2,
      username: 'teacher1',
      role: 'TEACHER',
      teacherProfileId: 10,
    };
    const ability = factory.createForUser(teacher);

    expect(ability.can('create', 'StudentProfile')).toBe(true);
  });

  it('should allow teacher to manage own student profiles', () => {
    const teacher: JwtPayloadUser = {
      id: 2,
      username: 'teacher1',
      role: 'TEACHER',
      teacherProfileId: 10,
    };
    const ability = factory.createForUser(teacher);

    // Own students (matching assignedTeacherId)
    expect(
      ability.can('read', 'StudentProfile'),
    ).toBe(true);
    expect(
      ability.can('update', 'StudentProfile'),
    ).toBe(true);
    expect(
      ability.can('delete', 'StudentProfile'),
    ).toBe(true);
  });

  it('should allow teacher to manage own volunteer plans', () => {
    const teacher: JwtPayloadUser = {
      id: 2,
      username: 'teacher1',
      role: 'TEACHER',
      teacherProfileId: 10,
    };
    const ability = factory.createForUser(teacher);

    expect(ability.can('create', 'VolunteerPlan')).toBe(true);
    expect(ability.can('read', 'VolunteerPlan')).toBe(true);
    expect(ability.can('update', 'VolunteerPlan')).toBe(true);
    expect(ability.can('delete', 'VolunteerPlan')).toBe(true);
  });

  it('should allow teacher to export own plans', () => {
    const teacher: JwtPayloadUser = {
      id: 2,
      username: 'teacher1',
      role: 'TEACHER',
      teacherProfileId: 10,
    };
    const ability = factory.createForUser(teacher);

    expect(ability.can('export', 'VolunteerPlan')).toBe(true);
  });

  it('should allow teacher to manage plan items', () => {
    const teacher: JwtPayloadUser = {
      id: 2,
      username: 'teacher1',
      role: 'TEACHER',
      teacherProfileId: 10,
    };
    const ability = factory.createForUser(teacher);

    expect(ability.can('create', 'PlanItem')).toBe(true);
    expect(ability.can('update', 'PlanItem')).toBe(true);
    expect(ability.can('delete', 'PlanItem')).toBe(true);
  });

  it('should allow teacher to use FullRecommend', () => {
    const teacher: JwtPayloadUser = {
      id: 2,
      username: 'teacher1',
      role: 'TEACHER',
      teacherProfileId: 10,
    };
    const ability = factory.createForUser(teacher);

    expect(ability.can('use', 'FullRecommend')).toBe(true);
  });

  it('should NOT allow non-supervisor teacher to review or publish plans', () => {
    const teacher: JwtPayloadUser = {
      id: 2,
      username: 'teacher1',
      role: 'TEACHER',
      teacherProfileId: 10,
      isSupervisor: false,
    };
    const ability = factory.createForUser(teacher);

    expect(ability.can('review', 'VolunteerPlan')).toBe(false);
    expect(ability.can('publish', 'VolunteerPlan')).toBe(false);
  });

  // --- Teacher (supervisor) ---

  it('should allow supervisor to review and publish plans', () => {
    const supervisor: JwtPayloadUser = {
      id: 3,
      username: 'supervisor1',
      role: 'TEACHER',
      teacherProfileId: 11,
      isSupervisor: true,
    };
    const ability = factory.createForUser(supervisor);

    expect(ability.can('review', 'VolunteerPlan')).toBe(true);
    expect(ability.can('publish', 'VolunteerPlan')).toBe(true);
  });

  it('supervisor can read any plan in PENDING_REVIEW or REVIEWING status', () => {
    const supervisor: JwtPayloadUser = {
      id: 99,
      username: 'sup',
      role: 'TEACHER',
      teacherProfileId: 50,
      isSupervisor: true,
    };
    const ability = factory.createForUser(supervisor);

    expect(
      ability.can('read', {
        __caslSubjectType__: 'VolunteerPlan',
        createdById: 1, // not own
        status: 'PENDING_REVIEW',
      } as any),
    ).toBe(true);
    expect(
      ability.can('read', {
        __caslSubjectType__: 'VolunteerPlan',
        createdById: 1,
        status: 'REVIEWING',
      } as any),
    ).toBe(true);
    expect(
      ability.can('read', {
        __caslSubjectType__: 'VolunteerPlan',
        createdById: 1,
        status: 'DRAFT',
      } as any),
    ).toBe(false);
  });

  it('teacher can read plans of students under their care', () => {
    const teacher: JwtPayloadUser = {
      id: 7,
      username: 'teacher2',
      role: 'TEACHER',
      teacherProfileId: 20,
      isSupervisor: false,
    };
    const ability = factory.createForUser(teacher);

    expect(
      ability.can('read', {
        __caslSubjectType__: 'VolunteerPlan',
        createdById: 999,
        student: { teacherId: 20 },
      } as any),
    ).toBe(true);
    expect(
      ability.can('read', {
        __caslSubjectType__: 'VolunteerPlan',
        createdById: 999,
        student: { teacherId: 21 },
      } as any),
    ).toBe(false);
  });

  // --- Student ---

  it('should allow student to read universities and majors', () => {
    const student: JwtPayloadUser = {
      id: 4,
      username: 'student1',
      role: 'STUDENT',
      studentProfileId: 20,
    };
    const ability = factory.createForUser(student);

    expect(ability.can('read', 'University')).toBe(true);
    expect(ability.can('read', 'Major')).toBe(true);
  });

  it('should allow student to read own volunteer plans', () => {
    const student: JwtPayloadUser = {
      id: 4,
      username: 'student1',
      role: 'STUDENT',
      studentProfileId: 20,
    };
    const ability = factory.createForUser(student);

    expect(ability.can('read', 'VolunteerPlan')).toBe(true);
  });

  it('should NOT allow student to create or delete plans', () => {
    const student: JwtPayloadUser = {
      id: 4,
      username: 'student1',
      role: 'STUDENT',
      studentProfileId: 20,
    };
    const ability = factory.createForUser(student);

    expect(ability.can('create', 'VolunteerPlan')).toBe(false);
    expect(ability.can('delete', 'VolunteerPlan')).toBe(false);
  });

  it('should allow student to update own profile', () => {
    const student: JwtPayloadUser = {
      id: 4,
      username: 'student1',
      role: 'STUDENT',
      studentProfileId: 20,
    };
    const ability = factory.createForUser(student);

    expect(ability.can('update', 'StudentProfile')).toBe(true);
  });

  it('should allow student to use LightRecommend', () => {
    const student: JwtPayloadUser = {
      id: 4,
      username: 'student1',
      role: 'STUDENT',
      studentProfileId: 20,
    };
    const ability = factory.createForUser(student);

    expect(ability.can('use', 'LightRecommend')).toBe(true);
  });

  it('should NOT allow student to use FullRecommend', () => {
    const student: JwtPayloadUser = {
      id: 4,
      username: 'student1',
      role: 'STUDENT',
      studentProfileId: 20,
    };
    const ability = factory.createForUser(student);

    expect(ability.can('use', 'FullRecommend')).toBe(false);
  });

  // --- Permission overrides ---

  it('should grant additional permission via override (granted=true)', () => {
    const student: JwtPayloadUser = {
      id: 4,
      username: 'student1',
      role: 'STUDENT',
      studentProfileId: 20,
      permissionOverrides: [
        { action: 'use', subject: 'FullRecommend', granted: true },
      ],
    };
    const ability = factory.createForUser(student);

    expect(ability.can('use', 'FullRecommend')).toBe(true);
  });

  it('should revoke permission via override (granted=false)', () => {
    const teacher: JwtPayloadUser = {
      id: 2,
      username: 'teacher1',
      role: 'TEACHER',
      teacherProfileId: 10,
      permissionOverrides: [
        { action: 'create', subject: 'VolunteerPlan', granted: false },
      ],
    };
    const ability = factory.createForUser(teacher);

    expect(ability.can('create', 'VolunteerPlan')).toBe(false);
  });
});
