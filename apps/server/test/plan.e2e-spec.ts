/**
 * Plan Lifecycle Integration Tests
 *
 * Tests creating, updating, and exporting volunteer plans.
 * Requires a running MySQL database; skipped automatically if unavailable.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  hasDatabase,
  getTestPrisma,
  cleanDatabase,
  disconnectTestPrisma,
} from './setup';

const describeIfDb = hasDatabase ? describe : describe.skip;

describeIfDb('Plan Lifecycle (e2e)', () => {
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

  /** Helper: register a student user and return token */
  async function loginAsStudent(): Promise<{ token: string; userId: number }> {
    const username = `student_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ username, password: 'Test123!', role: 'STUDENT' });
    return {
      token: res.body.accessToken,
      userId: res.body.user.id,
    };
  }

  describe('POST /api/v1/plans', () => {
    it('should create a plan for the authenticated student', async () => {
      const { token } = await loginAsStudent();

      const res = await request(app.getHttpServer())
        .post('/api/v1/plans')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: '我的第一个方案',
          year: 2026,
          province: '四川',
          items: [
            { universityName: '四川大学', majorName: '计算机科学' },
          ],
        })
        .expect(201);

      expect(res.body.name).toBe('我的第一个方案');
      expect(res.body.year).toBe(2026);
    });
  });

  describe('GET /api/v1/plans', () => {
    it('should list plans for the authenticated user', async () => {
      const { token } = await loginAsStudent();

      // Create two plans
      await request(app.getHttpServer())
        .post('/api/v1/plans')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '方案A', year: 2026, items: [] });

      await request(app.getHttpServer())
        .post('/api/v1/plans')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '方案B', year: 2026, items: [] });

      const res = await request(app.getHttpServer())
        .get('/api/v1/plans')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.length).toBe(2);
    });
  });

  describe('PUT /api/v1/plans/:id', () => {
    it('should update plan status from DRAFT to SUBMITTED', async () => {
      const { token } = await loginAsStudent();

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/plans')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '状态测试', year: 2026, items: [] });

      const planId = createRes.body.id;

      const updateRes = await request(app.getHttpServer())
        .put(`/api/v1/plans/${planId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'SUBMITTED' })
        .expect(200);

      expect(updateRes.body.status).toBe('SUBMITTED');
    });

    it('should update plan name and notes', async () => {
      const { token } = await loginAsStudent();

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/plans')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '旧名称', year: 2026, items: [] });

      const planId = createRes.body.id;

      const updateRes = await request(app.getHttpServer())
        .put(`/api/v1/plans/${planId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '新名称', notes: '备注信息' })
        .expect(200);

      expect(updateRes.body.name).toBe('新名称');
      expect(updateRes.body.notes).toBe('备注信息');
    });
  });

  describe('DELETE /api/v1/plans/:id', () => {
    it('should delete the plan', async () => {
      const { token } = await loginAsStudent();

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/plans')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '待删除', year: 2026, items: [] });

      const planId = createRes.body.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/plans/${planId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Should no longer exist
      await request(app.getHttpServer())
        .get(`/api/v1/plans/${planId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('POST /api/v1/plans/:id/favorite', () => {
    it('should toggle favorite status', async () => {
      const { token } = await loginAsStudent();

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/plans')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '收藏测试', year: 2026, items: [] });

      const planId = createRes.body.id;

      // Toggle on
      const favRes = await request(app.getHttpServer())
        .post(`/api/v1/plans/${planId}/favorite`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(favRes.body.isFavorite).toBe(true);

      // Toggle off
      const unfavRes = await request(app.getHttpServer())
        .post(`/api/v1/plans/${planId}/favorite`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(unfavRes.body.isFavorite).toBe(false);
    });
  });
});
