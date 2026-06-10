import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { PermissionOverride } from '../casl/types';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    username: string;
    passwordHash: string;
    phone?: string;
    email?: string;
    realName?: string;
    province?: string;
  }) {
    return this.prisma.user.create({
      data: {
        username: data.username,
        passwordHash: data.passwordHash,
        phone: data.phone,
        email: data.email,
        realName: data.realName,
        province: data.province,
      },
    });
  }

  async findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({
      where: { phone },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async updateLastLogin(id: number, ip?: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ip,
      },
    });
  }

  async updateProfile(id: number, data: {
    realName?: string;
    phone?: string;
    gender?: string;
    ethnicity?: string;
    birthDate?: Date;
    avatar?: string;
  }) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async updateExamInfo(id: number, data: {
    province?: string;
    city?: string;
    examType?: string;
    examYear?: number;
    score?: number;
    rank?: number;
    subjects?: any;
    batch?: string;
  }) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async updatePreferences(id: number, data: {
    preferredProvinces?: string[];
    preferredCities?: string[];
    preferredMajors?: string[];
    preferredUniversityTypes?: string[];
    careerDirection?: string;
  }) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async updatePassword(id: number, passwordHash: string) {
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
  }

  /**
   * 用户自助改密码：先用旧密码核身，再写新哈希。
   * 旧密码错误直接拒绝，避免会话被盗后能静默改密。
   */
  async changePassword(id: number, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException('原密码错误');
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
    return { message: '密码修改成功' };
  }

  /**
   * 用户自助改用户名：username 唯一，要查重。
   * 命中的若是自己（未真正改动）放行，避免误报“已存在”。
   */
  async changeUsername(id: number, username: string) {
    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing && existing.id !== id) {
      throw new ConflictException('用户名已存在');
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: { username },
    });
    const { passwordHash, ...rest } = user;
    return rest;
  }

  async updateVipLevel(id: number, vipLevel: string, expireAt: Date) {
    return this.prisma.user.update({
      where: { id },
      data: {
        vipLevel: vipLevel as any,
        vipExpireAt: expireAt,
      },
    });
  }

  // ── Admin user management ─────────────────────────────

  /**
   * Paginated user list with optional filter. Includes profiles.
   */
  async findMany(
    where: Prisma.UserWhereInput,
    page: number = 1,
    pageSize: number = 20,
  ) {
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          realName: true,
          phone: true,
          email: true,
          role: true,
          gender: true,
          createdAt: true,
          lastLoginAt: true,
          teacherProfile: {
            select: {
              id: true,
              school: true,
              isSupervisor: true,
            },
          },
          studentProfile: {
            select: {
              id: true,
              status: true,
              highSchool: true,
              examYear: true,
              teacherId: true,
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * Count users matching a filter.
   */
  async count(where: Prisma.UserWhereInput) {
    return this.prisma.user.count({ where });
  }

  /**
   * Set per-user permission overrides (admin-configured exceptions).
   */
  async updatePermissionOverrides(
    userId: number,
    overrides: PermissionOverride[],
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { permissionOverrides: overrides as any },
      select: {
        id: true,
        username: true,
        role: true,
        permissionOverrides: true,
      },
    });
  }

  /**
   * Return role defaults merged with per-user overrides.
   */
  async getEffectivePermissions(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        permissionOverrides: true,
      },
    });

    if (!user) return null;

    return {
      userId: user.id,
      role: user.role,
      overrides: (user.permissionOverrides as PermissionOverride[] | null) ?? [],
    };
  }
}
