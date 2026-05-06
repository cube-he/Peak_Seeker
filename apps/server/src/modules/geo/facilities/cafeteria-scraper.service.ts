import { Injectable } from '@nestjs/common';
import { AmapClient } from '../amap/amap.client';
import { PrismaService } from '@/prisma/prisma.service';
import { FacilityScorer, ScorerPoi } from './facility-scorer.service';

export interface ScrapeOneInput {
  universityId: number;
  universityName: string;
  city?: string;
}

export interface ScraperResult {
  fetched: number;
  accepted: number;
  rejected: number;
  written: number;
}

@Injectable()
export class CafeteriaScraper {
  constructor(
    private readonly amap: AmapClient,
    private readonly prisma: PrismaService,
    private readonly scorer: FacilityScorer,
  ) {}

  async scrapeOne(input: ScrapeOneInput): Promise<ScraperResult> {
    const campusRows = await this.prisma.universityCampus.findMany({
      where: {
        universityId: input.universityId,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: { id: true, latitude: true, longitude: true },
    });
    if (campusRows.length === 0) {
      return { fetched: 0, accepted: 0, rejected: 0, written: 0 };
    }
    const campuses = campusRows.map((c) => ({
      id: c.id,
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
    }));

    const pois = await this.amap.searchPlaceText(
      `${input.universityName}食堂`,
      { city: input.city },
    );
    if (pois.length === 0) {
      return { fetched: 0, accepted: 0, rejected: 0, written: 0 };
    }

    const scorerInput: ScorerPoi[] = pois.map((p) => ({
      id: p.id,
      name: p.name,
      typecode: p.typecode,
      location: p.location,
      address: typeof p.address === 'string' ? p.address : undefined,
    }));
    const scored = this.scorer.score(scorerInput, campuses, input.universityName);

    let written = 0;
    const now = new Date();
    for (const s of scored) {
      if (!s.accept) continue;
      await this.prisma.universityCampusFacility.upsert({
        where: { campusId_amapId: { campusId: s.campusId, amapId: s.amapId } },
        update: { obsolete: false, fetchedAt: now },
        create: {
          campusId: s.campusId,
          amapId: s.amapId,
          category: 'cafeteria',
          name: s.name,
          typecode: s.typecode,
          latitude: s.latitude as any,
          longitude: s.longitude as any,
          address: s.address,
          distanceMeters: s.distanceMeters,
          confidence: s.confidence!,
          matchMethod: s.matchMethod!,
          source: 'amap_text',
          fetchedAt: now,
        },
      });
      written += 1;
    }

    const accepted = scored.filter((s) => s.accept).length;
    return {
      fetched: pois.length,
      accepted,
      rejected: scored.length - accepted,
      written,
    };
  }
}
