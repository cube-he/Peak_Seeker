/**
 * 批量创建老师演示账号（服务器端直插数据库，幂等）。
 *
 * 编号按姓首字母 H→L→W→Z，同字母按全拼；初始密码 123456；role=TEACHER + 空 teacherProfile。
 *
 * 运行（在 apps/server 目录，需 DATABASE_URL）:
 *   pnpm seed:teachers
 *   # 等价于 ts-node -r dotenv/config scripts/create-teacher-accounts.ts
 *
 * 幂等：用户名已存在则跳过，不覆盖已有密码。
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcrypt';

// 兜底加载 apps/server/.env（已通过 dotenv/config 注入时此处为 no-op）
if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)\s*=\s*"?([^"]+)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('缺少 DATABASE_URL');
  process.exit(1);
}

const adapter = new PrismaMariaDb(DATABASE_URL);
const prisma = new PrismaClient({ adapter } as any);

const PASSWORD = '123456';

// [username 编号, 真实姓名]
const TEACHERS: Array<[string, string]> = [
  ['001', '贺红'],
  ['002', '黄登森'],
  ['003', '刘汉宇'],
  ['004', '刘怡'],
  ['005', '罗老师'],
  ['006', '罗艳飞'],
  ['007', '王老师'],
  ['008', '魏路顺'],
  ['009', '张子强'],
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const [username, realName] of TEACHERS) {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      console.log(`- 跳过  ${username}  ${realName}  (已存在)`);
      skipped++;
      continue;
    }
    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    await prisma.user.create({
      data: {
        username,
        passwordHash,
        realName,
        role: Role.TEACHER,
        teacherProfile: { create: {} },
      },
    });
    console.log(`✓ 创建  ${username}  ${realName}`);
    created++;
  }

  console.log(`\n完成: 新建 ${created}, 跳过 ${skipped}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
