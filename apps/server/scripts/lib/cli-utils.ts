import * as cliProgress from 'cli-progress';
import * as fs from 'fs';
import * as path from 'path';

export function makeBar(total: number, label = 'progress'): cliProgress.SingleBar {
  const bar = new cliProgress.SingleBar({
    format: `${label} | {bar} | {percentage}% | {value}/{total} | ETA: {eta}s | OK:{ok} INV:{inv} ERR:{err}`,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  });
  bar.start(total, 0, { ok: 0, inv: 0, err: 0 });
  return bar;
}

export function writeJsonReport(filename: string, data: unknown): string {
  const dir = path.resolve(__dirname, '../../logs');
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(dir, `${filename}-${ts}.json`);
  fs.writeFileSync(target, JSON.stringify(data, null, 2));
  return target;
}

/** Parse `--key=val` and `--key val` style flags. */
export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=', 2);
    if (v !== undefined) {
      out[k] = v;
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      out[k] = argv[++i];
    } else {
      out[k] = true;
    }
  }
  return out;
}
