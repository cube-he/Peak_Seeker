import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import nock from 'nock';

const AMAP = 'https://restapi.amap.com';

function geocodeReply(province: string, city: string, district: string, location: string) {
  return {
    status: '1', info: 'OK', count: '1',
    geocodes: [{
      formatted_address: `${province}${city}${district}`,
      province, city, district, location, level: '兴趣点',
    }],
  };
}

function regeocodeReply(province: string, city: string, district: string) {
  return {
    status: '1', info: 'OK',
    regeocode: { formatted_address: '', addressComponent: { province, city, district } },
  };
}

function aroundReply(pois: Array<{ id: string; name: string; typecode: string; location: string; distance: number }>) {
  return {
    status: '1', info: 'OK',
    pois: pois.map((p) => ({
      ...p, type: 'X', address: '', distance: String(p.distance),
    })),
  };
}

describe('geo backfill integration (5 校)', () => {
  let app: any;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.AMAP_SERVICE_KEY = 'test-key';
    process.env.AMAP_RATE_LIMIT_QPS = '100';
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
    await app.close();
  });

  beforeEach(async () => {
    nock.disableNetConnect();
    await prisma.universityCampusPoi.deleteMany({ where: { campus: { university: { name: { startsWith: 'TEST_' } } } } });
    await prisma.universityCampus.deleteMany({ where: { university: { name: { startsWith: 'TEST_' } } } });
    await prisma.universityGeoIssue.deleteMany({ where: { university: { name: { startsWith: 'TEST_' } } } });
    await prisma.university.deleteMany({ where: { name: { startsWith: 'TEST_' } } });
  });

  it('verifies 5 universities end-to-end', async () => {
    const uni1 = await prisma.university.create({ data: {
      name: 'TEST_清华大学', province: '北京市', city: '北京市',
      address: '北京市海淀区清华园',
    }});
    const uni2 = await prisma.university.create({ data: {
      name: 'TEST_哈尔滨工业大学', province: '黑龙江省', city: '哈尔滨市',
      address: '哈尔滨市南岗区',
    }});
    const uni3 = await prisma.university.create({ data: {
      name: 'TEST_电子科技大学', province: '四川省', city: '成都市',
      address: '成都市成华区',
    }});
    const uni4 = await prisma.university.create({ data: {
      name: 'TEST_西南交通大学', province: '四川省', city: '成都市',
      address: '成都市金牛区',
    }});
    const uni5 = await prisma.university.create({ data: {
      name: 'TEST_某民办学院', province: '广东省', city: '广州市',
      address: '广州市番禺区',
    }});

    const scope = nock(AMAP).persist();
    scope.get('/v3/geocode/geo').query(true).reply(200, function (uri) {
      const u = new URL(`${AMAP}${uri}`);
      const addr = u.searchParams.get('address') ?? '';
      if (addr.includes('清华')) return geocodeReply('北京市','北京市','海淀区','116.331,40.000');
      if (addr.includes('哈尔滨工业大学')) return geocodeReply('黑龙江省','哈尔滨市','南岗区','126.66,45.78');
      if (addr.includes('电子科技大学')) return geocodeReply('四川省','成都市','成华区','104.143,30.756');
      if (addr.includes('西南交通大学')) return geocodeReply('四川省','成都市','金牛区','104.075,30.700');
      if (addr.includes('某民办学院')) return geocodeReply('广东省','广州市','番禺区','113.39,23.00');
      return { status: '1', info: 'OK', count: '0', geocodes: [] };
    });
    scope.get('/v3/geocode/regeo').query(true).reply(200, function (uri) {
      const u = new URL(`${AMAP}${uri}`);
      const loc = u.searchParams.get('location') ?? '';
      if (loc.startsWith('116')) return regeocodeReply('北京市','北京市','海淀区');
      if (loc.startsWith('126')) return regeocodeReply('黑龙江省','哈尔滨市','南岗区');
      if (loc.startsWith('104.143')) return regeocodeReply('四川省','成都市','成华区');
      if (loc.startsWith('104.075')) return regeocodeReply('四川省','成都市','金牛区');
      if (loc.startsWith('113.39')) return regeocodeReply('广东省','广州市','番禺区');
      return { status: '1', info: 'OK' };
    });
    scope.get('/v3/place/around').query(true).reply(200, function () {
      return aroundReply([
        { id: 'POI_SUBWAY_1', name: '附近地铁站', typecode: '150500', location: '116.330,39.999', distance: 380 },
      ]);
    });

    const { GeocoderService } = await import('../src/modules/geo/services/geocoder.service');
    const { CampusExtractor } = await import('../src/modules/geo/services/campus-extractor.service');
    const { GeoValidator } = await import('../src/modules/geo/services/validator.service');
    const { AmapClient } = await import('../src/modules/geo/amap/amap.client');
    const geocoder = app.get(GeocoderService);
    const extractor = app.get(CampusExtractor);
    const validator = app.get(GeoValidator);
    const amap = app.get(AmapClient);

    for (const uni of [uni1, uni2, uni3, uni4, uni5]) {
      const main = await geocoder.geocode(uni.address!, { city: uni.city! });
      const candidates = await extractor.extract(uni.id);
      await prisma.university.update({ where: { id: uni.id }, data: {
        latitude: main!.latitude as any, longitude: main!.longitude as any,
        geoStatus: 'verified', geoSource: main!.source, geoUpdatedAt: new Date(),
      }});
      const camp = await prisma.universityCampus.create({ data: {
        universityId: uni.id, name: '本部', isMain: true,
        province: main!.province, city: main!.city, district: main!.district,
        latitude: main!.latitude as any, longitude: main!.longitude as any,
        geoStatus: 'verified', geoSource: main!.source, discoveredFrom: 'amap_search',
        geoUpdatedAt: new Date(),
      }});
      const pois = await amap.searchPlaceAround(main!.longitude, main!.latitude, {
        types: '150500', radius: 2000,
      });
      for (const p of pois) {
        await prisma.universityCampusPoi.create({ data: {
          campusId: camp.id, amapId: p.id, name: p.name, category: 'subway',
          typecode: p.typecode, latitude: 0 as any, longitude: 0 as any,
          distance: Number(p.distance ?? 0), fetchedAt: new Date(),
        }});
      }
      const report = await validator.validate({
        id: uni.id, name: uni.name,
        province: uni.province, city: uni.city,
        address: uni.address ?? main!.address,
        latitude: main!.latitude, longitude: main!.longitude,
        campuses: [],
      });
      expect(report.pass).toBe(true);
    }

    const verified = await prisma.university.count({
      where: { name: { startsWith: 'TEST_' }, geoStatus: 'verified' },
    });
    expect(verified).toBe(5);
  });
});
