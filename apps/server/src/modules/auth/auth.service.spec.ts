import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  const userService = {
    findByUsername: jest.fn(),
    findByPhone: jest.fn(),
    updateLastLogin: jest.fn(),
  };
  const prisma = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const jwtService = {
    sign: jest.fn(() => 'signed-token'),
    verify: jest.fn(),
    decode: jest.fn(),
  } as unknown as JwtService;
  const configService = {
    get: jest.fn((_key: string, fallback?: string) => fallback),
  } as unknown as ConfigService;
  const redisService = {
    addToBlacklist: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      userService as any,
      prisma as any,
      jwtService,
      configService,
      redisService as any,
    );
  });

  it('always creates a STUDENT profile for public registration even when role is provided', async () => {
    userService.findByUsername.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }) => ({
      id: 1,
      username: data.username,
      role: data.role,
      studentProfile: data.studentProfile ? { id: 10 } : null,
      teacherProfile: data.teacherProfile ? { id: 20 } : null,
      passwordHash: data.passwordHash,
    }));

    const result = await service.register({
      username: 'public-user',
      password: 'Test123!',
      role: 'ADMIN',
    } as any);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: Role.STUDENT,
          studentProfile: { create: { province: '四川' } },
        }),
      }),
    );
    expect(result.user.role).toBe(Role.STUDENT);
    expect(result.user.studentProfile).toEqual({ id: 10 });
    expect(result.user.teacherProfile).toBeNull();
  });
});
