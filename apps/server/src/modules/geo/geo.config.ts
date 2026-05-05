export const GEO_CONFIG = {
  // China bounding box (rough, used by validator)
  CHINA_LNG_MIN: 73,
  CHINA_LNG_MAX: 136,
  CHINA_LAT_MIN: 3,
  CHINA_LAT_MAX: 54,

  // Distance thresholds
  DUPLICATE_COORD_METERS: 50,            // < 50m considered the same point
  CAMPUS_DISTANCE_ANOMALY_KM: 800,       // main vs branch > 800km AND same city
  CAMPUS_DISTANCE_TOLERANCE_KM: 50,      // tolerance when comparing intra-city

  // POI typecodes (高德官方编码)
  POI_TYPECODE_SUBWAY: '150500',
  POI_TYPECODE_MALL: '060100',
  POI_TYPECODE_AIRPORT: '150104',

  // POI search radii (meters)
  POI_RADIUS_SUBWAY: 2000,
  POI_RADIUS_MALL: 3000,
  POI_RADIUS_AIRPORT: 50000,

  // POI per-category limit when persisting
  POI_TOP_N: 10,

  // AMap client tunables
  AMAP_DEFAULT_TIMEOUT_MS: 8000,
  AMAP_MAX_RETRIES: 5,                   // 1+2+4+8+16=31s worst-case (handles CUQPS bursts)
  AMAP_RETRY_BASE_DELAY_MS: 1000,
  AMAP_QPS: 10,
  AMAP_CACHE_TTL_SECONDS: 24 * 60 * 60,  // 24h

  // Retry chain max attempts
  RETRY_CHAIN_MAX_ATTEMPTS: 3,
} as const;

export type IssueType =
  | 'missing'
  | 'geocode_no_result'
  | 'out_of_china'
  | 'province_mismatch'
  | 'duplicate_coord'
  | 'campus_distance_anomaly'
  | 'address_ambiguous'
  | 'poi_zero_subway'
  | 'poi_fetch_failed';

export type GeoStatus = 'pending' | 'verified' | 'invalid' | 'missing';

export type GeoSource =
  | 'amap_geocode'
  | 'amap_poi'
  | 'charter_llm'
  | 'manual';

export type IssueStatus =
  | 'pending'
  | 'retrying'
  | 'resolved'
  | 'manual_required';
