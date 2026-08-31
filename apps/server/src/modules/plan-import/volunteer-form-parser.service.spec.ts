import { EventEmitter } from 'node:events';
import { matchAdmissionToVolunteerForm } from '../student/admission-match';
import { VolunteerFormParserService } from './volunteer-form-parser.service';

describe('VolunteerFormParserService.parseFormText', () => {
  let service: VolunteerFormParserService;
  let config: { get: jest.Mock };
  beforeEach(() => {
    config = { get: jest.fn() };
    service = new VolunteerFormParserService(config as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const HEADER = '本科批次B段 序号 院校 专业组 专业 是否服从 专业调剂';
  const PAGE_FOOTER = '26510108150957-测试-9班 2026-6-29';
  const IDENTITY =
    '四川省2026年普通高校招生考生志愿表 考生号：26510108150957 性别：女 考生姓名：测试 证件号：510181****0029 外语语种：英语 报考类别：普通类 选科组合：物理,化学,地理 考试类型：全国统考';

  it('解析批次 + 身份(姓名/考生号/证件号/班级/选科) + examTypeHint=PHYSICS', () => {
    const text =
      HEADER + ' 第一志愿01 （平行志愿） 5120 四川师范大学 111 0G 数学与应用数学 是 ' + PAGE_FOOTER + ' ' + IDENTITY;
    const r = service.parseFormText(text);
    expect(r.batch).toBe('本科批次B段');
    expect(r.identity.name).toBe('测试');
    expect(r.identity.examNumber).toBe('26510108150957');
    expect(r.identity.idMasked).toBe('510181****0029');
    expect(r.identity.classInfo).toBe('9班');
    expect(r.examTypeHint).toBe('PHYSICS');
    expect(r.volunteers).toHaveLength(1);
  });

  it('每条志愿: schoolCode/groupCode/majors(；分隔)/acceptAdjust=是→true; seq 来自第一志愿编号', () => {
    const text = HEADER + ' 第一志愿05 （平行志愿） 5002 重庆交通大学 501 40 新能源材料；44 低空技术 是 ' + IDENTITY;
    const r = service.parseFormText(text);
    expect(r.volunteers).toHaveLength(1);
    const v = r.volunteers[0];
    expect(v.seq).toBe(5);
    expect(v.schoolCode).toBe('5002');
    expect(v.schoolName).toBe('重庆交通大学');
    expect(v.groupCode).toBe('501');
    expect(v.acceptAdjust).toBe(true);
    expect(v.majors).toEqual([
      { code: '40', name: '新能源材料', originalOrder: 1 },
      { code: '44', name: '低空技术', originalOrder: 2 },
    ]);
  });

  it('兼容下载版 PDF 的半角括号、志愿编号空格和半角身份字段冒号', () => {
    const identity = IDENTITY.replace('考生号：', '考生号:')
      .replace('考生姓名：', '考生姓名:')
      .replace('证件号：', '证件号:')
      .replace('选科组合：', '选科组合:');
    const text = HEADER + ' 第一志愿 05 (平行志愿) 5002 重庆交通大学 501 40 新能源材料;44 低空技术 是 ' + identity;
    const r = service.parseFormText(text);

    expect(r.identity.name).toBe('测试');
    expect(r.identity.examNumber).toBe('26510108150957');
    expect(r.volunteers).toHaveLength(1);
    expect(r.volunteers[0]).toMatchObject({
      seq: 5,
      schoolCode: '5002',
      schoolName: '重庆交通大学',
      groupCode: '501',
      acceptAdjust: true,
    });
    expect(r.volunteers[0].majors).toEqual([
      { code: '40', name: '新能源材料', originalOrder: 1 },
      { code: '44', name: '低空技术', originalOrder: 2 },
    ]);
  });

  it('兼容第1志愿、全角数字和顺序志愿标记', () => {
    const text = HEADER + ' 第1志愿０６（顺序志愿） 5120 四川师范大学 111 0G 数学与应用数学 服从 ' + IDENTITY;
    const r = service.parseFormText(text);

    expect(r.volunteers).toHaveLength(1);
    expect(r.volunteers[0]).toMatchObject({
      seq: 6,
      schoolCode: '5120',
      schoolName: '四川师范大学',
      groupCode: '111',
      acceptAdjust: true,
    });
  });

  it('兼容志愿标记内被 PDF 插入空格的情况', () => {
    const text = HEADER + ' 第 一 志 愿 07 （ 平 行 志 愿 ） 5102 成都理工大学 112 1M 数学 否 ' + IDENTITY;
    const r = service.parseFormText(text);

    expect(r.volunteers).toHaveLength(1);
    expect(r.volunteers[0]).toMatchObject({
      seq: 7,
      schoolCode: '5102',
      schoolName: '成都理工大学',
      groupCode: '112',
      acceptAdjust: false,
    });
  });

  it('行内换行空格清理: "水利水 电工程" → "水利水电工程"; "电子商 务" → "电子商务"', () => {
    const text =
      HEADER + ' 第一志愿01 （平行志愿） 5002 重庆交通大学 501 11 水利水 电工程；45 电子商 务 是 ' + IDENTITY;
    const r = service.parseFormText(text);
    expect(r.volunteers[0].majors).toEqual([
      { code: '11', name: '水利水电工程', originalOrder: 1 },
      { code: '45', name: '电子商务', originalOrder: 2 },
    ]);
  });

  it('保留未解析的专业槽位，后续专业的原始顺序不会被压缩', () => {
    const text = HEADER + ' 第一志愿01 （平行志愿） 5002 重庆交通大学 501 ;44 低空技术; 是 ' + IDENTITY;
    const r = service.parseFormText(text);

    expect(r.volunteers[0].majors).toEqual([
      { code: '', name: '', originalOrder: 1 },
      { code: '44', name: '低空技术', originalOrder: 2 },
    ]);
  });

  it('acceptAdjust=否 → false', () => {
    const text = HEADER + ' 第一志愿01 （平行志愿） 5120 四川师范大学 111 0G 数学 否 ' + IDENTITY;
    const r = service.parseFormText(text);
    expect(r.volunteers[0].acceptAdjust).toBe(false);
  });

  it('翻页噪声(页脚 + 页头重复)出现在志愿之间不影响解析, 仍按 seq 顺序', () => {
    const text =
      HEADER +
      ' 第一志愿01 （平行志愿） 5120 四川师范大学 111 0G 数学 是 ' +
      PAGE_FOOTER +
      ' ' +
      IDENTITY +
      ' ' +
      HEADER +
      ' 第一志愿02 （平行志愿） 5102 成都理工大学 112 1M 数学 是 ' +
      PAGE_FOOTER;
    const r = service.parseFormText(text);
    expect(r.volunteers.map((v) => v.seq)).toEqual([1, 2]);
    expect(r.volunteers.map((v) => v.schoolCode)).toEqual(['5120', '5102']);
  });

  it('院校名跨行被 PDF 切成多 token 仍解析对(组代码定位法; 兼容"南京财经大学红 山学院")', () => {
    const text = HEADER + ' 第一志愿33 （平行志愿） 3916 南京财经大学红 山学院 102 0G 税收学 是 ' + IDENTITY;
    const r = service.parseFormText(text);
    expect(r.volunteers).toHaveLength(1);
    const v = r.volunteers[0];
    expect(v.seq).toBe(33);
    expect(v.schoolCode).toBe('3916');
    expect(v.schoolName).toBe('南京财经大学红山学院');
    expect(v.groupCode).toBe('102');
    expect(v.majors).toEqual([{ code: '0G', name: '税收学', originalOrder: 1 }]);
  });

  it('examTypeHint: 选科组合含历史 → HISTORY', () => {
    const IDENT_HIST = IDENTITY.replace('物理,化学,地理', '历史,政治,地理');
    const text = HEADER + ' 第一志愿01 （平行志愿） 5120 四川师范大学 111 0G 数学 是 ' + IDENT_HIST;
    expect(service.parseFormText(text).examTypeHint).toBe('HISTORY');
  });

  it('examTypeHint: 身份块缺选科时, 可从 PDF 表头的物理类/历史类推断', () => {
    const identityWithoutSubjects =
      '四川省2026年普通高校招生考生志愿表 考生号：26510108150957 考生姓名：测试 证件号：510181****0029';
    const text =
      '物理类专科批次 序号 院校 专业组 专业 是否服从 专业调剂' +
      ' 第一志愿01 （平行志愿） 5120 四川师范大学 111 0G 数学 是 ' +
      identityWithoutSubjects;

    const r = service.parseFormText(text);

    expect(r.batch).toBe('物理类专科批次');
    expect(r.examTypeHint).toBe('PHYSICS');
    expect(r.volunteers).toHaveLength(1);
  });

  it('拒绝超过 20MB 或 magic 不是 PDF 的文件，不进入解析 worker', async () => {
    const createWorker = jest.spyOn(service as any, 'createPdfTextWorker');

    await expect(service.extractPdfText(Buffer.from('not-a-pdf'))).rejects.toThrow('不是有效的 PDF');
    await expect(service.extractPdfText(Buffer.alloc(20 * 1024 * 1024 + 1, 0x25))).rejects.toThrow(
      '不能超过 20MB',
    );
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('unpdf worker 超时会被真正 terminate，并返回空文字触发 OCR 兜底', async () => {
    jest.useFakeTimers();
    const worker = new EventEmitter() as EventEmitter & { terminate: jest.Mock };
    worker.terminate = jest.fn().mockResolvedValue(0);
    jest.spyOn(service as any, 'createPdfTextWorker').mockReturnValue(worker);

    const resultPromise = service.extractPdfText(Buffer.from('%PDF-1.7\n'));
    await jest.advanceTimersByTimeAsync(15_000);

    await expect(resultPromise).resolves.toBe('');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('unpdf 识别到超过 20 页时拒绝文件，不降级为无边界 OCR', async () => {
    const worker = new EventEmitter() as EventEmitter & { terminate: jest.Mock };
    worker.terminate = jest.fn().mockResolvedValue(0);
    jest.spyOn(service as any, 'createPdfTextWorker').mockReturnValue(worker);

    const resultPromise = service.extractPdfText(Buffer.from('%PDF-1.7\n'));
    worker.emit('message', { ok: false, code: 'PAGE_LIMIT' });

    await expect(resultPromise).rejects.toThrow('不能超过 20 页');
  });

  it('OCR 未证明六个完整唯一原始槽时保留组，但把专业顺序标为不可自动确认', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        identity: { name: '测试' },
        batch: '本科批次B段',
        examTypeHint: 'PHYSICS',
        volunteers: [
          {
            seq: 18,
            schoolCode: '5122',
            schoolName: '西华师范大学',
            groupCode: '105',
            majors: [
              { code: '32', name: '数学与应用数学', originalOrder: 1 },
              { code: '44', name: '物理学', originalOrder: 2 },
            ],
            acceptAdjust: true,
          },
        ],
      }),
    } as any);

    const result = await service.parsePdfWithOcr(Buffer.from('%PDF-1.7\n'));

    expect(result.volunteers).toHaveLength(1);
    expect(result.volunteers[0]).toMatchObject({ seq: 18, schoolCode: '5122', groupCode: '105' });
    expect(result.volunteers[0].majors.map((major) => major.originalOrder)).toEqual([0, 0]);
    const match = matchAdmissionToVolunteerForm(
      {
        batchName: '本科批次B段',
        universityCode: '5122',
        universityName: '西华师范大学',
        groupCode: '105',
        majorCode: '32',
        majorName: '数学与应用数学',
      },
      result,
    );
    expect(match.status).toBe('REVIEW_REQUIRED');
    expect(match.sequenceNo).toBe(18);
    expect(match.majorSequenceNo).toBeNull();
  });

  it('OCR 只有在六个槽位、代码和名称均完整唯一时才保留专业顺序', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        identity: { name: '测试' },
        batch: '本科批次B段',
        volunteers: [
          {
            seq: 18,
            schoolCode: '5122',
            schoolName: '西华师范大学',
            groupCode: '105',
            majors: Array.from({ length: 6 }, (_, index) => ({
              code: String(32 + index),
              name: `专业${index + 1}`,
              originalOrder: index + 1,
            })),
            acceptAdjust: true,
          },
        ],
      }),
    } as any);

    const result = await service.parsePdfWithOcr(Buffer.from('%PDF-1.7\n'));

    expect(result.volunteers[0].majors.map((major) => major.originalOrder)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('OCR 返回七个条目时不会截取前六个后误判为完整六槽', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        identity: { name: '测试' },
        batch: '本科批次B段',
        volunteers: [
          {
            seq: 18,
            schoolCode: '5122',
            schoolName: '西华师范大学',
            groupCode: '105',
            majors: Array.from({ length: 7 }, (_, index) => ({
              code: String(31 + index),
              name: `专业${index + 1}`,
              originalOrder: index + 1,
            })),
            acceptAdjust: true,
          },
        ],
      }),
    } as any);

    const result = await service.parsePdfWithOcr(Buffer.from('%PDF-1.7\n'));

    expect(result.volunteers[0].majors).toHaveLength(6);
    expect(result.volunteers[0].majors.map((major) => major.originalOrder)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
