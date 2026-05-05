// Raw AMap response shapes (only fields we use).

export interface AmapGeocodeResponse {
  status: '0' | '1';
  info: string;
  count?: string;
  geocodes?: AmapGeocode[];
}

export interface AmapGeocode {
  formatted_address: string;
  province: string;
  city: string | string[];     // AMap returns [] when empty
  district: string | string[];
  location: string;            // "lng,lat"
  level?: string;
}

export interface AmapRegeocodeResponse {
  status: '0' | '1';
  info: string;
  regeocode?: {
    formatted_address: string;
    addressComponent: {
      province: string | string[];
      city: string | string[];
      district: string | string[];
    };
  };
}

export interface AmapPlaceSearchResponse {
  status: '0' | '1';
  info: string;
  count?: string;
  pois?: AmapPoi[];
}

export interface AmapPoi {
  id: string;                  // amapId
  name: string;
  type: string;
  typecode: string;
  location: string;            // "lng,lat"
  address: string | string[];
  distance?: string;           // present in around search
  pname?: string;              // province name
  cityname?: string;
  adname?: string;             // district
  // arbitrary metadata (e.g. line names for subways)
  business_area?: string;
  tag?: string;
  // for around search results, AMap may include richer fields under `biz_ext`
  biz_ext?: Record<string, unknown>;
}

export interface AmapDistrictResponse {
  status: '0' | '1';
  info: string;
  districts?: Array<{
    name: string;
    level: string;
    center: string;
  }>;
}

/** Custom error thrown when AMap is unreachable after retries. */
export class AmapUnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AmapUnavailableError';
  }
}

/** Thrown when AMap returns status='0' with a known error code we cannot recover from. */
export class AmapApiError extends Error {
  constructor(message: string, public readonly info: string) {
    super(message);
    this.name = 'AmapApiError';
  }
}
