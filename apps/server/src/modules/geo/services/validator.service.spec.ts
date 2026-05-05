import { GeoValidator } from './validator.service';

const fakePrisma = () => ({
  university: { findMany: jest.fn().mockResolvedValue([]) },
  universityCampus: { findMany: jest.fn().mockResolvedValue([]) },
});
const fakeAmap = () => ({ regeocode: jest.fn() });

// Use 'in' check so explicitly-passed undefined/null is preserved (not overridden by ??)
const sample = (over: Partial<{ lat: number; lng: number; address: string }> = {}) => ({
  id: 1,
  name: '清华大学',
  province: '北京市',
  city: '北京市',
  address: ('address' in over ? over.address : '北京市海淀区清华大学') as string | null | undefined,
  latitude: ('lat' in over ? over.lat : 40.0) as number | null | undefined,
  longitude: ('lng' in over ? over.lng : 116.33) as number | null | undefined,
  campuses: [],
});

describe('GeoValidator basic checks', () => {
  it('flags missing when address is null', async () => {
    const v = new GeoValidator(fakePrisma() as any, fakeAmap() as any);
    const r = await v.validate(sample({ address: undefined as any, lat: undefined as any, lng: undefined as any }));
    expect(r.pass).toBe(false);
    expect(r.issues.map((i) => i.issueType)).toContain('missing');
  });

  it('flags out_of_china when lng/lat are outside China bbox', async () => {
    const v = new GeoValidator(fakePrisma() as any, fakeAmap() as any);
    const r = await v.validate(sample({ lat: 50.0, lng: 30.0 })); // Russia
    expect(r.issues.map((i) => i.issueType)).toContain('out_of_china');
  });

  it('passes when coordinates are inside China and address is present', async () => {
    const prisma = fakePrisma();
    const amap = { regeocode: jest.fn().mockResolvedValue(null) };
    const v = new GeoValidator(prisma as any, amap as any);
    const r = await v.validate(sample());
    expect(r.pass).toBe(true);
  });
});

describe('GeoValidator.checkProvinceMatch', () => {
  it('flags province_mismatch when regeocoded province ≠ University.province', async () => {
    const amap = { regeocode: jest.fn().mockResolvedValue({
      formatted_address: '',
      addressComponent: { province: '江苏省', city: '南京市', district: '玄武区' },
    }) };
    const v = new GeoValidator(fakePrisma() as any, amap as any);
    const r = await v.validate({
      id: 1, name: 'X', province: '四川省', city: '成都市',
      address: 'A', latitude: 32, longitude: 118, campuses: [],
    });
    const types = r.issues.map((i) => i.issueType);
    expect(types).toContain('province_mismatch');
  });

  it('does not flag when provinces match', async () => {
    const amap = { regeocode: jest.fn().mockResolvedValue({
      formatted_address: '',
      addressComponent: { province: '四川省', city: '成都市', district: '武侯区' },
    }) };
    const v = new GeoValidator(fakePrisma() as any, amap as any);
    const r = await v.validate({
      id: 1, name: 'X', province: '四川省', city: '成都市',
      address: 'A', latitude: 30.5, longitude: 104.0, campuses: [],
    });
    const types = r.issues.map((i) => i.issueType);
    expect(types).not.toContain('province_mismatch');
  });
});

describe('GeoValidator.checkDuplicateCoord', () => {
  it('flags duplicate when another university shares coordinates within 50m', async () => {
    const prisma: any = {
      university: {
        findMany: jest.fn().mockResolvedValue([
          { id: 99, name: 'Other', latitude: 30.5, longitude: 104.0 },
        ]),
      },
      universityCampus: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const amap = { regeocode: jest.fn().mockResolvedValue(null) };
    const v = new GeoValidator(prisma, amap as any);
    const r = await v.validate({
      id: 1, name: 'Self', province: undefined, city: undefined,
      address: 'A', latitude: 30.5, longitude: 104.0, campuses: [],
    });
    expect(r.issues.map((i) => i.issueType)).toContain('duplicate_coord');
  });

  it('ignores the university itself when checking duplicates', async () => {
    const prisma: any = {
      university: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, name: 'Self', latitude: 30.5, longitude: 104.0 },
        ]),
      },
      universityCampus: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const amap = { regeocode: jest.fn().mockResolvedValue(null) };
    const v = new GeoValidator(prisma, amap as any);
    const r = await v.validate({
      id: 1, name: 'Self', address: 'A',
      latitude: 30.5, longitude: 104.0, campuses: [],
    });
    expect(r.issues.map((i) => i.issueType)).not.toContain('duplicate_coord');
  });
});

describe('GeoValidator.checkCampusDistance', () => {
  it('flags anomaly when same-city main and branch are > 800km apart', () => {
    const v = new GeoValidator(fakePrisma() as any, { regeocode: jest.fn().mockResolvedValue(null) } as any);
    return v.validate({
      id: 1, name: 'X',
      address: 'A', latitude: 39.9, longitude: 116.4,   // Beijing
      city: '北京市',
      campuses: [
        { id: 10, name: '本部', isMain: true, city: '北京市', latitude: 39.9, longitude: 116.4 },
        { id: 11, name: '分校', isMain: false, city: '北京市', latitude: 22.59, longitude: 113.97 }, // Shenzhen
      ],
    }).then((r) => {
      expect(r.issues.map((i) => i.issueType)).toContain('campus_distance_anomaly');
    });
  });

  it('does not flag when same-city campuses are within tolerance', () => {
    const v = new GeoValidator(fakePrisma() as any, { regeocode: jest.fn().mockResolvedValue(null) } as any);
    return v.validate({
      id: 1, name: 'X',
      address: 'A', latitude: 39.9, longitude: 116.4,
      city: '北京市',
      campuses: [
        { id: 10, name: '东', isMain: true, city: '北京市', latitude: 39.9, longitude: 116.4 },
        { id: 11, name: '西', isMain: false, city: '北京市', latitude: 39.95, longitude: 116.30 },
      ],
    }).then((r) => {
      expect(r.issues.map((i) => i.issueType)).not.toContain('campus_distance_anomaly');
    });
  });
});
