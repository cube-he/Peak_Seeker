import { GeocodeAsPoiStrategy } from './geocode-as-poi.strategy';

describe('GeocodeAsPoiStrategy', () => {
  it('uses PlaceSearch with type 141201 (高等院校)', async () => {
    const amap = {
      searchPlaceText: jest.fn().mockResolvedValue([{
        id: 'X1', name: '哈工大威海',
        type: '科教文化服务;学校;高等院校', typecode: '141201',
        location: '122.12,37.53', address: '威海市环翠区',
        pname: '山东省', cityname: '威海市', adname: '环翠区',
      }]),
    };
    const s = new GeocodeAsPoiStrategy(amap as any);
    const r = await s.execute({ universityName: '哈尔滨工业大学', campusName: '威海校区', city: '威海' });
    expect(amap.searchPlaceText).toHaveBeenCalledWith(
      '哈尔滨工业大学威海校区',
      { city: '威海', types: '141201' },
    );
    expect(r.success).toBe(true);
    expect(r.fix?.source).toBe('amap_poi');
  });

  it('returns failure on empty POI list', async () => {
    const amap = { searchPlaceText: jest.fn().mockResolvedValue([]) };
    const s = new GeocodeAsPoiStrategy(amap as any);
    const r = await s.execute({ universityName: 'X' });
    expect(r.success).toBe(false);
  });
});
