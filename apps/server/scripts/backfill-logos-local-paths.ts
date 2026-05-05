/**
 * 一次性脚本：把 universities.logo_url 从外部 chatgk CDN 切换到自托管路径。
 *
 * Source: config/logo-local-paths.json   { enrollCode: '/logos/<id>.webp' }
 * Match key: university.code (即 enrollCode 的字符串)
 * Idempotent: 重跑只是把同样的值写一遍。
 *
 * 跑法（部署后在服务器上）:
 *   cd /home/ubuntu/apps/volunteer-helper && npx ts-node apps/server/scripts/backfill-logos-local-paths.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const MAP_PATH = path.resolve(__dirname, '../../../config/logo-local-paths.json');

async function main() {
  console.log(`[backfill-logos-local] reading ${MAP_PATH}`);
  const mapping = JSON.parse(fs.readFileSync(MAP_PATH, 'utf-8')) as Record<string, string>;
  const entries = Object.entries(mapping);
  console.log(`[backfill-logos-local] ${entries.length} entries in mapping`);

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });

  let matched = 0;
  let updated = 0;
  let skippedNoMatch = 0;

  for (const [enrollCode, localPath] of entries) {
    const target = await prisma.university.findFirst({ where: { code: enrollCode } });
    if (!target) {
      skippedNoMatch++;
      continue;
    }
    matched++;
    if (target.logoUrl !== localPath) {
      await prisma.university.update({
        where: { id: target.id },
        data: { logoUrl: localPath },
      });
      updated++;
    }
    if (matched % 200 === 0) console.log(`  matched ${matched}, updated ${updated}`);
  }

  console.log(
    `[backfill-logos-local] done: matched=${matched}, updated=${updated}, skippedNoMatch=${skippedNoMatch}`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
