export type CampusDiscoverySource =
  | 'enrollment_plan_tag'
  | 'charter_extract'
  | 'amap_search'
  | 'manual';

export interface CampusCandidate {
  /** Normalized campus name, e.g. "本部" / "威海校区" / "深圳校区". */
  name: string;
  source: CampusDiscoverySource;
  /** Optional hint to assist downstream geocoding. */
  hint?: {
    province?: string;
    city?: string;
  };
}
