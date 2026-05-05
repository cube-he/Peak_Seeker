/**
 * Student Management Integration Tests
 *
 * Tests teacher creating students, listing own students, and optimistic locking.
 * Requires a running MySQL database; skipped automatically if unavailable.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  hasDatabase,
  getTestPrisma,
  cleanDatabase,
  createTestUser,
  disconnectTestPrisma,
} from './setup';

const describeIfDb = hasDatabase ? describe : describe.skip;

describeIfDb('Student Management (e2e)', () => {
  let app: INestApplication;
  const prisma = getTestPrisma()!;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await disconnectTestPrisma();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  /** Helper: register a teacher and return their access token */
  async function loginAsTeacher(): Promise<{ token: string; teacherProfileId: number }> {
    const username = `teacher_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ username, password: 'Test123!', role: 'TEACHER' });
    return {
      token: res.body.accessToken,
      teacherProfileId: res.body.user.teacherProfile.id,
    };
  }

  describe('POST /api/v1/students', () => {
    it('should allow a teacher to create a student', async () => {
      const { token } = await loginAsTeacher();
      const studentUsername = `student_${Date.now()}`;

      const res = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          username: studentUsername,
          password: 'Student123!',
          realName: '测试学生',
          highSchool: '成都七中',
          examYear: 2026,
        })
        .expect(201);

      expect(res.body.username).toBe(studentUsername);
      expect(res.body.role).toBe('STUDENT');
      expect(res.body.studentProfile).toBeDefined();
      expect(res.body.studentProfile.highSchool).toBe('成都七中');
    });
  });

  describe('GET /api/v1/students', () => {
    it('should list only the teacher own students', async () => {
      const teacher1 = await loginAsTeacher();
      const teacher2 = await loginAsTeacher();

      // Teacher 1 creates a student
      await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${teacher1.token}`)
        .send({
          username: `s1_${Date.now()}`,
          password: 'Student123!',
          realName: '学生A',
        });

      // Teacher 2 creates a student
      await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${teacher2.token}`)
        .send({
          username: `s2_${Date.now()}`,
          password: 'Student123!',
          realName: '学生B',
        });

      // Teacher 1 should only see their own student
      const res = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${teacher1.token}`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.data[0].user.realName).toBe('学生A');
    });
  });

  describe('PUT /api/v1/students/:id/profile', () => {
    it('should update student profile with correct version', async () => {
      const { token } = await loginAsTeacher();

      // Create student
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          username: `s_${Date.now()}`,
          password: 'Student123!',
          realName: '更新测试',
        });

      const studentProfileId = createRes.body.studentProfile.id;

      // Update with correct version (initial version is 0)
      const updateRes = await request(app.getHttpServer())
        .put(`/api/v1/students/${studentProfileId}/profile`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          dataVersion: 0,
          highSchool: '成都四中',
          city: '成都',
        })
        .expect(200);

      expect(updateRes.body.highSchool).toBe('成都四中');
    });

    it('should return 409 on version conflict', async () => {
      const { token } = await loginAsTeacher();

      // Create student
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          username: `s_${Date.now()}`,
          password: 'Student123!',
          realName: '冲突测试',
        });

      const studentProfileId = createRes.body.studentProfile.id;

      // First update succeeds (version 0)
      await request(app.getHttpServer())
        .put(`/api/v1/students/${studentProfileId}/profile`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dataVersion: 0, city: '成都' })
        .expect(200);

      // Second update with stale version should fail
      await request(app.getHttpServer())
        .put(`/api/v1/students/${studentProfileId}/profile`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dataVersion: 0, city: '绵阳' })
        .expect(409);
    });
  });
});
