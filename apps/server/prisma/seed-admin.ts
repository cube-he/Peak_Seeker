/**
 * 创建管理员账号种子脚本
 * 直接使用 mysql2 连接，绕过 Prisma Client 初始化问题
 *
 * 用法:
 *   cd apps/server
 *   npx tsx prisma/seed-admin.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcrypt';

// 手动加载 .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

// 解析 DATABASE_URL
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL 未设置');
  process.exit(1);
}

// mysql://user:pass@host:port/database
const urlMatch = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
if (!urlMatch) {
  console.error('无法解析 DATABASE_URL:', dbUrl);
  process.exit(1);
}

const [, dbUser, dbPass, dbHost, dbPort, dbName] = urlMatch;

async function main() {
  // 动态导入 mysql2（可能在 node_modules 中）
  let mysql: any;
  try {
    mysql = require('mysql2/promise');
  } catch {
    // 如果没有 mysql2，尝试用 child_process 执行 mysql 命令
    console.log('mysql2 不可用，使用 mysql CLI...');
    await createAdminViaCli();
    return;
  }

  const connection = await mysql.createConnection({
    host: dbHost,
    port: parseInt(dbPort),
    user: dbUser,
    password: dbPass,
    database: dbName,
  });

  const username = 'cube';
  const password = 'Xyt52005201314!';
  const passwordHash = await bcrypt.hash(password, 12);

  // 检查是否已存在
  const [rows] = await connection.execute(
    'SELECT id, role FROM users WHERE username = ?',
    [username]
  );

  if ((rows as any[]).length > 0) {
    await connection.execute(
      'UPDATE users SET role = ? WHERE username = ?',
      ['ADMIN', username]
    );
    console.log(`用户 "${username}" 已存在，已更新为 ADMIN 角色`);
  } else {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await connection.execute(
      `INSERT INTO users (username, password_hash, role, vip_level, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, passwordHash, 'ADMIN', 'EXPERT', now, now]
    );
    console.log('管理员账号创建成功:');
    console.log(`  用户名: ${username}`);
    console.log('  角色: ADMIN');
  }

  await connection.end();
}

async function createAdminViaCli() {
  const { execSync } = require('child_process');
  const username = 'cube';
  const password = 'Xyt52005201314!';
  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // 转义密码中的特殊��符
  const escapedDbPass = dbPass.replace(/!/g, '\\!');

  const sql = `INSERT INTO users (username, password_hash, role, vip_level, created_at, updated_at) VALUES ('${username}', '${passwordHash}', 'ADMIN', 'EXPERT', '${now}', '${now}') ON DUPLICATE KEY UPDATE role='ADMIN';`;

  try {
    execSync(
      `mysql -h ${dbHost} -P ${dbPort} -u ${dbUser} -p'${dbPass}' ${dbName} -e "${sql}"`,
      { stdio: 'inherit' }
    );
    console.log('管理员账号创建成功（via CLI）');
  } catch (e: any) {
    console.error('CLI 创建失败:', e.message);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('创建管理员失败:', e);
  process.exit(1);
});
