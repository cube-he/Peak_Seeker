import { Injectable } from '@nestjs/common';
import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
} from '@casl/ability';
import { Actions, Subjects, JwtPayloadUser } from './types';

export type AppAbility = MongoAbility<[Actions, Subjects]>;

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: JwtPayloadUser): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(
      createMongoAbility,
    );

    switch (user.role) {
      case 'ADMIN':
        // Admin has unrestricted access
        can('manage', 'all');
        break;

      case 'TEACHER':
        this.defineTeacherRules(can, cannot, user);
        break;

      case 'STUDENT':
        this.defineStudentRules(can, user);
        break;
    }

    // Apply per-user permission overrides (admin-configured exceptions)
    this.applyOverrides(can, cannot, user);

    return build();
  }

  private defineTeacherRules(
    can: AbilityBuilder<AppAbility>['can'],
    _cannot: AbilityBuilder<AppAbility>['cannot'],
    user: JwtPayloadUser,
  ): void {
    // Reference data: read-only
    can('read', 'University');
    can('read', 'Major');

    // Student management: create + manage own students (by assignedTeacherId)
    can('create', 'StudentProfile');
    can(['read', 'update', 'delete', 'export'], 'StudentProfile', {
      assignedTeacherId: user.teacherProfileId,
    } as any);

    // Plan lifecycle: full CRUD on own plans (by createdById)
    can(['create', 'read', 'update', 'delete', 'export'], 'VolunteerPlan', {
      createdById: user.id,
    } as any);

    // Read plans of students under this teacher (collaboration read)
    if (user.teacherProfileId) {
      can('read', 'VolunteerPlan', {
        'student.teacherId': user.teacherProfileId,
      } as any);
    }

    // Plan items: manage items within own plans
    can(['create', 'read', 'update', 'delete'], 'PlanItem', {
      createdById: user.id,
    } as any);

    // Recommendation engine
    can('use', 'FullRecommend');
    can('use', 'LightRecommend');

    // Supervisor-only: review and publish any plan
    if (user.isSupervisor) {
      can('review', 'VolunteerPlan');
      can('publish', 'VolunteerPlan');
      // Read any plan currently in review pipeline
      can('read', 'VolunteerPlan', {
        status: { $in: ['PENDING_REVIEW', 'REVIEWING'] },
      } as any);
    }
  }

  private defineStudentRules(
    can: AbilityBuilder<AppAbility>['can'],
    user: JwtPayloadUser,
  ): void {
    // Reference data: read-only
    can('read', 'University');
    can('read', 'Major');

    // Own plans: read-only (teachers create/manage plans for students)
    can('read', 'VolunteerPlan', { studentId: user.studentProfileId } as any);

    // Own profile: can read + update their own info
    // Note: /students/me 端点目前自己用 role !== STUDENT 守门，未挂 PoliciesGuard。
    // 这两条规则是为日后 controller 重构（如显式 ability.can 校验）保持一致。
    can(['read', 'update'], 'StudentProfile', { userId: user.id } as any);

    // Light recommendation only
    can('use', 'LightRecommend');
  }

  private applyOverrides(
    can: AbilityBuilder<AppAbility>['can'],
    cannot: AbilityBuilder<AppAbility>['cannot'],
    user: JwtPayloadUser,
  ): void {
    if (!user.permissionOverrides?.length) return;

    for (const override of user.permissionOverrides) {
      const action = override.action as Actions;
      const subject = override.subject as Subjects;

      if (override.granted) {
        can(action, subject);
      } else {
        cannot(action, subject);
      }
    }
  }
}
