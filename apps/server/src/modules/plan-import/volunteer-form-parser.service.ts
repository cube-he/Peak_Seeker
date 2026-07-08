import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extractText, getDocumentProxy } from 'unpdf';
import { ParsedForm, ParsedVolunteer, ParsedMajor } from './volunteer-form.types';

@Injectable()
export class VolunteerFormParserService {
  constructor(private config: ConfigService) {}

  async extractPdfText(buffer: Buffer): Promise<string> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }

  async parsePdfWithOcr(buffer: Buffer, filename = 'volunteer-form.pdf'): Promise<ParsedForm> {
    const ocrServiceUrl = this.config.get<string>('OCR_SERVICE_URL') || 'http://127.0.0.1:8100';
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), filename);

    const resp = await fetch(`${ocrServiceUrl}/parse-volunteer-form`, {
      method: 'POST',
      body: form as any,
      signal: AbortSignal.timeout(3 * 60_000),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `OCR 服务请求失败: ${resp.status}`);
    }

    const parsed = await resp.json() as ParsedForm;
    return {
      identity: parsed.identity ?? { name: '' },
      batch: parsed.batch ?? '',
      examTypeHint: parsed.examTypeHint === 'PHYSICS' || parsed.examTypeHint === 'HISTORY' ? parsed.examTypeHint : undefined,
      volunteers: Array.isArray(parsed.volunteers) ? parsed.volunteers : [],
    };
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
    const examTypeHint: 'PHYSICS' | 'HISTORY' | undefined =
      subjectsRaw.includes('物理') ? 'PHYSICS' :
      subjectsRaw.includes('历史') ? 'HISTORY' :
      /物理类/.test(`${batch} ${normalizedText.slice(0, 300)}`) ? 'PHYSICS' :
      /历史类/.test(`${batch} ${normalizedText.slice(0, 300)}`) ? 'HISTORY' : undefined;

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
      .replace(/[０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
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
    return (compactHead.match(/(?:普通类)?(?:物理类|历史类)?(?:本科批次?[AB]段|本科提前批次?[AB]?段?|本科批次?高校专项计划|高职[（(]?专科[）)]?提前批次?|高职[（(]?专科[）)]?批次?|专科提前批次?|专科批次?)/) || [])[0] || '';
  }

  private findVolunteerMarkers(text: string): { seq: number; start: number; end: number }[] {
    const markerRe = /第\s*(?:一|1)\s*志\s*愿\s*(\d{1,3})\s*(?:[（(]\s*(?:平\s*行|顺\s*序)\s*志\s*愿\s*[）)])?/g;
    return [...text.matchAll(markerRe)].map(match => ({
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
    const majors: ParsedMajor[] = majorsStr
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
      .map(entry => {
        const parts = entry.split(/\s+/);
        const code = parts[0];
        // 专业名拼回来并去掉行内换行产生的多余空格
        const name = parts.slice(1).join('').replace(/\s+/g, '');
        return { code, name };
      });
    return { seq, schoolCode, schoolName, groupCode, majors, acceptAdjust };
  }
}
