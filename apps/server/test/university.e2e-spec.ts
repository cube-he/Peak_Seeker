/**
 * University POI route (e2e)
 *
 * Verifies that GET /api/v1/universities/:uniId/campuses/:campusId/pois is wired:
 * - Validates ?category= against the enum (rejects invalid / missing)
 * - Validates ?limit= as integer in range
 * - On valid query, dispatches to UniversityService.getCampusPois with parsed args
 *
 * Mocks the service so this test does not require DB rows. Still gated on
 * `hasDatabase` because AppModule init (Prisma client construction) needs
 * the env to be set, matching project convention.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { UniversityService } from '../src/modules/university/university.service';
import { AmapClient } from '../src/modules/geo/amap/amap.client';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { hasDatabase } from './setup';

const describeIfDb = hasDatabase ? describe : describe.skip;

describeIfDb('University POI route (e2e)', () => {
  let app: INestApplication;
  let mockGetCampusPois: jest.Mock;

  beforeAll(async () => {
    mockGetCampusPois = jest.fn();
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Stub infrastructure providers that require live external services
      // (DB, Redis, AMap) so AppModule bootstraps without credentials.
      .overrideProvider(PrismaService)
      // Proxy-based stub: any property access (prisma.user, prisma.timelineEvent, etc.)
      // returns an object with jest.fn() for every method, so onModuleInit hooks
      // in other modules (e.g. TimelineModule) don't throw at startup.
      .useValue(
        new Proxy(
          { $connect: jest.fn(), $disconnect: jest.fn() },
          {
            get(target, prop) {
              if (prop in target) return target[prop as keyof typeof target];
              return new Proxy(
                {},
                { get: () => jest.fn().mockResolvedValue(undefined) },
              );
            },
          },
        ),
      )
      .overrideProvider(RedisService)
      .useValue({
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        getClient: jest.fn(),
      })
      .overrideProvider(AmapClient)
      .useValue({})
      .overrideProvider(UniversityService)
      .useValue({
        getCampusPois: mockGetCampusPois,
        // Other UniversityService methods that AppModule wiring may exercise
        // indirectly (e.g. via interceptors). Stubs are fine; this test
        // only hits the POI endpoint.
        findAll: jest.fn(),
        findById: jest.fn(),
        getHotUniversities: jest.fn(),
        getFilters: jest.fn(),
        findMajors: jest.fn(),
        findAdmissions: jest.fn(),
      })
      .compile();
    app = moduleRef.createNestApplication();
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
    await app.close();
  });

  beforeEach(() => {
    mockGetCampusPois.mockReset();
  });

  it('returns POI list for valid query', async () => {
    mockGetCampusPois.mockResolvedValue([
      { id: 1, amapId: 'A', name: '西大直街', category: 'subway', distance: 380, metadata: null },
    ]);
    const res = await request(app.getHttpServer())
      .get('/api/v1/universities/1/campuses/10/pois?category=subway&limit=5')
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('西大直街');
    expect(mockGetCampusPois).toHaveBeenCalledWith(1, 10, { category: 'subway', limit: 5 });
  });

  it('coerces limit string to number via implicit conversion', async () => {
    mockGetCampusPois.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/api/v1/universities/1/campuses/10/pois?category=subway&limit=10')
      .expect(200);
    const callArg = mockGetCampusPois.mock.calls[0][2];
    expect(typeof callArg.limit).toBe('number');
    expect(callArg.limit).toBe(10);
  });

  it('rejects invalid category with 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/universities/1/campuses/10/pois?category=invalid')
      .expect(400);
    expect(mockGetCampusPois).not.toHaveBeenCalled();
  });

  it('rejects missing category with 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/universities/1/campuses/10/pois')
      .expect(400);
    expect(mockGetCampusPois).not.toHaveBeenCalled();
  });

  it('rejects non-integer uniId / campusId with 400 (ParseIntPipe)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/universities/abc/campuses/10/pois?category=subway')
      .expect(400);
    expect(mockGetCampusPois).not.toHaveBeenCalled();
  });
});
