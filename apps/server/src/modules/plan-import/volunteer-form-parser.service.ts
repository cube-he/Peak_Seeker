import { Injectable } from '@nestjs/common';
import { extractText, getDocumentProxy } from 'unpdf';
import { ParsedForm, ParsedVolunteer, ParsedMajor } from './volunteer-form.types';

@Injectable()
export class VolunteerFormParserService {
  async extractPdfText(buffer: Buffer): Promise<string> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }

  parseFormText(text: string): ParsedForm {
    // 批次: 取开头到首个 "序号" 前的最后一个非空白词
    const idxXuhao = text.indexOf('序号');
    const beforeHeader = idxXuhao > 0 ? text.slice(0, idxXuhao).trim() : '';
    const batchTokens = beforeHeader.split(/\s+/).filter(Boolean);
    const batch = batchTokens[batchTokens.length - 1] || '';

    // 身份字段(只取第一次出现)
    const name = (text.match(/考生姓名：(\S+?)\s/) || [])[1] || '';
    const examNumber = (text.match(/考生号：(\d+)/) || [])[1];
    const idMasked = (text.match(/证件号：(\S+?)\s/) || [])[1];
    const classInfo = (text.match(/(\d+班)/) || [])[1];
    const subjectsRaw = (text.match(/选科组合：(\S+?)\s/) || [])[1] || '';
    const examTypeHint: 'PHYSICS' | 'HISTORY' | undefined =
      subjectsRaw.includes('物理') ? 'PHYSICS' :
      subjectsRaw.includes('历史') ? 'HISTORY' : undefined;

    // 志愿条目: 用 matchAll 取 seq + 块体
    const re = /第一志愿(\d+)\s*（平行志愿）([\s\S]*?)(?=第一志愿\d+\s*（平行志愿）|$)/g;
    const volunteers: ParsedVolunteer[] = [];
    for (const m of text.matchAll(re)) {
      const seq = Number(m[1]);
      const body = m[2].trim();
      const tokens = body.split(/\s+/).filter(Boolean);
      if (tokens.length < 5) continue;
      const schoolCode = tokens[0];
      if (!/^\d{4}$/.test(schoolCode)) continue;
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
      if (groupIdx < 0 || groupIdx === 1) continue;
      const schoolName = tokens.slice(1, groupIdx).join('');
      const groupCode = tokens[groupIdx];
      const adjustIdx = tokens.findIndex((t, i) => i > groupIdx && (t === '是' || t === '否'));
      if (adjustIdx < 0) continue;
      const acceptAdjust = tokens[adjustIdx] === '是';
      const majorsStr = tokens.slice(groupIdx + 1, adjustIdx).join(' ');
      const majors: ParsedMajor[] = majorsStr
        .split('；')
        .map(s => s.trim())
        .filter(Boolean)
        .map(entry => {
          const parts = entry.split(/\s+/);
          const code = parts[0];
          // 专业名拼回来并去掉行内换行产生的多余空格
          const name = parts.slice(1).join('').replace(/\s+/g, '');
          return { code, name };
        });
      volunteers.push({ seq, schoolCode, schoolName, groupCode, majors, acceptAdjust });
    }

    return { batch, identity: { name, examNumber, idMasked, classInfo }, examTypeHint, volunteers };
  }
}
