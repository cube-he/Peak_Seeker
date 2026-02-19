import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
    gender?: string;
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

  async updateVipLevel(id: number, vipLevel: string, expireAt: Date) {
    return this.prisma.user.update({
      where: { id },
      data: {
        vipLevel: vipLevel as any,
        vipExpireAt: expireAt,
      },
    });
  }
}
