import { PickHighestScoreStrategy } from './pick-highest-score.strategy';
import { GeoResult } from '../dto/geo-result.dto';

const geo = (city: string, lat: number, lng: number): GeoResult => ({
  address: city, province: '', city, district: null,
  latitude: lat, longitude: lng,
  source: 'amap_geocode', formattedAddress: city,
});

describe('PickHighestScoreStrategy', () => {
  it('picks the highest-score candidate', async () => {
    const s = new PickHighestScoreStrategy();
    const r = await s.execute({
      universityName: 'X',
      previousCandidates: [
        { score: 0.5, geo: geo('A', 30, 100) },
        { score: 0.9, geo: geo('B', 31, 101) },
        { score: 0.7, geo: geo('C', 32, 102) },
      ],
    });
    expect(r.success).toBe(true);
    expect(r.fix?.city).toBe('B');
  });

  it('returns failure when no candidates supplied', async () => {
    const s = new PickHighestScoreStrategy();
    const r = await s.execute({ universityName: 'X' });
    expect(r.success).toBe(false);
  });
});
