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
      towncode?: string | string[];   // observed in real responses (2026-05-05)
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
  // NOTE: AMap returns `[]` (empty array) for any missing string field instead
  // of `null` / omitted. So most string-typed fields below are `string | string[]`.
  address: string | string[];
  distance?: string | unknown[];     // [] when no distance context (PlaceSearch text)
  pname?: string | string[];         // province name
  cityname?: string | string[];
  adname?: string | string[];        // district
  business_area?: string | string[]; // 商圈名,如"五道口"
  tag?: string | string[];
  // For around search results, AMap may include richer fields under `biz_ext`.
  biz_ext?: Record<string, unknown> | unknown[];
  // Observed in real responses (smoke 2026-05-05); not used directly but kept
  // so consumers of the raw response have correct types.
  keytag?: string | string[];        // e.g. "985大学" / "商场" / "机场"
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
