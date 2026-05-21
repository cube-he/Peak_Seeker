/**
 * Admission Aggregated Endpoints (e2e)
 *
 * Verifies GET /admissions/aggregated returns lightweight items with a
 * `predictedMinRank` field, and GET /admissions/aggregated/detail returns the
 * full per-year payload for one combination.
 *
 * Skipped if DATABASE_URL is not set.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hasDatabase, disconnectTestPrisma } from './setup';

const describeIfDb = hasDatabase ? describe : describe.skip;

describeIfDb('Admission aggregated endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrisma();
  });

  it('GET /admissions/aggregated returns lightweight items with predictedMinRank', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admissions/aggregated')
      .query({ province: '四川', rank: 12000, subjects: '物理', range: 30000 })
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(res.body.pagination).toBeUndefined();

    for (const item of res.body.data) {
      // lightweight: per-year payload must not be present
      expect(item.yearlyData).toBeUndefined();
      expect(item.currentPlan).toBeUndefined();
      expect(item.supplementary).toBeUndefined();
      expect(item).toHaveProperty('predictedMinRank');
      expect(item.subjects).toBe('物理');
      const p = item.predictedMinRank;
      if (p !== null) {
        expect(typeof p.point).toBe('number');
        expect(typeof p.conservative).toBe('number');
        expect(typeof p.optimistic).toBe('number');
        expect(Array.isArray(p.basisYears)).toBe(true);
        expect(['high', 'medium', 'low']).toContain(p.confidence);
        expect(typeof p.targetYear).toBe('number');
      }
    }
  });

  it('GET /admissions/aggregated/detail returns full yearly data for one combination', async () => {
    // First fetch a real combination from the aggregated list.
    const list = await request(app.getHttpServer())
      .get('/api/v1/admissions/aggregated')
      .query({ province: '四川', rank: 12000, subjects: '物理', range: 30000 })
      .expect(200);

    const items = list.body.data || [];
    if (items.length === 0) {
      console.warn('[admission e2e] No items for province=四川 rank=12000; skipping detail assertion');
      return;
    }
    const sample = items[0];

    const res = await request(app.getHttpServer())
      .get('/api/v1/admissions/aggregated/detail')
      .query({
        universityId: sample.university.id,
        majorCode: sample.majorCode,
        groupCode: sample.groupCode,
        batch: sample.batch,
        recruitType: sample.recruitType,
        province: '四川',
        subjects: '物理',
      })
      .expect(200);

    expect(Array.isArray(res.body.yearlyData)).toBe(true);
    expect(res.body).toHaveProperty('currentPlan');
    expect(res.body).toHaveProperty('supplementary');
    for (const y of res.body.yearlyData) {
      expect(typeof y.year).toBe('number');
      expect(y).toHaveProperty('majorMinRank');
      expect(y).toHaveProperty('groupMinRank');
    }
  });

  it('GET /admissions/aggregated/detail rejects a missing subjects param', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admissions/aggregated/detail')
      .query({
        universityId: 1,
        majorCode: '080902',
        groupCode: '01',
        batch: '本科一批',
        recruitType: '普通类',
        province: '四川',
      })
      .expect(400);
  });
});
