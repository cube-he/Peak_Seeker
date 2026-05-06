import { CafeteriaScraper, ScraperResult } from './cafeteria-scraper.service';
import { FacilityScorer } from './facility-scorer.service';
import { AmapClient } from '../amap/amap.client';
import { PrismaService } from '@/prisma/prisma.service';

function fakeAmap(overrides: Partial<AmapClient> = {}): AmapClient {
  return { searchPlaceText: jest.fn(), ...overrides } as unknown as AmapClient;
}

function fakePrisma(opts: {
  campusFindMany?: jest.Mock;
  facilityUpsert?: jest.Mock;
} = {}): PrismaService {
  return {
    universityCampus: {
      findMany: opts.campusFindMany ?? jest.fn().mockResolvedValue([]),
    },
    universityCampusFacility: {
      upsert: opts.facilityUpsert ?? jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
}

describe('CafeteriaScraper.scrapeOne', () => {
  it('fetches AMap, scores POIs, upserts accepted facilities', async () => {
    const searchPlaceText = jest.fn().mockResolvedValue([
      {
        id: 'P1', name: '清华大学万人食堂', typecode: '050100',
        location: '116.322425,40.006875', address: '观畴园B1层',
      },
      {
        id: 'P2', name: '街边小炒', typecode: '050100',
        location: '116.350000,40.010000',
      },
    ]);
    const amap = fakeAmap({ searchPlaceText });
    const facilityUpsert = jest.fn().mockResolvedValue({});
    const prisma = fakePrisma({
      campusFindMany: jest.fn().mockResolvedValue([
        { id: 11, latitude: 40.003213, longitude: 116.326936 },
      ]),
      facilityUpsert,
    });
    const scraper = new CafeteriaScraper(amap, prisma, new FacilityScorer());

    const result: ScraperResult = await scraper.scrapeOne({
      universityId: 1, universityName: '清华大学', city: '北京',
    });

    expect(searchPlaceText).toHaveBeenCalledWith('清华大学食堂', { city: '北京' });
    expect(facilityUpsert).toHaveBeenCalledTimes(1);
    expect(facilityUpsert.mock.calls[0][0].create).toMatchObject({
      campusId: 11, amapId: 'P1', name: '清华大学万人食堂',
      confidence: 'high', matchMethod: 'name_prefix', category: 'cafeteria',
    });
    expect(result).toEqual({ fetched: 2, accepted: 1, rejected: 1, written: 1 });
  });

  it('returns zero counts and no upserts when AMap returns empty', async () => {
    const amap = fakeAmap({ searchPlaceText: jest.fn().mockResolvedValue([]) });
    const facilityUpsert = jest.fn();
    const prisma = fakePrisma({
      campusFindMany: jest.fn().mockResolvedValue([
        { id: 11, latitude: 40.003213, longitude: 116.326936 },
      ]),
      facilityUpsert,
    });
    const scraper = new CafeteriaScraper(amap, prisma, new FacilityScorer());

    const result = await scraper.scrapeOne({
      universityId: 1, universityName: '清华大学', city: '北京',
    });

    expect(facilityUpsert).not.toHaveBeenCalled();
    expect(result).toEqual({ fetched: 0, accepted: 0, rejected: 0, written: 0 });
  });

  it('skips and returns zero when uni has no campuses with coords', async () => {
    const amap = fakeAmap({ searchPlaceText: jest.fn() });
    const facilityUpsert = jest.fn();
    const prisma = fakePrisma({
      campusFindMany: jest.fn().mockResolvedValue([]),
      facilityUpsert,
    });
    const scraper = new CafeteriaScraper(amap, prisma, new FacilityScorer());

    const result = await scraper.scrapeOne({
      universityId: 1, universityName: '清华大学', city: '北京',
    });

    expect(amap.searchPlaceText).not.toHaveBeenCalled();
    expect(facilityUpsert).not.toHaveBeenCalled();
    expect(result).toEqual({ fetched: 0, accepted: 0, rejected: 0, written: 0 });
  });

  it('propagates AmapApiError without catching', async () => {
    const { AmapApiError } = await import('../amap/amap.types');
    const searchPlaceText = jest.fn()
      .mockRejectedValue(new AmapApiError('AMap geocode failed: INVALID_USER_KEY', 'INVALID_USER_KEY'));
    const amap = fakeAmap({ searchPlaceText });
    const prisma = fakePrisma({
      campusFindMany: jest.fn().mockResolvedValue([
        { id: 11, latitude: 40.003213, longitude: 116.326936 },
      ]),
    });
    const scraper = new CafeteriaScraper(amap, prisma, new FacilityScorer());

    await expect(
      scraper.scrapeOne({ universityId: 1, universityName: '清华大学', city: '北京' }),
    ).rejects.toThrow('INVALID_USER_KEY');
  });

  it('upsert payload includes all required fields including update path', async () => {
    const searchPlaceText = jest.fn().mockResolvedValue([{
      id: 'P1', name: '清华大学万人食堂', typecode: '050100',
      location: '116.322425,40.006875', address: '观畴园B1层',
    }]);
    const amap = fakeAmap({ searchPlaceText });
    const facilityUpsert = jest.fn().mockResolvedValue({});
    const prisma = fakePrisma({
      campusFindMany: jest.fn().mockResolvedValue([
        { id: 11, latitude: 40.003213, longitude: 116.326936 },
      ]),
      facilityUpsert,
    });
    const scraper = new CafeteriaScraper(amap, prisma, new FacilityScorer());

    await scraper.scrapeOne({ universityId: 1, universityName: '清华大学', city: '北京' });

    const call = facilityUpsert.mock.calls[0][0];
    expect(call.where).toEqual({ campusId_amapId: { campusId: 11, amapId: 'P1' } });
    expect(call.update).toMatchObject({ obsolete: false });
    expect(call.update.fetchedAt).toBeInstanceOf(Date);
    expect(call.create).toMatchObject({
      campusId: 11, amapId: 'P1', category: 'cafeteria',
      name: '清华大学万人食堂', typecode: '050100',
      confidence: 'high', matchMethod: 'name_prefix', source: 'amap_text',
      address: '观畴园B1层',
    });
    expect(typeof call.create.distanceMeters).toBe('number');
    expect(typeof call.create.latitude).toBe('number');
    expect(typeof call.create.longitude).toBe('number');
  });
});
