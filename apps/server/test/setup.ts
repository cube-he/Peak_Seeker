/**
 * E2E Test Setup
 *
 * Provides test helpers for integration tests that require a running database.
 * Tests using these helpers will be automatically skipped if DATABASE_URL is
 * not set or the database is unreachable.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcrypt';

// Detect whether a test database is available
const DATABASE_URL = process.env.DATABASE_URL;
export const hasDatabase = !!DATABASE_URL;

let _prisma: PrismaClient | null = null;

/**
 * Get or create a shared PrismaClient for the test suite.
 * Returns null if DATABASE_URL is not configured.
 */
export function getTestPrisma(): PrismaClient | null {
  if (!hasDatabase) return null;

  if (!_prisma) {
    const adapter = new PrismaMariaDb(DATABASE_URL!);
    _prisma = new PrismaClient({
      adapter,
      log: ['error'],
    });
  }
  return _prisma;
}

/**
 * Disconnect the shared PrismaClient. Call in afterAll().
 */
export async function disconnectTestPrisma(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}

/**
 * Clean all user-generated data between tests.
 * Deletes in dependency order to avoid FK constraint violations.
 */
export async function cleanDatabase(prisma: PrismaClient): Promise<void> {
  // Delete in reverse-dependency order
  await prisma.volunteerPlan.deleteMany();
  await prisma.studentProfile.deleteMany();
  await prisma.teacherProfile.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Create a test user with the specified role and matching profile.
 * Returns the user record with profile included.
 */
export async function createTestUser(
  prisma: PrismaClient,
  role: 'ADMIN' | 'TEACHER' | 'STUDENT',
  overrides: {
    username?: string;
    password?: string;
    realName?: string;
    teacherProfileId?: number; // required for STUDENT to assign a teacher
  } = {},
) {
  const username = overrides.username || `test_${role.toLowerCase()}_${Date.now()}`;
  const password = overrides.password || 'Test123!';
  const passwordHash = await bcrypt.hash(password, 4); // low rounds for speed

  const profileData: Record<string, any> = {};
  if (role === 'TEACHER') {
    profileData.teacherProfile = { create: {} };
  } else if (role === 'STUDENT') {
    profileData.studentProfile = {
      create: {
        province: '四川',
        ...(overrides.teacherProfileId
          ? { teacherId: overrides.teacherProfileId }
          : {}),
      },
    };
  }

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      realName: overrides.realName || `测试${role}`,
      role,
      ...profileData,
    },
    include: {
      teacherProfile: true,
      studentProfile: true,
    },
  });

  return { ...user, _plainPassword: password };
}
