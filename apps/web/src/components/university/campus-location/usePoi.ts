'use client';

import { useQuery } from '@tanstack/react-query';
import { universityService } from '@/services/university';
import type { Poi, PoiCategory } from './types';

interface UsePoiArgs {
  universityId: number;
  campusId: number | null;
  category: PoiCategory;
  limit?: number;
}

const DEFAULT_LIMIT = 5;
const STALE_TIME_MS = 30 * 60 * 1000;     // 30 min — POI data is near-static

export function usePoi(args: UsePoiArgs) {
  const { universityId, campusId, category, limit = DEFAULT_LIMIT } = args;
  return useQuery<Poi[]>({
    queryKey: ['campus-pois', universityId, campusId, category, limit],
    enabled: campusId != null,
    staleTime: STALE_TIME_MS,
    queryFn: async () => {
      const data = await universityService.getCampusPois(universityId, campusId!, {
        category,
        limit,
      });
      return data as Poi[];
    },
  });
}
