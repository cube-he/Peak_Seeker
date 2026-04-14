import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
  ) {}

  async register(dto: RegisterDto) {
    // 检查用户名是否已存在
    const existingUser = await this.userService.findByUsername(dto.username);
    if (existingUser) {
      throw new ConflictException('用户名已存在');
    }

    // 检查手机号是否已存在
    if (dto.phone) {
      const existingPhone = await this.userService.findByPhone(dto.phone);
      if (existingPhone) {
        throw new ConflictException('手机号已被注册');
      }
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const role = (dto.role as Role) || Role.STUDENT;

    // Build profile creation based on role
    const profileData: Record<string, any> = {};
    if (role === Role.TEACHER) {
      profileData.teacherProfile = { create: {} };
    } else if (role === Role.STUDENT) {
      profileData.studentProfile = { create: { province: dto.province || '四川' } };
    }
    // ADMIN gets no profile

    // 创建用户 with profile via Prisma directly (UserService.create doesn't support nested profile creation)
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        phone: dto.phone,
        email: dto.email,
        realName: dto.realName,
        province: dto.province,
        role,
        ...profileData,
      },
      include: {
        teacherProfile: true,
        studentProfile: true,
      },
    });

    // 生成 token
    const tokens = await this.generateTokens(user);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async login(dto: LoginDto, ip?: string) {
    const user = await this.validateUser(dto.username, dto.password);
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    // 更新最后登录时间
    await this.userService.updateLastLogin(user.id, ip);

    // 生成 token
    const tokens = await this.generateTokens(user);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async logout(token: string) {
    // 将 token 加入黑名单
    const decoded = this.jwtService.decode(token) as { exp: number };
    if (decoded?.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await this.redisService.addToBlacklist(token, ttl);
      }
    }
    return { message: '登出成功' };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET', 'refresh-default-secret'),
      });

      // Load user with profiles for fresh token data
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          teacherProfile: true,
          studentProfile: true,
        },
      });
      if (!user) {
        throw new UnauthorizedException('用户不存在');
      }

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('刷新令牌无效或已过期');
    }
  }

  async validateUser(username: string, password: string) {
    // Load user with profiles so generateTokens has profile IDs
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: {
        teacherProfile: true,
        studentProfile: true,
      },
    });
    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  private async generateTokens(user: any) {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      teacherProfileId: user.teacherProfile?.id ?? null,
      studentProfileId: user.studentProfile?.id ?? null,
      isSupervisor: user.teacherProfile?.isSupervisor ?? false,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '30m',
    });
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d',
      secret: this.configService.get('JWT_REFRESH_SECRET', 'refresh-default-secret'),
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: '30m',
    };
  }

  private sanitizeUser(user: any) {
    const { passwordHash, ...result } = user;
    return result;
  }
}
