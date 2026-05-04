/**
 * Admission Aggregated Endpoint — predictedMinRank Field
 *
 * Verifies that GET /admissions/aggregated returns a `predictedMinRank` field
 * (either null or a populated PredictedMinRank shape) on each item.
 *
 * Skipped if DATABASE_URL is not set.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { hasDatabase, disconnectTestPrisma } from './setup';

const describeIfDb = hasDatabase ? describe : describe.skip;

describeIfDb('GET /admissions/aggregated — predictedMinRank field (e2e)', () => {
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

  it('returns predictedMinRank field (null or shape) on each item', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admissions/aggregated')
      .query({ province: '四川', score: 600, range: 20, pageSize: 5 })
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    for (const item of res.body.data) {
      expect(item).toHaveProperty('predictedMinRank');
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

  it('at least one item in a populated query has non-null predictedMinRank', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admissions/aggregated')
      .query({ province: '四川', score: 550, range: 50, pageSize: 50 })
      .expect(200);

    const items = res.body.data || [];
    if (items.length === 0) {
      // No items in this score window — can't assert anything
      console.warn('[admission e2e] No items returned for province=四川 score=550 range=50; skipping non-null assertion');
      return;
    }
    const nonNull = items.filter((i: any) => i.predictedMinRank !== null);
    // At least one item should have a prediction. If 0, ETL didn't run or no overlap with score window.
    expect(nonNull.length).toBeGreaterThan(0);
  });
});
