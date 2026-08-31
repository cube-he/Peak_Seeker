import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'node:worker_threads';
import { ParsedForm, ParsedVolunteer, ParsedMajor } from './volunteer-form.types';

const MAX_VOLUNTEER_PDF_BYTES = 20 * 1024 * 1024;
const MAX_VOLUNTEER_PDF_PAGES = 20;
const MAX_VOLUNTEER_PDF_TEXT_CHARS = 2_000_000;
const DEFAULT_PDF_TEXT_TIMEOUT_MS = 15_000;
const OCR_REQUEST_TIMEOUT_MS = 120_000;

class VolunteerPdfInputRejectedError extends Error {}

type PdfWorkerMessage =
  | { ok: true; text: string }
  | { ok: false; code: 'PAGE_LIMIT' | 'TEXT_LIMIT' | 'PARSE_FAILED' };

const PDF_TEXT_WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require('node:worker_threads');

(async () => {
  let pdf;
  try {
    const { extractText, getDocumentProxy } = require(workerData.unpdfModulePath);
    pdf = await getDocumentProxy(new Uint8Array(workerData.pdfBytes));
    if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1) {
      parentPort.postMessage({ ok: false, code: 'PARSE_FAILED' });
      return;
    }
    if (pdf.numPages > workerData.maxPages) {
      parentPort.postMessage({ ok: false, code: 'PAGE_LIMIT' });
      return;
    }
    const { text } = await extractText(pdf, { mergePages: true });
    if (typeof text !== 'string' || text.length > workerData.maxTextChars) {
      parentPort.postMessage({ ok: false, code: 'TEXT_LIMIT' });
      return;
    }
    parentPort.postMessage({ ok: true, text });
  } catch {
    parentPort.postMessage({ ok: false, code: 'PARSE_FAILED' });
  } finally {
    if (pdf && typeof pdf.destroy === 'function') {
      try { await pdf.destroy(); } catch {}
    }
  }
})();
`;

@Injectable()
export class VolunteerFormParserService {
  constructor(private config: ConfigService) {}

  async extractPdfText(buffer: Buffer): Promise<string> {
    this.assertSafePdfBuffer(buffer);
    try {
      return await this.runPdfTextWorker(buffer);
    } catch (error) {
      if (error instanceof VolunteerPdfInputRejectedError) throw error;
      // A scanned, malformed, encrypted or slow text layer is not conclusive.
      // Returning blank text preserves the existing OCR fallback path in both
      // the import preview and admission matching flows.
      return '';
    }
  }

  /**
   * 解析已归档的志愿表。带文字层的 PDF 优先本地解析；扫描 PDF/图片再走 OCR。
   * 返回解析来源，供录取匹配证据留痕。
   */
  async parseAttachment(
    buffer: Buffer,
    filename = 'volunteer-form.pdf',
    mimeType = 'application/pdf',
  ): Promise<{ form: ParsedForm; source: 'pdf-text' | 'ocr' }> {
    const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      this.assertSafePdfBuffer(buffer);
      try {
        const text = await this.extractPdfText(buffer);
        if (text.replace(/\s+/g, '').length > 20) {
          const form = this.parseFormText(text);
          if (form.volunteers.length > 0) return { form, source: 'pdf-text' };
        }
      } catch (error) {
        if (error instanceof VolunteerPdfInputRejectedError) throw error;
        // 图片型 PDF 或损坏的文字层交给 OCR 兜底。
      }
    }

    return {
      form: await this.parsePdfWithOcr(buffer, filename, mimeType),
      source: 'ocr',
    };
  }

  async parsePdfWithOcr(
    buffer: Buffer,
    filename = 'volunteer-form.pdf',
    mimeType = 'application/pdf',
  ): Promise<ParsedForm> {
    if (buffer.length > MAX_VOLUNTEER_PDF_BYTES) {
      throw new VolunteerPdfInputRejectedError('志愿填报文件不能超过 20MB');
    }
    const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
    if (isPdf) this.assertSafePdfBuffer(buffer);

    const ocrServiceUrl = this.config.get<string>('OCR_SERVICE_URL') || 'http://127.0.0.1:8100';
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

    const resp = await fetch(`${ocrServiceUrl}/parse-volunteer-form`, {
      method: 'POST',
      body: form as any,
      signal: AbortSignal.timeout(OCR_REQUEST_TIMEOUT_MS),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `OCR 服务请求失败: ${resp.status}`);
    }

    const parsed = (await resp.json()) as ParsedForm;
    return {
      identity: parsed.identity ?? { name: '' },
      batch: parsed.batch ?? '',
      examTypeHint:
        parsed.examTypeHint === 'PHYSICS' || parsed.examTypeHint === 'HISTORY' ? parsed.examTypeHint : undefined,
      volunteers: this.sanitizeOcrVolunteers(parsed.volunteers),
    };
  }

  private assertSafePdfBuffer(buffer: Buffer): void {
    if (!buffer.length) {
      throw new VolunteerPdfInputRejectedError('志愿填报 PDF 不能为空');
    }
    if (buffer.length > MAX_VOLUNTEER_PDF_BYTES) {
      throw new VolunteerPdfInputRejectedError('志愿填报 PDF 不能超过 20MB');
    }
    const header = buffer.subarray(0, 1024).toString('latin1').replace(/^[\x00\x09\x0a\x0d\x20]+/, '');
    if (!header.startsWith('%PDF-')) {
      throw new VolunteerPdfInputRejectedError('文件内容不是有效的 PDF');
    }
  }

  private runPdfTextWorker(buffer: Buffer): Promise<string> {
    const ownedBytes = Uint8Array.from(buffer);
    const worker = this.createPdfTextWorker(ownedBytes);
    const configuredTimeout = Number(this.config.get<string>('VOLUNTEER_PDF_TEXT_TIMEOUT_MS'));
    const timeoutMs =
      Number.isFinite(configuredTimeout) && configuredTimeout >= 1_000 && configuredTimeout <= 60_000
        ? configuredTimeout
        : DEFAULT_PDF_TEXT_TIMEOUT_MS;

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.removeAllListeners();
        callback();
      };
      const timer = setTimeout(() => {
        finish(() => {
          void worker.terminate();
          reject(new Error('志愿填报 PDF 文字层解析超时'));
        });
      }, timeoutMs);

      worker.once('message', (message: PdfWorkerMessage) => {
        finish(() => {
          // The result has crossed the worker boundary; terminate immediately
          // so even a pathological pdf.destroy() cannot leave a worker behind.
          void worker.terminate();
          if (message.ok) {
            resolve(message.text);
          } else if (message.code === 'PAGE_LIMIT') {
            reject(new VolunteerPdfInputRejectedError(`志愿填报 PDF 不能超过 ${MAX_VOLUNTEER_PDF_PAGES} 页`));
          } else if (message.code === 'TEXT_LIMIT') {
            reject(new VolunteerPdfInputRejectedError('志愿填报 PDF 文字内容异常过大'));
          } else {
            reject(new Error('志愿填报 PDF 文字层解析失败'));
          }
        });
      });
      worker.once('error', () => finish(() => reject(new Error('志愿填报 PDF 文字层解析失败'))));
      worker.once('exit', () => finish(() => reject(new Error('志愿填报 PDF 文字层解析失败'))));
    });
  }

  private createPdfTextWorker(pdfBytes: Uint8Array): Worker {
    return new Worker(PDF_TEXT_WORKER_SOURCE, {
      eval: true,
      workerData: {
        pdfBytes,
        unpdfModulePath: require.resolve('unpdf'),
        maxPages: MAX_VOLUNTEER_PDF_PAGES,
        maxTextChars: MAX_VOLUNTEER_PDF_TEXT_CHARS,
      },
      transferList: [pdfBytes.buffer as ArrayBuffer],
      resourceLimits: {
        maxOldGenerationSizeMb: 192,
        maxYoungGenerationSizeMb: 32,
        stackSizeMb: 4,
      },
    });
  }

  private sanitizeOcrVolunteers(value: unknown): ParsedVolunteer[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
      .map((entry) => {
        const rawMajors = Array.isArray(entry.majors) ? entry.majors : [];
        const majors = rawMajors
          .filter((major): major is Record<string, unknown> => Boolean(major && typeof major === 'object'))
          .slice(0, 6)
          .map((major) => ({
            code: typeof major.code === 'string' ? major.code : '',
            name: typeof major.name === 'string' ? major.name : '',
            originalOrder: Number(major.originalOrder),
          }));
        const orders = majors.map((major) => major.originalOrder);
        const normalizedCodes = majors.map((major) => this.normalizeMajorEvidence(major.code, true));
        const normalizedNames = majors.map((major) => this.normalizeMajorEvidence(major.name, false));
        const hasProvenSixSlots =
          rawMajors.length === 6 &&
          majors.length === 6 &&
          orders.every((order) => Number.isInteger(order) && order >= 1 && order <= 6) &&
          new Set(orders).size === 6 &&
          normalizedCodes.every(Boolean) &&
          normalizedNames.every(Boolean) &&
          new Set(normalizedCodes).size === 6 &&
          new Set(normalizedNames).size === 6;

        return {
          seq: Number(entry.seq),
          schoolCode: typeof entry.schoolCode === 'string' ? entry.schoolCode : '',
          schoolName: typeof entry.schoolName === 'string' ? entry.schoolName : '',
          groupCode: typeof entry.groupCode === 'string' ? entry.groupCode : '',
          // originalOrder=0 is an explicit "unproven" marker understood by
          // the matcher: the group remains usable, but no professional order
          // or adjustment conclusion can be auto-confirmed.
          majors: majors.map((major) => ({
            code: major.code,
            name: major.name,
            originalOrder: hasProvenSixSlots ? major.originalOrder : 0,
          })),
          acceptAdjust: entry.acceptAdjust === true,
        } satisfies ParsedVolunteer;
      })
      .filter(
        (entry) =>
          Number.isInteger(entry.seq) &&
          entry.seq > 0 &&
          Boolean(entry.schoolCode && entry.schoolName && entry.groupCode),
      );
  }

  private normalizeMajorEvidence(value: string, code: boolean): string {
    const normalized = value.normalize('NFKC').replace(/\s+/g, '').trim();
    return code ? normalized.toUpperCase() : normalized;
  }

  parseFormText(text: string): ParsedForm {
    const normalizedText = this.normalizeText(text);
    const batch = this.extractBatch(normalizedText);

    // 身份字段(只取第一次出现)
    const name = (normalizedText.match(/考生姓名\s*[:：]\s*(\S+?)\s/) || [])[1] || '';
    const examNumber = (normalizedText.match(/考生号\s*[:：]\s*(\d+)/) || [])[1];
    const idMasked = (normalizedText.match(/证件号\s*[:：]\s*(\S+?)\s/) || [])[1];
    const classInfo = (normalizedText.match(/(\d+班)/) || [])[1];
    const subjectsRaw = (normalizedText.match(/选科组合\s*[:：]\s*(\S+?)\s/) || [])[1] || '';
    const examTypeHint: 'PHYSICS' | 'HISTORY' | undefined = subjectsRaw.includes('物理')
      ? 'PHYSICS'
      : subjectsRaw.includes('历史')
        ? 'HISTORY'
        : /物理类/.test(`${batch} ${normalizedText.slice(0, 300)}`)
          ? 'PHYSICS'
          : /历史类/.test(`${batch} ${normalizedText.slice(0, 300)}`)
            ? 'HISTORY'
            : undefined;

    // 志愿条目: 下载版 PDF 的文字层会在括号、数字、"平行志愿"之间产生格式差异。
    const markers = this.findVolunteerMarkers(normalizedText);
    const volunteers: ParsedVolunteer[] = [];
    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i];
      const next = markers[i + 1];
      const body = normalizedText.slice(marker.end, next?.start ?? normalizedText.length).trim();
      const volunteer = this.parseVolunteerBody(marker.seq, body);
      if (volunteer) {
        volunteers.push(volunteer);
      }
    }

    return { batch, identity: { name, examNumber, idMasked, classInfo }, examTypeHint, volunteers };
  }

  private normalizeText(text: string): string {
    return text
      .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
      .replace(/\u00a0/g, ' ')
      .replace(/[，]/g, ',')
      .replace(/[；]/g, ';');
  }

  private extractBatch(text: string): string {
    // 批次: 优先取开头到首个 "序号" 前的最后一个非空白词。
    const idxXuhao = text.indexOf('序号');
    const beforeHeader = idxXuhao > 0 ? text.slice(0, idxXuhao).trim() : '';
    const batchTokens = beforeHeader.split(/\s+/).filter(Boolean);
    const batch = batchTokens[batchTokens.length - 1] || '';
    if (batch) {
      return batch;
    }

    const compactHead = text.slice(0, 500).replace(/\s+/g, '');
    return (
      (compactHead.match(
        /(?:普通类)?(?:物理类|历史类)?(?:本科批次?[AB]段|本科提前批次?[AB]?段?|本科批次?高校专项计划|高职[（(]?专科[）)]?提前批次?|高职[（(]?专科[）)]?批次?|专科提前批次?|专科批次?)/,
      ) || [])[0] || ''
    );
  }

  private findVolunteerMarkers(text: string): { seq: number; start: number; end: number }[] {
    const markerRe = /第\s*(?:一|1)\s*志\s*愿\s*(\d{1,3})\s*(?:[（(]\s*(?:平\s*行|顺\s*序)\s*志\s*愿\s*[）)])?/g;
    return [...text.matchAll(markerRe)].map((match) => ({
      seq: Number(match[1]),
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    }));
  }

  private parseVolunteerBody(seq: number, body: string): ParsedVolunteer | null {
    const tokens = body.split(/\s+/).filter(Boolean);
    if (tokens.length < 5) return null;
    const schoolCode = tokens[0];
    if (!/^\d{4}$/.test(schoolCode)) return null;
    // 院校名可能被 PDF 行内换行切成多 token (如 "南京财经大学红 山学院"),
    // 不能假设 tokens[1] 就是完整院校名。扫第一个 3 位数字 token = 组代码位置,
    // 院校名 = 中间所有 token 拼起来 (去空白)。
    let groupIdx = -1;
    for (let i = 1; i < tokens.length; i++) {
      if (/^\d{3}$/.test(tokens[i])) {
        groupIdx = i;
        break;
      }
    }
    if (groupIdx < 0 || groupIdx === 1) return null;
    const schoolName = tokens.slice(1, groupIdx).join('');
    const groupCode = tokens[groupIdx];
    const adjustIdx = tokens.findIndex((t, i) => i > groupIdx && /^(是|否|服从|不服从)$/.test(t));
    if (adjustIdx < 0) return null;
    const acceptAdjust = tokens[adjustIdx] === '是' || tokens[adjustIdx] === '服从';
    const majorsStr = tokens.slice(groupIdx + 1, adjustIdx).join(' ');
    const majorEntries = majorsStr.split(';').map((s) => s.trim());
    // A trailing delimiter is formatting, not a seventh slot. Internal empty
    // segments are retained because they represent a failed/blank major slot.
    while (majorEntries.length > 0 && majorEntries[majorEntries.length - 1] === '') {
      majorEntries.pop();
    }
    const majors: ParsedMajor[] = majorEntries.map((entry, index) => {
      const parts = entry.split(/\s+/);
      const code = parts[0] ?? '';
      // 专业名拼回来并去掉行内换行产生的多余空格
      const name = parts.slice(1).join('').replace(/\s+/g, '');
      return { code, name, originalOrder: index + 1 };
    });
    return { seq, schoolCode, schoolName, groupCode, majors, acceptAdjust };
  }
}
