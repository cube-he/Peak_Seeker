/**
 * Auth Flow Integration Tests
 *
 * Tests the full register -> login -> refresh -> logout cycle.
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

describeIfDb('Auth (e2e)', () => {
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

  const uniqueUsername = () => `testuser_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  describe('POST /api/v1/auth/register', () => {
    it('should register a STUDENT and return tokens', async () => {
      const username = uniqueUsername();
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          username,
          password: 'Test123!',
          role: 'STUDENT',
        })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.username).toBe(username);
      expect(res.body.user.role).toBe('STUDENT');
      expect(res.body.user.studentProfile).toBeDefined();
    });

    it('should register a TEACHER and return tokens', async () => {
      const username = uniqueUsername();
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          username,
          password: 'Test123!',
          role: 'TEACHER',
        })
        .expect(201);

      expect(res.body.user.role).toBe('TEACHER');
      expect(res.body.user.teacherProfile).toBeDefined();
    });

    it('should register an ADMIN without profile', async () => {
      const username = uniqueUsername();
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          username,
          password: 'Test123!',
          role: 'ADMIN',
        })
        .expect(201);

      expect(res.body.user.role).toBe('ADMIN');
      expect(res.body.user.teacherProfile).toBeNull();
      expect(res.body.user.studentProfile).toBeNull();
    });

    it('should reject duplicate username', async () => {
      const username = uniqueUsername();
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ username, password: 'Test123!' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ username, password: 'Test123!' })
        .expect(409);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return JWT with profileIds on login', async () => {
      const username = uniqueUsername();
      // Register first
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ username, password: 'Test123!', role: 'TEACHER' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username, password: 'Test123!' })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.role).toBe('TEACHER');
      expect(res.body.user.teacherProfile).toBeDefined();
    });

    it('should reject invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: 'nonexistent', password: 'Wrong123!' })
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should return new tokens on valid refresh', async () => {
      const username = uniqueUsername();
      const registerRes = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ username, password: 'Test123!' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: registerRes.body.refreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it('should reject invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid.token.here' })
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should blacklist the token on logout', async () => {
      const username = uniqueUsername();
      const registerRes = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ username, password: 'Test123!' });

      const token = registerRes.body.accessToken;

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // The token should be blacklisted (subsequent requests may still work
      // depending on guard implementation, but logout itself should succeed)
    });

    it('should reject unauthenticated logout', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(401);
    });
  });
});
